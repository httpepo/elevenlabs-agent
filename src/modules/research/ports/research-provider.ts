import type { LeadForm } from "../../leads/domain/lead.ts";
import type { ResearchResult } from "../domain/briefing.ts";

// Sem implementação: Tavily/Gemini serão conectados por adaptadores.
export interface ResearchProvider {
  research(lead: LeadForm): Promise<ResearchResult>;
}
