import { randomUUID } from "node:crypto";
import { sanitizePayload, type SanitizedPayload } from "./sanitizer.ts";

export const toolExecutionStatuses = ["success", "failed", "conflict", "timeout"] as const;
export type ToolExecutionStatus = typeof toolExecutionStatuses[number];

export type ToolExecution = Readonly<{
  id: string;
  leadId: string;
  executionId: string;
  researchRunId: string | null;
  voiceSessionId: string | null;
  provider: string;
  operation: string;
  status: ToolExecutionStatus;
  durationMs: number;
  input: SanitizedPayload;
  output: SanitizedPayload;
  createdAt: string;
}>;

export type ToolExecutionInput = Omit<ToolExecution, "id" | "input" | "output" | "createdAt"> & {
  id?: string;
  input: unknown;
  output: unknown;
  createdAt?: string;
};

export function createToolExecution(input: ToolExecutionInput): ToolExecution {
  if (!input.leadId.trim() || !input.executionId.trim()) {
    throw new Error("Execução de ferramenta sem vínculo de lead ou execução.");
  }
  if (!input.provider.trim() || !input.operation.trim()) {
    throw new Error("Execução de ferramenta sem provedor ou operação.");
  }
  if (!Number.isFinite(input.durationMs) || input.durationMs < 0) {
    throw new Error("Duração de ferramenta inválida.");
  }
  return {
    id: input.id ?? randomUUID(),
    leadId: input.leadId,
    executionId: input.executionId,
    researchRunId: input.researchRunId ?? null,
    voiceSessionId: input.voiceSessionId ?? null,
    provider: input.provider,
    operation: input.operation,
    status: input.status,
    durationMs: Math.round(input.durationMs),
    input: sanitizePayload(input.input),
    output: sanitizePayload(input.output),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
