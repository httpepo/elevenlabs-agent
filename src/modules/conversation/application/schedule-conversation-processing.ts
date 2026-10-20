import type { ConversationRepository } from "../ports/conversation-repository.ts";
import type { ConversationProcessingRepository } from "../ports/conversation-processing-repository.ts";
import type { ConversationProcessingQueue } from "../ports/conversation-processing-queue.ts";

export class ScheduleConversationProcessingUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly jobs: ConversationProcessingRepository,
    private readonly queue: ConversationProcessingQueue,
  ) {}

  async execute(voiceSessionId: string): Promise<void> {
    const session = await this.conversations.getSession(voiceSessionId);
    if (!session?.externalCallId || !["finalizing", "failed", "abandoned"].includes(session.status)) return;
    const job = await this.jobs.ensure(voiceSessionId);
    if (["completed", "failed"].includes(job.status)) return;
    await this.queue.enqueue({ voiceSessionId });
  }
}
