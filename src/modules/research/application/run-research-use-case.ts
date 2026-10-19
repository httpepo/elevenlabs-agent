import { randomUUID } from "node:crypto";
import type { LeadRecord } from "../../leads/domain/lead.ts";
import type { LeadRepository } from "../../leads/ports/lead-repository.ts";
import type { ResearchSource, GeneratedBriefing, ResearchGap } from "../domain/briefing.ts";
import {
  validateGeneratedBriefing,
} from "../domain/briefing.ts";
import { IdentityResolver, type IdentityResolution } from "../domain/identity-resolution.ts";
import { isTerminalResearchStatus, type ResearchRun } from "../domain/research-run.ts";
import { BriefingGenerationError, type BriefingGenerator } from "../ports/briefing-generator.ts";
import { ResearchProviderError, type ResearchProvider } from "../ports/research-provider.ts";
import type { ResearchRepository } from "../ports/research-repository.ts";

export type RunResearchInput = { leadId: string; researchRunId: string };

export class RunResearchUseCase {
  private readonly identityResolver = new IdentityResolver();
  private readonly leads: LeadRepository;
  private readonly research: ResearchRepository;
  private readonly provider: ResearchProvider;
  private readonly briefingGenerator: BriefingGenerator;

  constructor(
    leads: LeadRepository,
    research: ResearchRepository,
    provider: ResearchProvider,
    briefingGenerator: BriefingGenerator,
  ) {
    this.leads = leads;
    this.research = research;
    this.provider = provider;
    this.briefingGenerator = briefingGenerator;
  }

  async execute(input: RunResearchInput): Promise<ResearchRun> {
    const lead = await this.leads.get(input.leadId);
    if (!lead) throw new Error("Visitante não encontrado.");
    const queuedRun = await this.research.getRun(input.researchRunId);
    if (!queuedRun) throw new Error("Execução de pesquisa não encontrada.");
    if (queuedRun.leadId !== lead.id || queuedRun.executionId !== lead.executionId) {
      throw new Error("Execução de pesquisa não pertence ao visitante.");
    }
    if (isTerminalResearchStatus(queuedRun.status)) return queuedRun;
    if (queuedRun.status === "running") return queuedRun;

    const startedAt = Date.now();
    const runningRun = await this.research.transitionRun({ runId: queuedRun.id, status: "running" });
    await this.updateLeadProjection(lead, runningRun, []);
    try {
      const identity = this.identityResolver.resolve(lead.normalized);
      const search = await this.searchSources(lead, runningRun, identity);
      const resolvedIdentity = this.identityResolver.assessCompanyResults(identity, lead.normalized, search.results);
      const sources = createSources(lead, runningRun, search.results);
      await this.research.saveSources(sources);

      const generated = await this.generateBriefing(lead, runningRun, sources, resolvedIdentity, search.error);
      const safeBriefing = validateGeneratedBriefing(generated, new Set(sources.map((source) => source.id)));
      const status = resolvedIdentity.isAmbiguous || search.error || sources.length === 0 ? "partial" : "ready";
      const briefing = await this.research.createBriefing({
        leadId: lead.id,
        researchRunId: runningRun.id,
        executionId: lead.executionId,
        status,
        summary: safeBriefing.summary,
        facts: addFormFacts(safeBriefing.facts, lead),
        hypotheses: addIdentityHypothesis(safeBriefing.hypotheses, resolvedIdentity),
        gaps: addDeterministicGaps(safeBriefing.gaps, resolvedIdentity, search.error, sources.length),
      });
      const completedRun = await this.research.transitionRun({
        runId: runningRun.id,
        status,
        errorMessage: search.error,
        executionTimeMs: Date.now() - startedAt,
      });
      await this.updateLeadProjection(lead, completedRun, sources, briefing);
      return completedRun;
    } catch (error) {
      const currentRun = await this.research.getRun(runningRun.id);
      if (currentRun?.status === "running") {
        const message = safeErrorMessage(error, "A pesquisa não pôde ser concluída.");
        const failedRun = await this.research.transitionRun({
          runId: runningRun.id,
          status: "failed",
          errorMessage: message,
          executionTimeMs: Date.now() - startedAt,
        });
        await this.updateLeadProjection(lead, failedRun, []);
      }
      throw error;
    }
  }

  private async searchSources(
    lead: LeadRecord,
    run: ResearchRun,
    identity: IdentityResolution,
  ): Promise<{ results: Awaited<ReturnType<ResearchProvider["search"]>>; error: string | null }> {
    const startedAt = Date.now();
    try {
      const results = await this.provider.search({ queries: identity.queries, timeoutMs: 6_000 });
      await this.audit({
        lead,
        run,
        provider: "tavily",
        operation: "search",
        status: "success",
        durationMs: Date.now() - startedAt,
        input: { queries: identity.queries, timeoutMs: 6_000 },
        output: { sources: results.map((result) => ({ url: result.url, title: result.title })).slice(0, 15) },
      });
      return { results, error: null };
    } catch (error) {
      const providerError = error instanceof ResearchProviderError ? error : null;
      const message = safeErrorMessage(error, "A pesquisa pública não pôde ser concluída.");
      await this.audit({
        lead,
        run,
        provider: "tavily",
        operation: "search",
        status: providerError?.kind === "timeout" ? "timeout" : "failed",
        durationMs: Date.now() - startedAt,
        input: { queries: identity.queries, timeoutMs: 6_000 },
        output: { error: message },
      });
      return { results: [], error: message };
    }
  }

