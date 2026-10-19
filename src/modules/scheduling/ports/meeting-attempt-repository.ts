import type { MeetingAttempt } from "../domain/meeting-attempt.ts";

export interface MeetingAttemptRepository {
  append(attempt: MeetingAttempt): Promise<void>;
  findLatestByBookingIntentId(bookingIntentId: string): Promise<MeetingAttempt | null>;
  findOfferedByTokenHash(tokenHash: string): Promise<MeetingAttempt | null>;
  listByLead(leadId: string, executionId?: string): Promise<MeetingAttempt[]>;
}
