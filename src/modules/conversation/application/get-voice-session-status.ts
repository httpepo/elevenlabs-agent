import type { ConversationRepository } from "../ports/conversation-repository.ts";
import type { LeadRepository } from "../../leads/ports/lead-repository.ts";
import type { LeadSessionCredentialVerifier } from "../ports/lead-session-credential-verifier.ts";
import { VoiceAuthorizationError } from "./prepare-voice-session.ts";
import type { ConversationProcessingRepository } from "../ports/conversation-processing-repository.ts";
import { conversationProcessingView } from "./conversation-processing-view.ts";

export class GetVoiceSessionStatusUseCase {
  constructor(
    private readonly leads: LeadRepository,
    private readonly conversations: ConversationRepository,
    private readonly credentials: LeadSessionCredentialVerifier,
    private readonly processingJobs: ConversationProcessingRepository,
  ) {}

  async execute(input: { leadId: string; credential: string | null }) {
    const lead = await this.leads.get(input.leadId);
    if (!lead) throw new VoiceAuthorizationError("Visitante não encontrado.", "not_found", 404);
    if (!input.credential || !(await this.credentials.verify({ credential: input.credential, leadId: lead.id, executionId: lead.executionId }))) {
      throw new VoiceAuthorizationError("Sessão pública inválida ou expirada.", "unauthorized", 401);
    }
    const session = await this.conversations.getLatestSession(lead.id, lead.executionId);
    const job = session ? await this.processingJobs.get(session.id) : null;
    return {
      ...conversationProcessingView(session, job, false, job?.status === "completed"),
      leadId: lead.id,
      executionId: lead.executionId,
      voiceSessionId: session?.id ?? null,
      status: session?.status ?? "not_started",
      failureReason: session?.failureReason ?? null,
      durationMs: session?.durationMs ?? null,
      createdAt: session?.createdAt ?? null,
      completedAt: session?.completedAt ?? null,
      finalizingAt: session?.finalizingAt ?? null,
    };
  }
}
