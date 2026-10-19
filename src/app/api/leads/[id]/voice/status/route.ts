import { conversationRuntime } from "@/infrastructure/bootstrap";
import { deploymentAccess } from "@/infrastructure/bootstrap";
import { readLeadSessionCredential } from "@/infrastructure/bootstrap";
import { VoiceAuthorizationError } from "@/modules/conversation/application/prepare-voice-session";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!deploymentAccess.isEnabled()) return Response.json({ error: "Status da conversa indisponível neste ambiente." }, { status: 503 });
  const { id } = await context.params;
  try {
    return Response.json(await conversationRuntime.getVoiceSessionStatus.execute({
      leadId: id,
      credential: readLeadSessionCredential(request),
    }));
  } catch (error) {
    if (error instanceof VoiceAuthorizationError) return Response.json({ error: error.message, code: error.kind }, { status: error.status });
    console.error("Falha ao consultar sessão de voz", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Não foi possível consultar a conversa por voz." }, { status: 500 });
  }
}
