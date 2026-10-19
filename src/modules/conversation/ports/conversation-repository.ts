import type { VoiceSession, VoiceSessionStatus } from "../domain/voice-session.ts";

export interface ConversationRepository {
  createSession(session: VoiceSession): Promise<void>;
  getSession(id: string): Promise<VoiceSession | null>;
  getLatestSession(leadId: string, executionId: string): Promise<VoiceSession | null>;
  findSessionByExternalCallId(externalCallId: string): Promise<VoiceSession | null>;
  transitionSession(input: {
    sessionId: string;
    status: VoiceSessionStatus;
    reason: string;
    externalCallId?: string | null;
  }): Promise<VoiceSession>;
}
