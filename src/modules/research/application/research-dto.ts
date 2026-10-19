import type { Briefing } from "../domain/briefing.ts";
import type { ResearchRun, ResearchRunStatus } from "../domain/research-run.ts";

export type ResearchStatusView = {
  leadId: string;
  executionId: string;
  researchRunId: string | null;
  researchStatus: ResearchRunStatus;
  isReadyForVoice: boolean;
  durationMs: number | null;
  briefingId: string | null;
  briefingVersion: number | null;
  briefingSummary: string | null;
  error: string | null;
};

export function toResearchStatusView(
  leadId: string,
  executionId: string,
  run: ResearchRun | null,
  briefing: Briefing | null,
): ResearchStatusView {
  const researchStatus = run?.status ?? "queued";
  const durationMs = run
    ? run.executionTimeMs ?? Math.max(0, Date.now() - new Date(run.createdAt).getTime())
    : null;
  return {
    leadId,
    executionId,
    researchRunId: run?.id ?? null,
    researchStatus,
    isReadyForVoice: researchStatus === "ready" || researchStatus === "partial",
    durationMs,
    briefingId: briefing?.id ?? null,
    briefingVersion: briefing?.version ?? null,
    briefingSummary: briefing?.summary ?? null,
    error: run?.errorMessage ?? null,
  };
}
