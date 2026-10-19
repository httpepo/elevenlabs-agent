import { conversationRuntime } from "@/infrastructure/bootstrap";
import { deploymentAccess } from "@/infrastructure/bootstrap";
import { readLeadSessionCredential } from "@/infrastructure/bootstrap";
import { VoiceAuthorizationError } from "@/modules/conversation/application/prepare-voice-session";
import { type VoiceBrowserEvent } from "@/modules/conversation/application/process-voice-session-event";

export const runtime = "nodejs";

const browserEvents = new Set<VoiceBrowserEvent>(["connecting", "connected", "finalizing", "abandoned", "failed", "disconnected"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!deploymentAccess.isEnabled()) return Response.json({ error: "Eventos da conversa indisponíveis neste ambiente." }, { status: 503 });
  const { id } = await context.params;
  let payload: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 8_192) return Response.json({ error: "Evento muito grande." }, { status: 413 });
    payload = JSON.parse(text);
  } catch {
    return Response.json({ error: "Envie um evento de voz válido." }, { status: 400 });
  }
  if (!isBrowserEventPayload(payload)) return Response.json({ error: "Evento de voz incompleto." }, { status: 400 });
  try {
    const session = await conversationRuntime.processBrowserEvent.execute({
      leadId: id,
      sessionId: payload.voiceSessionId,
      event: payload.event,
      reason: payload.reason,
      credential: readLeadSessionCredential(request),
    });
    return Response.json({ voiceSessionId: session.id, status: session.status });
  } catch (error) {
    if (error instanceof VoiceAuthorizationError) return Response.json({ error: error.message, code: error.kind }, { status: error.status });
    console.error("Falha ao registrar evento de voz", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Não foi possível registrar o estado da conversa." }, { status: 500 });
  }
}

function isBrowserEventPayload(value: unknown): value is { voiceSessionId: string; event: VoiceBrowserEvent; reason?: string } {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.voiceSessionId === "string" && payload.voiceSessionId.length <= 100 &&
    typeof payload.event === "string" && browserEvents.has(payload.event as VoiceBrowserEvent) &&
    (payload.reason === undefined || typeof payload.reason === "string");
}
