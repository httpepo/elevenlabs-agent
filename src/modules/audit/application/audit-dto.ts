import type { LeadForm } from "../../leads/domain/lead.ts";
import type { Briefing, ResearchSource } from "../../research/domain/briefing.ts";
import type { ResearchRunStatus } from "../../research/domain/research-run.ts";
import type { TranscriptSegment } from "../../qualification/domain/transcript.ts";
import type { LeadProfileCorrection } from "../../qualification/domain/lead-profile-version.ts";
import type { SpicedQualificationDTO } from "../../qualification/application/spiced-qualification-dto.ts";
import type { MeetingAttempt, MeetingAttemptStatus } from "../../scheduling/domain/meeting-attempt.ts";
import type { ToolExecution } from "../domain/tool-execution.ts";

export type AuditMeetingAttempt = Omit<MeetingAttempt, "slotOfferTokenHash">;

export type LeadAuditView = Readonly<{
  lead: Readonly<{
    id: string;
    createdAt: string;
    original: LeadForm;
    normalized: LeadForm;
  }>;
  execution: Readonly<{
    id: string;
    isLatest: boolean;
    available: ReadonlyArray<Readonly<{ id: string; createdAt: string }>>;
  }>;
  research: Readonly<{
    status: ResearchRunStatus;
    runId: string | null;
    briefing: Briefing | null;
    sources: ResearchSource[];
  }>;
  identity: Readonly<{
    original: LeadForm;
    normalized: LeadForm;
    corrections: LeadProfileCorrection[];
  }>;
  conversation: Readonly<{
    sessionId: string | null;
    status: "not_started" | "ready" | "connecting" | "active" | "finalizing" | "completed" | "abandoned" | "failed";
    processing: boolean;
    durationMs: number | null;
    terminationReason: "completed" | "abandoned" | "failed" | null;
    transcript: TranscriptSegment[];
    summary: string | null;
  }>;
  spiced: SpicedQualificationDTO | null;
  tools: ToolExecution[];
  meeting: Readonly<{
    status: MeetingAttemptStatus;
    latest: AuditMeetingAttempt | null;
    attempts: AuditMeetingAttempt[];
  }>;
}>;

export type AttendanceStageStatus = "completed" | "in_progress" | "pending" | "failed" | "conflict";

export type AttendanceOverviewItem = Readonly<{
  leadId: string;
  executionId: string;
  fullName: string;
  email: string;
  company: string;
  submittedAt: string;
  stages: Readonly<{
    research: AttendanceStageStatus;
    conversation: AttendanceStageStatus;
    spiced: AttendanceStageStatus;
    meeting: AttendanceStageStatus;
  }>;
}>;
