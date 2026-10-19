import type { LeadProfileVersion } from "../domain/lead-profile-version.ts";

export interface LeadProfileVersionRepository {
  getLatest(leadId: string, executionId?: string): Promise<LeadProfileVersion | null>;
  saveProfileVersion(version: LeadProfileVersion): Promise<void>;
}

