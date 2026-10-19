import { randomUUID } from "node:crypto";
import type { LeadRepository } from "../../../leads/ports/lead-repository.ts";
import { createObjectionRecord } from "../../domain/objections/objection-record.ts";
import { createSpicedDimension, createSpicedQualification, type SpicedDimensionName, type SpicedDimension } from "../../domain/spiced-qualification.ts";
import { parseTranscript, validateEvidenceRefs, type TranscriptSegment } from "../../domain/transcript.ts";
import { spicedExtractionSchema, type SpicedExtractionInput } from "../../domain/schemas/spiced-schema.ts";
import type { LeadProfileCorrection, LeadProfileVersion } from "../../domain/lead-profile-version.ts";
import type { LeadProfileVersionRepository } from "../../ports/lead-profile-version-repository.ts";
import type { QualificationExtractor } from "../../ports/qualification-extractor.ts";
import type { QualificationRepository } from "../../ports/qualification-repository.ts";
import type { QualificationToolExecution, QualificationToolExecutionRepository } from "../../ports/qualification-tool-execution-repository.ts";

export class ExtractSpicedQualificationUseCase {
  constructor(
    private readonly leads: LeadRepository,
    private readonly extractor: QualificationExtractor,
    private readonly qualifications: QualificationRepository,
    private readonly profileVersions: LeadProfileVersionRepository,
    private readonly toolExecutions: QualificationToolExecutionRepository,
  ) {}

  async execute(input: {
    leadId: string;
    executionId: string;
    voiceSessionId: string;
    externalCallId: string;
    eventType: string;
    idempotencyKey: string;
    transcript: string;
  }): Promise<{ status: "processed" | "partial" | "failed" | "duplicate"; qualificationId?: string; error?: string }> {
    const existing = await this.qualifications.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return { status: "duplicate", qualificationId: existing.id };

    const startedAt = Date.now();
    const lead = await this.leads.get(input.leadId);
    if (!lead) throw new Error("Visitante da qualificação não encontrado.");
    const segments = parseTranscript(input.transcript);
    if (!segments.length) return this.fail(input, startedAt, "A transcrição não possui segmentos utilizáveis.");

    try {
      const extraction = spicedExtractionSchema.parse(await this.extractor.extract({
        lead: { original: lead.original, normalized: lead.normalized },
        transcriptSegments: segments,
      }));
      const normalized = normalizeExtraction(extraction, segments, input.voiceSessionId);
      const qualification = createSpicedQualification({
        leadId: input.leadId,
        executionId: input.executionId,
        voiceSessionId: input.voiceSessionId,
        externalCallId: input.externalCallId,
        eventType: input.eventType,
        situation: normalized.situation,
        pain: normalized.pain,
        impact: normalized.impact,
        criticalEvent: normalized.criticalEvent,
        decision: normalized.decision,
        qualificationStatus: normalizeQualificationStatus(extraction),
        interestStatus: extraction.interestStatus,
        declineReason: extraction.interestStatus === "declined"
          ? extraction.declineReason || "Visitante recusou novo contato."
          : null,
        objections: normalized.objections,
      });
      await this.qualifications.save(qualification, input.idempotencyKey);
      await this.persistProfileCorrection(input, lead, extraction.profileCorrections, segments);
      await this.recordToolExecution({
        input,
        startedAt,
        status: "success",
        output: {
          qualificationId: qualification.id,
          invalidEvidenceCount: normalized.invalidEvidenceCount,
          objectionCount: normalized.objections.length,
          objections: normalized.objections.map((objection) => ({
            category: objection.category,
            status: objection.status,
            authorizedClaimIds: objection.authorizedClaimIds,
          })),
          correctionCount: normalized.corrections.length,
          partial: normalized.invalidEvidenceCount > 0,
        },
      });
      return {
        status: normalized.invalidEvidenceCount > 0 ? "partial" : "processed",
        qualificationId: qualification.id,
      };
    } catch (error) {
      return this.fail(input, startedAt, publicError(error));
    }
  }

  private async persistProfileCorrection(
    input: { leadId: string; executionId: string; voiceSessionId: string },
    lead: NonNullable<Awaited<ReturnType<LeadRepository["get"]>>>,
    corrections: SpicedExtractionInput["profileCorrections"],
    segments: readonly TranscriptSegment[],
  ): Promise<void> {
    const validCorrections = corrections.flatMap((correction) => {
      const evidence = validateEvidenceRefs([correction.evidenceRef], segments);
      if (!evidence.valid.length) return [];
      if (sameProfileValue(correction.correctedValue, currentProfileValue(lead.normalized, correction.field))) return [];
      return [{ ...correction, evidenceRef: evidence.valid[0] } satisfies LeadProfileCorrection];
    });
    if (!validCorrections.length) return;
    const latest = await this.profileVersions.getLatest(input.leadId);
    const version: LeadProfileVersion = {
      id: randomUUID(),
      leadId: input.leadId,
      executionId: input.executionId,
      voiceSessionId: input.voiceSessionId,
      version: (latest?.version ?? 0) + 1,
      changes: validCorrections,
      createdAt: new Date().toISOString(),
    };
    await this.profileVersions.saveProfileVersion(version);
  }

