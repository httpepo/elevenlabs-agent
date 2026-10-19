import type { MeetingAttempt } from "../../domain/meeting-attempt.ts";
import type { MeetingAttemptRepository } from "../../ports/meeting-attempt-repository.ts";

export class GetMeetingAttemptsUseCase {
  constructor(private readonly attempts: MeetingAttemptRepository) {}

  execute(input: { leadId: string; executionId: string }): Promise<MeetingAttempt[]> {
    return this.attempts.listByLead(input.leadId, input.executionId);
  }
}
