import "server-only";

// A base ainda não tem autenticação interna nem persistência para hospedagem.
// Falhar em produção impede expor registros enquanto essas partes são construídas.
export function isLocalDemo(): boolean {
  return process.env.NODE_ENV === "development" && (process.env.APP_MODE ?? "demo") === "demo";
}

export const integrationChecklist = [
  { name: "Pesquisa · Tavily / Gemini", detail: "Pesquisa pública e síntese do briefing", nextStep: "As credenciais e a execução real são configuradas no servidor." },
  { name: "Voz · ElevenLabs", detail: "Sessão bidirecional pelo navegador", nextStep: "O agente recebe o briefing e os eventos pós-chamada ficam rastreáveis." },
  { name: "Persistência · Neon PostgreSQL", detail: "Dados de produção e histórico append-only", nextStep: "Com DATABASE_URL, o app persiste no Neon. Sem essa variável, arquivos são usados somente no desenvolvimento local." },
  { name: "Agenda · Calendar API", detail: "Disponibilidade e reserva explícita", nextStep: "A reserva só é confirmada após resposta de sucesso da API externa." },
];
