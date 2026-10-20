import { conversationRuntime } from "@/infrastructure/bootstrap";
import { after } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 256_000) return Response.json({ error: "Webhook muito grande." }, { status: 413 });
    const result = await conversationRuntime.processCallWebhook.execute({
      rawBody,
      signature: request.headers.get("ElevenLabs-Signature"),
    });
    if (result.outcome === "rejected") return Response.json({ error: result.message }, { status: 401 });
    if (result.outcome === "unassociated") return Response.json({ message: result.message }, { status: 202 });
    if (result.outcome === "queued") {
      after(() => conversationRuntime.recoverConversation(result.voiceSessionId));
      return Response.json({ message: result.message, qualificationStatus: "queued" }, { status: 202 });
    }
    return Response.json({ message: result.message }, { status: 200 });
  } catch (error) {
    console.error("Falha ao processar webhook de voz", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Webhook recebido, mas não pôde ser processado." }, { status: 500 });
  }
}
