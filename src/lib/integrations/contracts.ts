// Compatibilidade com os contratos iniciais; novos imports usam cada módulo.
export type { ResearchFact, ResearchResult } from "../../modules/research/domain/briefing.ts";
export type { ResearchProvider } from "../../modules/research/ports/research-provider.ts";
export type { VoiceProvider } from "../../modules/conversation/ports/voice-provider.ts";
export type { CalendarProvider } from "../../modules/scheduling/ports/calendar-provider.ts";
