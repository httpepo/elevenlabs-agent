import { conversationRuntime } from "@/infrastructure/bootstrap";
import { deploymentAccess } from "@/infrastructure/bootstrap";
import { readLeadSessionCredential } from "@/infrastructure/bootstrap";
import { VoiceAuthorizationError } from "@/modules/conversation/application/prepare-voice-session";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!deploymentAccess.isEnabled()) return Response.json({ error: "Status da conversa indisponível neste ambiente." }, { status: 503 });
  const { id } = await context.params;
  try {
    const result = await conversationRuntime.getVoiceSessionStatus.execute({
      leadId: id,
      credential: readLeadSessionCredential(request),
    });
    if (result.voiceSessionId && result.processing) {
      const voiceSessionId = result.voiceSessionId;
      after(() => conversationRuntime.recoverConversation(voiceSessionId));
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof VoiceAuthorizationError) return Response.json({ error: error.message, code: error.kind }, { status: error.status });
    console.error("Falha ao consultar sessão de voz", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Não foi possível consultar a conversa por voz." }, { status: 500 });
  }
}
