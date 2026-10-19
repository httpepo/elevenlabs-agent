import { objectionCatalog, specialistFallback, type ObjectionDefinition } from "./objection-catalog.ts";

export function buildVoiceObjectionPrompt(): string {
  return [
    "MAPA DE OBJEÇÕES AUTORIZADO:",
    "Use a orientação da categoria correspondente com naturalidade, sem recitar o mapa, seus códigos ou as fontes. Faça uma pergunta por vez e respeite a recusa.",
    "As respostas são orientações comerciais, não fatos sobre o visitante. Não diga que houve encaminhamento, contato ou reserva sem registro ou confirmação real.",
    ...objectionCatalog.map(formatObjection),
    `SEM RESPOSTA AUTORIZADA: ${specialistFallback}`,
    "Não improvise condições comerciais. Registre a dúvida para o especialista sem prometer reunião já marcada ou contato automático.",
  ].join("\n");
}

function formatObjection(definition: ObjectionDefinition): string {
  return [
    `OBJEÇÃO: ${definition.label} (${definition.category})`,
    `Exemplos: ${definition.triggers.join("; ")}.`,
    `Resposta prevista: ${definition.response}`,
    `Próximo passo: ${definition.nextStep}`,
    `Limites: ${definition.limits}`,
    ...definition.authorizedClaims.map((claim) => `Fato autorizado: ${claim.text}`),
  ].join("\n");
}
