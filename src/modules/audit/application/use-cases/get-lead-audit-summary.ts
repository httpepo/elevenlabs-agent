import type { ConversationArtifactRepository } from "../../../conversation/ports/conversation-artifact-repository.ts";
import type { ConversationRepository } from "../../../conversation/ports/conversation-repository.ts";
import { parseTranscript } from "../../../qualification/domain/transcript.ts";
import type { LeadProfileVersionRepository } from "../../../qualification/ports/lead-profile-version-repository.ts";
import type { QualificationRepository } from "../../../qualification/ports/qualification-repository.ts";
import { toSpicedQualificationDTO } from "../../../qualification/application/spiced-qualification-dto.ts";
import type { LeadRepository } from "../../../leads/ports/lead-repository.ts";
import { isLeadId } from "../../../leads/domain/lead.ts";
import type { ResearchRepository } from "../../../research/ports/research-repository.ts";
import type { MeetingAttemptRepository } from "../../../scheduling/ports/meeting-attempt-repository.ts";
import type { AuditRepository } from "../../ports/audit-repository.ts";
import { sanitizePayload, sanitizeText } from "../../domain/sanitizer.ts";
import type { ToolExecution } from "../../domain/tool-execution.ts";
import type { AuditMeetingAttempt, LeadAuditView } from "../audit-dto.ts";

export class GetLeadAuditSummaryUseCase {
  constructor(
    private readonly leads: LeadRepository,
    private readonly research: ResearchRepository,
    private readonly conversations: ConversationRepository,
    private readonly artifacts: ConversationArtifactRepository,
    private readonly qualifications: QualificationRepository,
    private readonly profileVersions: LeadProfileVersionRepository,
    private readonly meetings: MeetingAttemptRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: { leadId: string; executionId?: string }): Promise<LeadAuditView | null> {
    if (!isValidAuditQuery(input)) return null;
    const requestedExecutionId = input.executionId?.trim();
    const lead = await this.leads.get(input.leadId);
    if (!lead) return null;

    const allTools = await this.audit.listExecutionsByLeadId(lead.id);
    const executions = buildExecutionOptions(lead.executionId, lead.createdAt, allTools);
    const selectedExecutionId = requestedExecutionId ?? executions[0]?.id ?? lead.executionId;
    if (!executions.some((execution) => execution.id === selectedExecutionId)) return null;

    const [run, briefing, sources, session, artifacts, qualification, profileVersion, meetings, tools] = await Promise.all([
      this.research.getLatestRun(lead.id, selectedExecutionId),
      this.research.getLatestBriefing(lead.id, selectedExecutionId),
      this.research.listSources(lead.id, selectedExecutionId),
      this.conversations.getLatestSession(lead.id, selectedExecutionId),
      this.artifacts.listArtifactsByLead(lead.id, selectedExecutionId),
      this.qualifications.getLatestByLead(lead.id, selectedExecutionId),
      this.profileVersions.getLatest(lead.id, selectedExecutionId),
      this.meetings.listByLead(lead.id, selectedExecutionId),
      this.audit.listExecutionsByLeadId(lead.id, selectedExecutionId),
    ]);

    const sessionArtifacts = artifacts.filter((artifact) => artifact.voiceSessionId === session?.id);
    const transcriptArtifact = latestArtifact(sessionArtifacts, "transcript");
    const summaryArtifact = latestArtifact(sessionArtifacts, "summary");
    const conversationStatus = session?.status ?? "not_started";
    const meetingAttempts = meetings;

    return {
      lead: {
        id: lead.id,
        createdAt: lead.createdAt,
        original: lead.original,
        normalized: lead.normalized,
      },
      execution: {
        id: selectedExecutionId,
        isLatest: executions[0]?.id === selectedExecutionId,
        available: executions,
      },
      research: {
        status: run?.status ?? (selectedExecutionId === lead.executionId ? lead.research.status : "queued"),
        runId: run?.id ?? null,
        briefing,
        sources,
      },
      identity: {
        original: lead.original,
        normalized: lead.normalized,
        corrections: profileVersion?.changes ?? [],
      },
      conversation: {
        sessionId: session?.id ?? null,
        status: conversationStatus,
        processing: conversationStatus === "finalizing",
        durationMs: session?.durationMs ?? null,
        terminationReason: isTerminationReason(conversationStatus) ? conversationStatus : null,
        transcript: transcriptArtifact ? parseTranscript(transcriptArtifact.content) : [],
        summary: summaryArtifact?.content ?? null,
      },
      spiced: qualification && qualification.voiceSessionId === session?.id ? toSpicedQualificationDTO(qualification) : null,
      tools: tools.map(toSafeToolExecution),
      meeting: {
        status: meetingAttempts.at(-1)?.status ?? "not_requested",
        latest: toAuditMeetingAttempt(meetingAttempts.at(-1)),
        attempts: meetingAttempts.map(toAuditMeetingAttempt).filter(isAuditMeetingAttempt),
      },
    };
  }
}

export { GetLeadAuditSummaryUseCase as GetLeadAuditSummary };

function isValidAuditQuery(input: { leadId: string; executionId?: string }): boolean {
  return typeof input.leadId === "string" && isLeadId(input.leadId) &&
    (input.executionId === undefined || (typeof input.executionId === "string" && input.executionId.trim().length > 0));
}

function buildExecutionOptions(
  currentExecutionId: string,
  currentCreatedAt: string,
  tools: ReadonlyArray<{ executionId: string; createdAt: string }>,
): Array<{ id: string; createdAt: string }> {
  const timestamps = new Map<string, string>([[currentExecutionId, currentCreatedAt]]);
  for (const tool of tools) {
    if (!tool.executionId.trim()) continue;
    const existing = timestamps.get(tool.executionId);
    if (!existing || tool.createdAt > existing) timestamps.set(tool.executionId, tool.createdAt);
  }
  return [...timestamps.entries()]
    .map(([id, createdAt]) => ({ id, createdAt }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function latestArtifact<T extends { type: string; occurredAt: string }>(artifacts: T[], type: T["type"]): T | null {
  return artifacts
    .filter((artifact) => artifact.type === type)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .at(-1) ?? null;
}

function toSafeToolExecution(tool: ToolExecution): ToolExecution {
  return {
    ...tool,
    input: sanitizePayload(tool.input),
    output: sanitizePayload(tool.output),
  };
}

function isTerminationReason(value: string): value is "completed" | "abandoned" | "failed" {
  return value === "completed" || value === "abandoned" || value === "failed";
}

function toAuditMeetingAttempt(attempt: import("../../../scheduling/domain/meeting-attempt.ts").MeetingAttempt | undefined): AuditMeetingAttempt | null {
  if (!attempt) return null;
  const { slotOfferTokenHash: _slotOfferTokenHash, ...safeAttempt } = attempt;
  return {
    ...safeAttempt,
    bookingPayload: sanitizeBookingPayload(attempt.bookingPayload),
    transportDiagnostic: attempt.transportDiagnostic ? sanitizeText(attempt.transportDiagnostic) : null,
  };
}

function isAuditMeetingAttempt(attempt: AuditMeetingAttempt | null): attempt is AuditMeetingAttempt {
  return attempt !== null;
}

function sanitizeBookingPayload(payload: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const sanitized = sanitizePayload(payload);
  return Object.fromEntries(Object.entries(sanitized).map(([key, value]) => [key, typeof value === "string" ? value : "[REDACTED]"]));
}
