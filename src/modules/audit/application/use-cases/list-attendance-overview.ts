import type { ConversationRepository } from "../../../conversation/ports/conversation-repository.ts";
import type { LeadRepository } from "../../../leads/ports/lead-repository.ts";
import type { QualificationRepository } from "../../../qualification/ports/qualification-repository.ts";
import type { ResearchRepository } from "../../../research/ports/research-repository.ts";
import type { MeetingAttemptRepository } from "../../../scheduling/ports/meeting-attempt-repository.ts";
import type { AttendanceOverviewItem, AttendanceStageStatus } from "../audit-dto.ts";

export class ListAttendanceOverviewUseCase {
  constructor(
    private readonly leads: LeadRepository,
    private readonly research: ResearchRepository,
    private readonly conversations: ConversationRepository,
    private readonly qualifications: QualificationRepository,
    private readonly meetings: MeetingAttemptRepository,
  ) {}

  async execute(): Promise<AttendanceOverviewItem[]> {
    const leads = await this.leads.list();
    const attendances = await Promise.all(leads.map(async (lead) => {
      const [run, session, qualification, meetings] = await Promise.all([
        this.research.getLatestRun(lead.id, lead.executionId),
        this.conversations.getLatestSession(lead.id, lead.executionId),
        this.qualifications.getLatestByLead(lead.id, lead.executionId),
        this.meetings.listByLead(lead.id, lead.executionId),
      ]);
      const latestMeeting = meetings.at(-1);
      return {
        leadId: lead.id,
        executionId: lead.executionId,
        fullName: lead.normalized.fullName,
        email: lead.normalized.email,
        company: lead.normalized.company,
        submittedAt: lead.createdAt,
        stages: {
          research: researchStatus(run?.status ?? lead.research.status),
          conversation: conversationStatus(session?.status ?? lead.conversation.status),
          spiced: qualification ? "completed" : session?.status === "finalizing" ? "in_progress" : session?.status === "failed" ? "failed" : "pending",
          meeting: meetingStatus(latestMeeting?.status),
        },
      } satisfies AttendanceOverviewItem;
    }));
    return attendances.sort((left, right) => right.submittedAt.localeCompare(left.submittedAt) || left.leadId.localeCompare(right.leadId));
  }
}

function researchStatus(status: string): AttendanceStageStatus {
  if (status === "ready" || status === "partial") return "completed";
  if (status === "running") return "in_progress";
  if (status === "failed" || status === "cancelled") return "failed";
  return "pending";
}

function conversationStatus(status: string): AttendanceStageStatus {
  if (status === "completed") return "completed";
  if (["connecting", "active", "finalizing"].includes(status)) return "in_progress";
  if (status === "failed" || status === "abandoned") return "failed";
  return "pending";
}

function meetingStatus(status: string | undefined): AttendanceStageStatus {
  if (status === "confirmed") return "completed";
  if (status === "conflict") return "conflict";
  if (["failed", "cancelled"].includes(status ?? "")) return "failed";
  if (["offered", "pending", "uncertain"].includes(status ?? "")) return "in_progress";
  return "pending";
}
