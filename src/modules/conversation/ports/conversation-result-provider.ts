export type ConversationResult = {
  status: "pending" | "ready" | "failed";
  transcript: string | null;
  summary: string | null;
  occurredAt: string;
  failureReason: string | null;
};

export interface ConversationResultProvider {
  getResult(externalCallId: string): Promise<ConversationResult>;
}
