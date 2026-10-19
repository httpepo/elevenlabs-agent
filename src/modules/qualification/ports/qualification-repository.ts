import type { SpicedQualification } from "../domain/spiced-qualification.ts";

export interface QualificationRepository {
  findByIdempotencyKey(idempotencyKey: string): Promise<SpicedQualification | null>;
  getLatestByLead(leadId: string, executionId?: string): Promise<SpicedQualification | null>;
  save(qualification: SpicedQualification, idempotencyKey: string): Promise<void>;
}

