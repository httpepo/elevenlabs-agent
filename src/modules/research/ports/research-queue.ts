import type { EnqueueResearchInput, ResearchRun } from "../domain/research-run.ts";

export type StartResearchJob = {
  type: "start_research";
  leadId: string;
  researchRunId: string;
  executionId: string;
};

export type ResearchJob = StartResearchJob & {
  id: string;
  idempotencyKey: string;
  status: "queued" | "running" | "completed" | "failed";
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  lockedUntil: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Porta usada no cadastro do lead para criar o run e publicar o comando de pesquisa. */
export interface ResearchQueue {
  enqueue(input: EnqueueResearchInput): Promise<ResearchRun>;
}

export interface JobQueue {
  claim(workerId: string, leaseMs: number, researchRunId?: string): Promise<ResearchJob | null>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, errorMessage: string): Promise<{ retry: boolean; job: ResearchJob }>;
}
