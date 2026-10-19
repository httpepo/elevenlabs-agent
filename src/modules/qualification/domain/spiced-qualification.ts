import { randomUUID } from "node:crypto";
import type { ObjectionRecord } from "./objections/objection-record.ts";

export const dimensionStatuses = [
  "not_asked",
  "unknown",
  "partial",
  "known",
  "needs_confirmation",
  "declined",
] as const;

export type DimensionStatus = typeof dimensionStatuses[number];

export const qualificationStatuses = [
  "not_assessed",
  "potential_fit",
  "qualified",
  "not_qualified",
] as const;

export type QualificationStatus = typeof qualificationStatuses[number];

export const interestStatuses = ["interested", "undecided", "declined"] as const;

export type InterestStatus = typeof interestStatuses[number];

export const spicedDimensionNames = [
  "situation",
  "pain",
  "impact",
  "critical_event",
  "decision",
] as const;

export type SpicedDimensionName = typeof spicedDimensionNames[number];
export type Confidence = "high" | "medium" | "low";

export type TranscriptEvidenceRef = {
  transcriptSegmentId: string;
  startMs: number;
  endMs: number;
  excerpt: string;
};

export type SpicedDimension = {
  status: DimensionStatus;
  value: string | null;
  confidence: Confidence;
  evidenceRefs: TranscriptEvidenceRef[];
};

export type Situation = SpicedDimension & { readonly dimension: "situation" };
export type Pain = SpicedDimension & { readonly dimension: "pain" };
export type Impact = SpicedDimension & { readonly dimension: "impact" };
export type CriticalEvent = SpicedDimension & { readonly dimension: "critical_event" };
export type Decision = SpicedDimension & { readonly dimension: "decision" };

export type SpicedQualification = {
  id: string;
  leadId: string;
  executionId: string;
  voiceSessionId: string;
  externalCallId: string;
  eventType: string;
  situation: Situation;
  pain: Pain;
  impact: Impact;
  criticalEvent: CriticalEvent;
  decision: Decision;
  qualificationStatus: QualificationStatus;
  interestStatus: InterestStatus;
  declineReason: string | null;
  objections: ObjectionRecord[];
  createdAt: string;
};

export function createSpicedDimension<T extends SpicedDimensionName>(input: {
  dimension: T;
  status: DimensionStatus;
  value?: string | null;
  confidence?: Confidence;
  evidenceRefs?: TranscriptEvidenceRef[];
}): SpicedDimension & { readonly dimension: T } {
  const value = input.value?.trim() || null;
  const evidenceRefs = input.evidenceRefs ?? [];
  if (input.status === "known" && !value) throw new Error(`Dimensão ${input.dimension} conhecida sem valor.`);
  if (input.status === "not_asked" && evidenceRefs.length) throw new Error(`Dimensão ${input.dimension} não perguntada possui evidência.`);
  if (evidenceRefs.some((ref) => ref.startMs < 0 || ref.endMs < ref.startMs || !ref.excerpt.trim())) {
    throw new Error(`Evidência inválida para dimensão ${input.dimension}.`);
  }
  return {
    dimension: input.dimension,
    status: input.status,
    value,
    confidence: input.confidence ?? (input.status === "known" ? "high" : "low"),
    evidenceRefs,
  };
}

export function createSpicedQualification(input: Omit<SpicedQualification, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
}): SpicedQualification {
  if (!input.leadId.trim() || !input.executionId.trim() || !input.voiceSessionId.trim() || !input.externalCallId.trim()) {
    throw new Error("Qualificação SPICED sem vínculo de execução válido.");
  }
  if (input.interestStatus === "declined" && !input.declineReason?.trim()) {
    throw new Error("Recusa explícita precisa de motivo registrado.");
  }
  if (input.qualificationStatus === "not_qualified" && input.interestStatus !== "declined") {
    throw new Error("Qualificação não aderente exige desinteresse explícito.");
  }
  return {
    ...input,
    id: input.id ?? randomUUID(),
    declineReason: input.declineReason?.trim() || null,
    eventType: input.eventType.trim() || "post_call_transcription",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

