import { randomUUID } from "node:crypto";
import type { TranscriptEvidenceRef } from "../spiced-qualification.ts";
import {
  getObjectionDefinition,
  specialistFallback,
  type ObjectionCategory,
  type ObjectionResolutionStatus,
} from "./objection-catalog.ts";

export type ObjectionRecord = {
  id: string;
  voiceSessionId: string;
  originalStatement: string;
  category: ObjectionCategory | null;
  response: string;
  statementEvidenceRef?: TranscriptEvidenceRef | null;
  actualResponse?: { text: string; evidenceRefs: TranscriptEvidenceRef[] } | null;
  source: string;
  sourceVersion: string;
  status: ObjectionResolutionStatus;
  unansweredFollowUp: string | null;
  authorizedClaimIds: string[];
  createdAt: string;
};

export function createObjectionRecord(input: {
  id?: string;
  voiceSessionId: string;
  originalStatement: string;
  category: ObjectionCategory | null;
  statementEvidenceRef?: TranscriptEvidenceRef | null;
  responseEvidenceRefs?: TranscriptEvidenceRef[];
  authorizedClaimIds?: string[];
  unansweredFollowUp?: string | null;
  createdAt?: string;
}): ObjectionRecord {
  const originalStatement = input.originalStatement.trim();
  if (!originalStatement) throw new Error("Objeção sem fala original.");
  if (!input.voiceSessionId.trim()) throw new Error("Objeção sem sessão de voz.");

  const claimIds = [...new Set(input.authorizedClaimIds ?? [])];
  const definition = input.category ? getObjectionDefinition(input.category) : null;
  const hasUnknownClaim = definition
    ? claimIds.some((claimId) => !definition.authorizedClaims.some((claim) => claim.id === claimId))
    : claimIds.length > 0;
  const hasRequiredClaim = Boolean(definition && definition.authorizedClaims.length > 0 && claimIds.length > 0);
  const addressedDefinition = definition && !hasUnknownClaim && (definition.authorizedClaims.length === 0 || hasRequiredClaim)
    ? definition
    : null;
  const isAddressed = Boolean(addressedDefinition);
  const status: ObjectionResolutionStatus = isAddressed ? "addressed" : "pending_specialist";
  const response = addressedDefinition?.response ?? specialistFallback;

  return {
    id: input.id ?? randomUUID(),
    voiceSessionId: input.voiceSessionId,
    originalStatement,
    category: input.category,
    response,
    statementEvidenceRef: input.statementEvidenceRef ?? null,
    actualResponse: input.responseEvidenceRefs?.length ? {
      text: input.responseEvidenceRefs.map((reference) => reference.excerpt).join("\n"),
      evidenceRefs: input.responseEvidenceRefs,
    } : null,
    source: addressedDefinition?.source ?? "specialist_fallback",
    sourceVersion: addressedDefinition?.sourceVersion ?? "2026-10-18",
    status,
    unansweredFollowUp: isAddressed ? input.unansweredFollowUp?.trim() || null : input.unansweredFollowUp?.trim() || originalStatement,
    authorizedClaimIds: isAddressed ? claimIds : [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

