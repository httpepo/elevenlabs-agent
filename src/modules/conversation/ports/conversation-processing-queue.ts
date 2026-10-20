export type ConversationProcessingJob = {
  voiceSessionId: string;
};

export interface ConversationProcessingQueue {
  enqueue(job: ConversationProcessingJob): Promise<void>;
}
