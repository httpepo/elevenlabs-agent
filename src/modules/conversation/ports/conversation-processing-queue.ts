export type ConversationProcessingJob = {
  externalCallId: string;
  eventType: string;
  transcript: string;
  summary: string | null;
  occurredAt: string;
};

export interface ConversationProcessingQueue {
  enqueue(job: ConversationProcessingJob): Promise<void>;
}
