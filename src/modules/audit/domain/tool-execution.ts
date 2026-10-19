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
  const leadId = normalizeRequiredValue(input.leadId, "lead ou execução");
  const executionId = normalizeRequiredValue(input.executionId, "lead ou execução");
  const provider = normalizeRequiredValue(input.provider, "provedor");
  const operation = normalizeRequiredValue(input.operation, "operação");
  if (!toolExecutionStatuses.includes(input.status)) {
    throw new Error("Status de execução de ferramenta inválido.");
  }
  if (!Number.isFinite(input.durationMs) || input.durationMs < 0) {
    throw new Error("Duração de ferramenta inválida.");
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error("Data de execução de ferramenta inválida.");
  }
  return {
    id: input.id ?? randomUUID(),
    leadId,
    executionId,
    researchRunId: input.researchRunId ?? null,
    voiceSessionId: input.voiceSessionId ?? null,
    provider,
    operation,
    status: input.status,
    durationMs: Math.round(input.durationMs),
    input: sanitizePayload(input.input),
    output: sanitizePayload(input.output),
    createdAt,
  };
}

function normalizeRequiredValue(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`Execução de ferramenta sem ${label} válido.`);
  return normalized;
}
