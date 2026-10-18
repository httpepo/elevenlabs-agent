import type { ResearchResult } from "../../research/domain/briefing.ts";

// Contrato inicial para WebRTC; não emite tokens nem cria agentes.
export interface VoiceProvider {
  prepareSession(input: { leadId: string; briefing: ResearchResult }): Promise<{
    conversationToken: string;
    agentId: string;
  }>;
}
