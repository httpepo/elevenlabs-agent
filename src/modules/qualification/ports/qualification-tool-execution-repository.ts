export type QualificationToolExecution = {
  id: string;
  leadId: string;
  executionId: string;
  voiceSessionId: string;
  provider: "gemini";
  operation: "extract_spiced_qualification";
  status: "success" | "failed" | "timeout";
  durationMs: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: string;
};

export interface QualificationToolExecutionRepository {
  appendToolExecution(execution: QualificationToolExecution): Promise<void>;
}