  private async generateBriefing(
    lead: LeadRecord,
    run: ResearchRun,
    sources: ResearchSource[],
    identity: IdentityResolution,
    searchError: string | null,
  ): Promise<GeneratedBriefing> {
    const startedAt = Date.now();
    try {
      const result = await this.briefingGenerator.generate({
        lead: lead.normalized,
        sources,
        identity,
        searchError,
      });
      await this.audit({
        lead,
        run,
        provider: "gemini",
        operation: "generate_briefing",
        status: "success",
        durationMs: Date.now() - startedAt,
        input: { sourceCount: sources.length, hasSearchError: Boolean(searchError) },
        output: { summary: result.summary.slice(0, 500), factCount: result.facts.length, hypothesisCount: result.hypotheses.length, gapCount: result.gaps.length },
      });
      return result;
    } catch (error) {
      const providerError = error instanceof BriefingGenerationError ? error : null;
      const message = safeErrorMessage(error, "A síntese do briefing não pôde ser concluída.");
      await this.audit({
        lead,
        run,
        provider: "gemini",
        operation: "generate_briefing",
        status: providerError?.kind === "timeout" ? "timeout" : "failed",
        durationMs: Date.now() - startedAt,
        input: { sourceCount: sources.length, hasSearchError: Boolean(searchError) },
        output: { error: message },
      });
      const failedRun = await this.research.transitionRun({
        runId: run.id,
        status: "failed",
        errorMessage: message,
        executionTimeMs: Date.now() - new Date(run.startedAt ?? run.createdAt).getTime(),
      });
      await this.updateLeadProjection(lead, failedRun, sources);
      throw new Error(message);
    }
  }

  private async audit(input: {
    lead: LeadRecord;
    run: ResearchRun;
    provider: "tavily" | "gemini";
    operation: string;
    status: "success" | "failed" | "timeout";
    durationMs: number;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  }): Promise<void> {
    await this.research.appendToolExecution({
      id: randomUUID(),
      leadId: input.lead.id,
      executionId: input.lead.executionId,
      researchRunId: input.run.id,
      provider: input.provider,
      operation: input.operation,
      status: input.status,
      durationMs: input.durationMs,
      input: input.input,
      output: input.output,
      createdAt: new Date().toISOString(),
    });
  }

  private async updateLeadProjection(
    lead: LeadRecord,
    run: ResearchRun,
    sources: ResearchSource[],
    briefing?: { summary: string; gaps: ResearchGap[] },
  ): Promise<void> {
    const currentLead = await this.leads.get(lead.id);
    if (!currentLead) return;
    await this.leads.save({
      ...currentLead,
      research: {
        ...currentLead.research,
        status: run.status,
        runId: run.id,
        sources: sources.map((source) => ({ url: source.url, title: source.title })),
      },
      briefing: briefing
        ? { summary: briefing.summary, gaps: briefing.gaps.map((gap) => gap.prompt) }
        : currentLead.briefing,
    });
  }
}

function createSources(
  lead: LeadRecord,
  run: ResearchRun,
  results: Awaited<ReturnType<ResearchProvider["search"]>>,
): ResearchSource[] {
  const unique = new Map<string, ResearchSource>();
  for (const result of results) {
    let url: string;
    try {
      const parsed = new URL(result.url);
      parsed.hash = "";
      url = parsed.toString();
    } catch {
      continue;
    }
    if (!unique.has(url)) {
      unique.set(url, {
        id: randomUUID(),
        leadId: lead.id,
        researchRunId: run.id,
        executionId: lead.executionId,
        url,
        title: cleanText(result.title, 240),
        excerpt: cleanText(result.excerpt, 1_200),
        consultedAt: new Date().toISOString(),
        sourceType: "search_result",
      });
    }
  }
  return [...unique.values()];
}

function addFormFacts(facts: GeneratedBriefing["facts"], lead: LeadRecord): GeneratedBriefing["facts"] {
  const formFacts = [
    { field: "full_name", value: lead.normalized.fullName },
    { field: "company", value: lead.normalized.company },
  ];
  if (lead.normalized.website) formFacts.push({ field: "website", value: lead.normalized.website });
  return [...formFacts.map((fact) => ({ ...fact, sourceIds: ["form_submission"] })), ...facts];
}

function addIdentityHypothesis(
  hypotheses: GeneratedBriefing["hypotheses"],
  identity: IdentityResolution,
): GeneratedBriefing["hypotheses"] {
  if (!identity.isAmbiguous || !identity.ambiguityReason) return hypotheses;
  return [...hypotheses, {
    field: "identity",
    value: "A identidade empresarial permanece ambígua.",
    confidence: "low",
    reasoning: `${identity.ambiguityReason} Confirme a organização antes de usar qualquer contexto externo.`,
  }];
}

function addDeterministicGaps(
  gaps: GeneratedBriefing["gaps"],
  identity: IdentityResolution,
  searchError: string | null,
  sourceCount: number,
): ResearchGap[] {
  const result = [...gaps];
  const dimensions = new Set(result.map((gap) => gap.dimension));
  if (identity.isAmbiguous && !dimensions.has("identity")) {
    result.push({ dimension: "identity", prompt: "Confirme o ramo, a localização e a organização representada antes de avançar." });
  }
  if (searchError && !dimensions.has("person")) {
    result.push({ dimension: "person", prompt: "Confirme seu cargo e vínculo profissional com a empresa." });
  }
  if (sourceCount === 0 && !dimensions.has("situation")) {
    result.push({ dimension: "situation", prompt: "Como vocês organizam hoje a operação financeira e os pagamentos?" });
  }
  return result;
}

function cleanText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim().slice(0, maxLength);
}

function safeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return error.message.replace(/[\r\n]+/g, " ").slice(0, 300) || fallback;
}
