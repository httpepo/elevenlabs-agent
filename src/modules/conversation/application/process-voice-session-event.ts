import type { ConversationRepository } from "../ports/conversation-repository.ts";
import type { LeadRepository } from "../../leads/ports/lead-repository.ts";
import type { LeadSessionCredentialVerifier } from "../ports/lead-session-credential-verifier.ts";
import { VoiceAuthorizationError } from "./prepare-voice-session.ts";
import type { ScheduleConversationProcessingUseCase } from "./schedule-conversation-processing.ts";

export type VoiceBrowserEvent = "connecting" | "connected" | "finalizing" | "abandoned" | "failed" | "disconnected";

export class ProcessVoiceSessionEventUseCase {
  constructor(
    private readonly leads: LeadRepository,
    private readonly conversations: ConversationRepository,
    private readonly credentials: LeadSessionCredentialVerifier,
    private readonly schedule: ScheduleConversationProcessingUseCase,
  ) {}

  async execute(input: { leadId: string; sessionId: string; credential: string | null; event: VoiceBrowserEvent; reason?: string }) {
    const lead = await this.leads.get(input.leadId);
    if (!lead) throw new VoiceAuthorizationError("Visitante não encontrado.", "not_found", 404);
    if (!input.credential || !(await this.credentials.verify({ credential: input.credential, leadId: lead.id, executionId: lead.executionId }))) {
      throw new VoiceAuthorizationError("Sessão pública inválida ou expirada.", "unauthorized", 401);
    }
    const current = await this.conversations.getSession(input.sessionId);
    if (!current || current.leadId !== lead.id || current.executionId !== lead.executionId) {
      throw new VoiceAuthorizationError("Sessão de voz não encontrada.", "not_found", 404);
    }
    const nextStatus = mapEvent(input.event, current.status);
    if (!nextStatus) return current;
    if (nextStatus === "active" && current.status === "ready") {
      await this.conversations.transitionSession({
        sessionId: current.id,
        status: "connecting",
        reason: "Conexão WebRTC iniciou antes da confirmação do evento connecting.",
      });
    }
    const session = await this.conversations.transitionSession({
      sessionId: current.id,
      status: nextStatus,
      reason: input.reason ?? `Evento do navegador: ${input.event}.`,
    });
    await this.schedule.execute(session.id);
    return session;
  }
}

function mapEvent(event: VoiceBrowserEvent, current: string): "connecting" | "active" | "finalizing" | "abandoned" | "failed" | null {
  if (["completed", "failed", "abandoned"].includes(current)) return null;
  if (current === "finalizing" && ["connecting", "connected"].includes(event)) return null;
  if (event === "connecting") return "connecting";
  if (event === "connected") return "active";
  if (event === "finalizing") return "finalizing";
  if (event === "failed") return "failed";
  if (event === "abandoned" || event === "disconnected") {
    return ["completed", "failed", "abandoned"].includes(current) ? null : "abandoned";
  }
  return null;
}