  private async fail(input: {
    leadId: string;
    executionId: string;
    voiceSessionId: string;
    externalCallId: string;
    eventType: string;
    idempotencyKey: string;
    transcript: string;
  }, startedAt: number, message: string) {
    await this.recordToolExecution({ input, startedAt, status: "failed", output: { error: message } });
    return { status: "failed" as const, error: message };
  }

  private async recordToolExecution(input: {
    input: { leadId: string; executionId: string; voiceSessionId: string; externalCallId: string; eventType: string; transcript: string };
    startedAt: number;
    status: QualificationToolExecution["status"];
    output: Record<string, unknown>;
  }): Promise<void> {
    await this.toolExecutions.appendToolExecution({
      id: randomUUID(),
      leadId: input.input.leadId,
      executionId: input.input.executionId,
      voiceSessionId: input.input.voiceSessionId,
      provider: "gemini",
      operation: "extract_spiced_qualification",
      status: input.status,
      durationMs: Date.now() - input.startedAt,
      input: {
        eventType: input.input.eventType,
        externalCallId: input.input.externalCallId,
        transcriptBytes: Buffer.byteLength(input.input.transcript, "utf8"),
      },
      output: sanitizeOutput(input.output),
      createdAt: new Date().toISOString(),
    });
  }
}

function normalizeExtraction(extraction: SpicedExtractionInput, segments: readonly TranscriptSegment[], voiceSessionId: string) {
  const invalidEvidence = { count: 0 };
  const objections = extraction.objections.map((objection) => createObjectionRecord({
    voiceSessionId,
    originalStatement: objection.originalStatement,
    category: objection.category,
    authorizedClaimIds: objection.authorizedClaimIds,
    unansweredFollowUp: objection.unansweredFollowUp,
  }));
  const corrections = extraction.profileCorrections.filter((correction) => validateEvidenceRefs([correction.evidenceRef], segments).valid.length > 0);
  return {
    situation: normalizeDimension("situation", extraction.situation, segments, invalidEvidence),
    pain: normalizeDimension("pain", extraction.pain, segments, invalidEvidence),
    impact: normalizeDimension("impact", extraction.impact, segments, invalidEvidence),
    criticalEvent: normalizeDimension("critical_event", extraction.criticalEvent, segments, invalidEvidence),
    decision: normalizeDimension("decision", extraction.decision, segments, invalidEvidence),
    objections,
    corrections,
    invalidEvidenceCount: invalidEvidence.count,
  };
}

function normalizeDimension<T extends SpicedDimensionName>(
  name: T,
  raw: SpicedExtractionInput["situation"],
  segments: readonly TranscriptSegment[],
  invalidEvidence: { count: number },
): SpicedDimension & { readonly dimension: T } {
  const evidence = validateEvidenceRefs(raw.evidenceRefs, segments);
  invalidEvidence.count += evidence.invalidCount;
  const unsupportedValue = evidence.invalidCount > 0 ||
    (["known", "partial"].includes(raw.status) && evidence.valid.length === 0) ||
    (raw.status === "not_asked" && evidence.valid.length > 0);
  return createSpicedDimension({
    dimension: name,
    status: unsupportedValue ? "needs_confirmation" : raw.status,
    value: unsupportedValue ? null : raw.value,
    confidence: unsupportedValue ? "low" : raw.confidence,
    evidenceRefs: evidence.valid,
  });
}

function normalizeQualificationStatus(extraction: SpicedExtractionInput) {
  if (extraction.qualificationStatus === "not_qualified" && extraction.interestStatus !== "declined") return "potential_fit" as const;
  return extraction.qualificationStatus;
}

function currentProfileValue(profile: { fullName: string; company: string; phone: string; email: string }, field: string): string | null {
  if (field === "fullName") return profile.fullName;
  if (field === "company") return profile.company;
  if (field === "phone") return profile.phone;
  if (field === "email") return profile.email;
  return null;
}

function sameProfileValue(left: string, right: string | null): boolean {
  if (!right) return false;
  return normalizeValue(left) === normalizeValue(right);
}

function normalizeValue(value: string): string {
  return value.replace(/\D/g, "").toLocaleLowerCase("pt-BR") || value.trim().toLocaleLowerCase("pt-BR");
}

function sanitizeOutput(output: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(output).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 500) : value]));
}

function publicError(error: unknown): string {
  return (error instanceof Error ? error.message : "Extração de qualificação falhou.").replace(/[\r\n]+/g, " ").slice(0, 300);
}

