import type { LeadRecord, LeadSubmissionRecord } from "../domain/lead.ts";

/** Persistência da demonstração atual; sem dependência do adaptador em arquivo. */
export interface LeadRepository {
  save(lead: LeadRecord): Promise<void>;
  get(id: string): Promise<LeadRecord | null>;
  list(): Promise<LeadRecord[]>;
}

export type PersistedLeadCapture = {
  lead: LeadRecord;
  submission: LeadSubmissionRecord;
  created: boolean;
};

export interface LeadCaptureRepository extends LeadRepository {
  findSubmissionByIdempotencyKey(idempotencyKey: string): Promise<LeadSubmissionRecord | null>;
  persistCapture(lead: LeadRecord, submission: LeadSubmissionRecord): Promise<PersistedLeadCapture>;
}
