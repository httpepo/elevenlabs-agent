import type { Briefing, ResearchSource } from "../domain/briefing.ts";
import type { EnqueueResearchInput, ResearchRun, ResearchRunStatus } from "../domain/research-run.ts";

export type ResearchToolExecution = {
  id: string;
  leadId: string;
  executionId: string;
  researchRunId: string;
  provider: "tavily" | "gemini";
  operation: string;
  status: "success" | "failed" | "timeout";
  durationMs: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: string;
};

export interface ResearchRepository {
  createRun(input: EnqueueResearchInput): Promise<ResearchRun>;
  getRun(id: string): Promise<ResearchRun | null>;
  findRunByIdempotencyKey(idempotencyKey: string): Promise<ResearchRun | null>;
  getLatestRun(leadId: string, executionId?: string): Promise<ResearchRun | null>;
  getActiveRun(leadId: string, executionId: string): Promise<ResearchRun | null>;
  transitionRun(input: {
    runId: string;
    status: ResearchRunStatus;
    errorMessage?: string | null;
    executionTimeMs?: number | null;
  }): Promise<ResearchRun>;
  saveSources(sources: ResearchSource[]): Promise<void>;
  listSources(leadId: string, executionId?: string): Promise<ResearchSource[]>;
  createBriefing(input: Omit<Briefing, "id" | "version" | "createdAt">): Promise<Briefing>;
  getLatestBriefing(leadId: string, executionId?: string): Promise<Briefing | null>;
  appendToolExecution(execution: ResearchToolExecution): Promise<void>;
}
