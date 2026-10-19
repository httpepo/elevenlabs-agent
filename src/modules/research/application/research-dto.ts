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
  const briefingBelongsToRun = Boolean(
    run && briefing && briefing.researchRunId === run.id && briefing.executionId === executionId,
  );
  const currentBriefing = briefingBelongsToRun ? briefing : null;
  const durationMs = run
    ? run.executionTimeMs ?? Math.max(0, Date.now() - new Date(run.startedAt ?? run.createdAt).getTime())
    : null;
  return {
    leadId,
    executionId,
    researchRunId: run?.id ?? null,
    researchStatus,
    isReadyForVoice: Boolean(currentBriefing && (researchStatus === "ready" || researchStatus === "partial")),
    durationMs,
    briefingId: currentBriefing?.id ?? null,
    briefingVersion: currentBriefing?.version ?? null,
    briefingSummary: currentBriefing?.summary ?? null,
    error: run?.errorMessage ?? null,
  };
}
