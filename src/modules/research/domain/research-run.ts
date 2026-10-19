import { randomUUID } from "node:crypto";

export type ResearchRunStatus = "queued" | "running" | "ready" | "partial" | "failed" | "cancelled";

export type ResearchRun = {
  id: string;
  leadId: string;
  executionId: string;
  idempotencyKey: string;
  status: ResearchRunStatus;
  queryParams: Record<string, unknown>;
  errorMessage: string | null;
  executionTimeMs: number | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
};

export type EnqueueResearchInput = {
  leadId: string;
  executionId: string;
  idempotencyKey: string;
};

const allowedTransitions: Record<ResearchRunStatus, readonly ResearchRunStatus[]> = {
  queued: ["running", "cancelled", "failed"],
  running: ["ready", "partial", "failed", "cancelled"],
  ready: [],
  partial: [],
  failed: [],
  cancelled: [],
};

export function createQueuedResearchRun(input: EnqueueResearchInput, createdAt = new Date().toISOString()): ResearchRun {
  return {
    id: randomUUID(),
    leadId: input.leadId,
    executionId: input.executionId,
    idempotencyKey: input.idempotencyKey,
    status: "queued",
    queryParams: {},
    errorMessage: null,
    executionTimeMs: null,
    updatedAt: createdAt,
    createdAt,
    startedAt: null,
  };
}

export function transitionResearchRun(
  run: ResearchRun,
  status: ResearchRunStatus,
  details: { at?: string; errorMessage?: string | null; executionTimeMs?: number | null } = {},
): ResearchRun {
  if (!allowedTransitions[run.status].includes(status)) {
    throw new Error(`Transição de pesquisa inválida: ${run.status} -> ${status}.`);
  }
  const at = details.at ?? new Date().toISOString();
  return {
    ...run,
    status,
    errorMessage: details.errorMessage === undefined ? run.errorMessage : details.errorMessage,
    executionTimeMs: details.executionTimeMs === undefined ? run.executionTimeMs : details.executionTimeMs,
    updatedAt: at,
    startedAt: status === "running" ? (run.startedAt ?? at) : run.startedAt,
  };
}

export function isTerminalResearchStatus(status: ResearchRunStatus): boolean {
  return ["ready", "partial", "failed", "cancelled"].includes(status);
}
