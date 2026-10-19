import { conversationRuntime } from "@/infrastructure/bootstrap";
import { deploymentAccess } from "@/infrastructure/bootstrap";
import { readLeadSessionCredential } from "@/infrastructure/bootstrap";
import { VoiceAuthorizationError } from "@/modules/conversation/application/prepare-voice-session";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!deploymentAccess.isEnabled()) return Response.json({ error: "Conversa por voz indisponível neste ambiente." }, { status: 503 });
  const { id } = await context.params;
  try {
    const result = await conversationRuntime.prepareVoiceSession.execute({
      leadId: id,
      credential: readLeadSessionCredential(request),
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof VoiceAuthorizationError) return Response.json({ error: error.message, code: error.kind }, { status: error.status });
    if (isVoiceProviderError(error)) return Response.json({ error: "Não foi possível autorizar o microfone agora. Tente novamente." }, { status: 503 });
    console.error("Falha ao preparar sessão de voz", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Não foi possível preparar a conversa por voz." }, { status: 500 });
  }
}

function isVoiceProviderError(error: unknown): boolean {
  return error instanceof Error && error.name === "VoiceProviderError";
}
