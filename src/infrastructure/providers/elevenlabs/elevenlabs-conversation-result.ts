import "server-only";
import { getServerEnvironment } from "../../config/env.ts";
import type { ConversationResult, ConversationResultProvider } from "../../../modules/conversation/ports/conversation-result-provider.ts";

export class ElevenLabsConversationResultProvider implements ConversationResultProvider {
  async getResult(externalCallId: string): Promise<ConversationResult> {
    const env = getServerEnvironment();
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(externalCallId)}`, {
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY ?? "" }, cache: "no-store", signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`A recuperação da conversa de voz retornou HTTP ${response.status}.`);
    const data = await response.json();
    if (data.agent_id !== env.ELEVENLABS_AGENT_ID || data.conversation_id !== externalCallId) {
      throw new Error("O resultado de voz não pertence ao agente ou conversa esperados.");
    }
    const ended = data.status === "done" || data.status === "failed";
    const reason = typeof data.metadata?.termination_reason === "string" ? data.metadata.termination_reason : "";
    const failed = data.status === "failed" || /error|maximum duration|exceeded|timeout|disconnect.*error/i.test(reason);
    return {
      status: ended ? failed ? "failed" : "ready" : "pending",
      transcript: Array.isArray(data.transcript) && data.transcript.length ? JSON.stringify(data.transcript) : null,
      summary: typeof data.analysis?.transcript_summary === "string" ? data.analysis.transcript_summary : null,
      occurredAt: new Date((data.metadata?.start_time_unix_secs ?? Date.now() / 1000) * 1000).toISOString(),
      failureReason: failed ? `Voz interrompida: ${reason || "falha informada pelo provedor"}`.slice(0, 300) : null,
    };
  }
}
