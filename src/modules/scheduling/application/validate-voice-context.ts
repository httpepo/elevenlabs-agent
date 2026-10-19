import type { LeadRecord } from "../../leads/domain/lead.ts";
import type { LeadRepository } from "../../leads/ports/lead-repository.ts";
import type { VoiceSession } from "../../conversation/domain/voice-session.ts";
import type { ConversationRepository } from "../../conversation/ports/conversation-repository.ts";
import { SchedulingAuthorizationError } from "./scheduling-errors.ts";

const activeVoiceStatuses: VoiceSession["status"][] = ["ready", "connecting", "active", "finalizing"];

export async function getAuthorizedVoiceContext(
  leads: LeadRepository,
  conversations: ConversationRepository,
  input: { leadId: string; voiceSessionId: string },
): Promise<{ lead: LeadRecord; session: VoiceSession }> {
  const lead = await leads.get(input.leadId);
  if (!lead) throw new SchedulingAuthorizationError("Visitante não encontrado.", "not_found", 404);
  const session = await conversations.getSession(input.voiceSessionId);
  if (!session || session.leadId !== lead.id || session.executionId !== lead.executionId || !activeVoiceStatuses.includes(session.status)) {
    throw new SchedulingAuthorizationError("Sessão de voz não autorizada para esta operação.", "invalid_session", 409);
  }
  return { lead, session };
}
