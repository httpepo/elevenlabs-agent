export type BriefingStatus = "ready" | "partial" | "failed";

export type ResearchFact = {
  field: string;
  value: string;
  sourceIds: string[];
};

export type ResearchHypothesis = {
  field: string;
  value: string;
  confidence: "low" | "medium" | "high";
  reasoning: string;
};

export type ResearchGap = {
  dimension: "situation" | "pain" | "impact" | "critical_event" | "decision" | "identity" | "person";
  prompt: string;
};

export type ResearchSource = {
  id: string;
  leadId: string;
  researchRunId: string;
  executionId: string;
  url: string;
  title: string;
  excerpt: string;
  consultedAt: string;
  sourceType: "search_result";
};

export type Briefing = {
  id: string;
  leadId: string;
  researchRunId: string;
  executionId: string;
  version: number;
  status: BriefingStatus;
  summary: string;
  facts: ResearchFact[];
  hypotheses: ResearchHypothesis[];
  gaps: ResearchGap[];
  createdAt: string;
};

/** Compatibilidade para consumidores que ainda esperam um resultado de pesquisa. */
export type ResearchResult = Briefing;

export type ResearchSearchResult = {
  url: string;
  title: string;
  excerpt: string;
  query?: string;
};

export type BriefingGenerationInput = {
  lead: {
    fullName: string;
    email: string;
    phone: string;
    company: string;
    website: string;
    employeeCount: string;
  };
  sources: ResearchSource[];
  identity: {
    anchorType: "corporate_email" | "personal_email";
    corporateDomain: string | null;
    isAmbiguous: boolean;
    ambiguityReason: string | null;
    personStatus: "corroborated" | "ambiguous" | "unverified";
    personReason: string | null;
  };
  searchError: string | null;
};

export type GeneratedBriefing = {
  summary: string;
  facts: ResearchFact[];
  hypotheses: ResearchHypothesis[];
  gaps: ResearchGap[];
};

export function validateGeneratedBriefing(
  briefing: GeneratedBriefing,
  sourceIds: ReadonlySet<string>,
): GeneratedBriefing {
  if (!briefing.summary.trim()) throw new Error("Gemini retornou um resumo vazio.");

  for (const fact of briefing.facts) {
    if (!fact.field.trim() || !fact.value.trim()) throw new Error("Gemini retornou fato incompleto.");
    if (fact.sourceIds.length === 0) throw new Error("Gemini retornou fato sem provenance.");
    if (fact.sourceIds.some((sourceId) => sourceId !== "form_submission" && !sourceIds.has(sourceId))) {
      throw new Error("Gemini referenciou uma fonte inexistente.");
    }
  }

  for (const hypothesis of briefing.hypotheses) {
    if (!hypothesis.field.trim() || !hypothesis.value.trim() || !hypothesis.reasoning.trim()) {
      throw new Error("Gemini retornou hipótese incompleta.");
    }
  }

  for (const gap of briefing.gaps) {
    if (!gap.dimension || !gap.prompt.trim()) throw new Error("Gemini retornou lacuna incompleta.");
  }

  return briefing;
}
