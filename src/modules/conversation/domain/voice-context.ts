import type { LeadForm } from "../../leads/domain/lead.ts";
import type { Briefing, ResearchFact } from "../../research/domain/briefing.ts";
import { buildVoiceQualificationPrompt } from "./voice-prompt-templates.ts";

export type VoiceContextVariables = Readonly<{
  lead_id: string;
  visitor_name: string;
  company_name: string;
  company_website: string;
  company_sector: string;
  company_size: string;
  company_services: string;
  operational_complexity: string;
  spiced_gaps: string;
  spiced_prompt: string;
  voice_session_id: string;
  opening_instruction: string;
}>;

export function compileVoiceContext(input: {
  leadId: string;
  lead: LeadForm;
  briefing: Briefing;
  voiceSessionId: string;
}): VoiceContextVariables {
  const sector = findFact(input.briefing.facts, ["company_sector", "sector", "industry"]);
  const size = findFact(input.briefing.facts, ["company_size", "employee_count", "employees"]) || input.lead.employeeCount;
  const services = findFact(input.briefing.facts, ["company_services", "services", "activity"]);
  const complexity = findFact(input.briefing.facts, ["operational_complexity", "complexity"]);
  const normalizedSector = sector || "não confirmado publicamente";
  const normalizedSize = size || "não confirmado publicamente";
  const normalizedServices = services || "não confirmado publicamente";
  const normalizedComplexity = complexity || "não confirmado publicamente";
  const gaps = input.briefing.gaps.map((gap) => gap.prompt.trim()).filter(Boolean);
  const verifiedContext = input.briefing.facts.map((fact) => formatFact(fact));
  const openingInstruction = sector
    ? `Cumprimente ${firstName(input.lead.fullName)}, identifique-se como assistente virtual da Atlas, reconheça o setor confirmado (${sector}) e pergunte o que motivou o interesse agora.`
    : `Cumprimente ${firstName(input.lead.fullName)}, identifique-se como assistente virtual da Atlas, agradeça o interesse na plataforma financeira e peça o contexto atual da empresa.`;
  const spicedPrompt = buildVoiceQualificationPrompt({
    visitorName: input.lead.fullName,
    companyName: input.lead.company,
    verifiedContext,
    gaps: input.briefing.gaps,
  });

  return {
    lead_id: input.leadId,
    visitor_name: firstName(input.lead.fullName),
    company_name: input.lead.company,
    company_website: input.lead.website || "não informado",
    company_sector: normalizedSector,
    company_size: normalizedSize,
    company_services: normalizedServices,
    operational_complexity: normalizedComplexity,
    spiced_gaps: gaps.length ? gaps.join(" | ") : "Nenhuma lacuna mapeada; confirme informações relevantes sem repetir o formulário.",
    spiced_prompt: spicedPrompt,
    voice_session_id: input.voiceSessionId,
    opening_instruction: openingInstruction,
  };
}

function formatFact(fact: ResearchFact): string {
  const provenance = fact.sourceIds.includes("form_submission") ? "formulário" : "fonte pública";
  return `${fact.field}: ${fact.value} (origem: ${provenance})`;
}

function findFact(facts: ResearchFact[], fields: string[]): string | null {
  const fieldSet = new Set(fields);
  const fact = facts.find((candidate) => fieldSet.has(candidate.field) && candidate.value.trim());
  return fact?.value.trim() || null;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "visitante";
}
