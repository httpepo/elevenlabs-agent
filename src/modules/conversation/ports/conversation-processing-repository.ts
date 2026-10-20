import type { ConversationProcessing } from "../domain/conversation-processing.ts";

export interface ConversationProcessingRepository {
  ensure(voiceSessionId: string): Promise<ConversationProcessing>;
  get(voiceSessionId: string): Promise<ConversationProcessing | null>;
  claim(voiceSessionId: string, owner: string, leaseMs: number): Promise<ConversationProcessing | null>;
  finish(input: { voiceSessionId: string; owner: string; status: "queued" | "completed" | "failed"; error: string | null; delaySeconds: number }): Promise<void>;
  listPending(): Promise<string[]>;
}
