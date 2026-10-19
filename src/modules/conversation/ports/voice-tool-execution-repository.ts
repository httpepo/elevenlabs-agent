export type VoiceToolExecution = {
  id: string;
  leadId: string;
  executionId: string;
  voiceSessionId: string | null;
  provider: "elevenlabs";
  operation: string;
  status: "success" | "failed" | "conflict" | "timeout";
  durationMs: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: string;
};

export interface VoiceToolExecutionRepository {
  appendToolExecution(execution: VoiceToolExecution): Promise<void>;
}
