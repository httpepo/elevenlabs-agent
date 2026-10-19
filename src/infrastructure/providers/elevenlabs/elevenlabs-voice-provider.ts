import "server-only";
import { getServerEnvironment } from "../../config/env.ts";
import { VoiceProviderError, type VoiceProvider } from "../../../modules/conversation/ports/voice-provider.ts";

const TOKEN_ENDPOINT = "https://api.elevenlabs.io/v1/convai/conversation/token";
const REQUEST_TIMEOUT_MS = 8_000;

export class ElevenLabsVoiceProvider implements VoiceProvider {
  async prepareSession(input: { participantName: string }) {
    const environment = getServerEnvironment();
    if (!environment.ELEVENLABS_API_KEY || !environment.ELEVENLABS_AGENT_ID) {
      throw new VoiceProviderError("A integração de voz não está configurada no servidor.", "configuration");
    }
    const url = new URL(TOKEN_ENDPOINT);
    url.searchParams.set("agent_id", environment.ELEVENLABS_AGENT_ID);
    url.searchParams.set("participant_name", input.participantName.slice(0, 120));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", "xi-api-key": environment.ELEVENLABS_API_KEY },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new VoiceProviderError("O provedor de voz recusou a autorização da sessão.", "unavailable", response.status);
      const payload = await readTokenPayload(response);
      return {
        conversationToken: payload.token,
        agentId: environment.ELEVENLABS_AGENT_ID,
        externalCallId: payload.conversationId,
      };
    } catch (error) {
      if (error instanceof VoiceProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new VoiceProviderError("O provedor de voz demorou para responder.", "timeout");
      }
      throw new VoiceProviderError("Não foi possível autorizar a conversa de voz.", "unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readTokenPayload(response: Response): Promise<{ token: string; conversationId: string }> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new VoiceProviderError("O provedor de voz retornou uma resposta inválida.", "invalid_response");
  }
  if (typeof payload !== "object" || payload === null) {
    throw new VoiceProviderError("O provedor de voz retornou uma resposta inválida.", "invalid_response");
  }
  const data = payload as Record<string, unknown>;
  if (typeof data.token !== "string" || !data.token || typeof data.conversation_id !== "string" || !data.conversation_id) {
    throw new VoiceProviderError("O provedor de voz não retornou um token de conversa.", "invalid_response");
  }
  return { token: data.token, conversationId: data.conversation_id };
}
