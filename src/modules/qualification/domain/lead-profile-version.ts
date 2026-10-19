import type { TranscriptEvidenceRef } from "./spiced-qualification.ts";

export type LeadProfileCorrectionField = "fullName" | "company" | "role" | "phone" | "email";

export type LeadProfileCorrection = {
  field: LeadProfileCorrectionField;
  originalValue: string | null;
  correctedValue: string;
  evidenceRef: TranscriptEvidenceRef;
};

export type LeadProfileVersion = {
  id: string;
  leadId: string;
  executionId: string;
  voiceSessionId: string;
  version: number;
  changes: LeadProfileCorrection[];
  createdAt: string;
};

