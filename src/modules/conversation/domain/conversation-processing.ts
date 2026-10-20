export const conversationProcessingTargetMs = 60_000;
export const conversationProcessingLeaseMs = 55_000;
export const conversationProcessingMaxAttempts = 12;

export type ConversationProcessing = {
  voiceSessionId: string;
  status: "queued" | "running" | "completed" | "failed";
  attempts: number;
  requestedAt: string;
  updatedAt: string;
  availableAt: string;
  leaseUntil: string | null;
  leaseOwner: string | null;
  lastError: string | null;
};

export class ConversationProcessingRetry extends Error {
  constructor(readonly afterSeconds: number, message: string) {
    super(message);
    this.name = "ConversationProcessingRetry";
  }
}
