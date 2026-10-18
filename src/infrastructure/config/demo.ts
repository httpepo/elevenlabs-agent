import "server-only";

// A base ainda não tem autenticação interna nem persistência para hospedagem.
// Falhar em produção impede expor registros enquanto essas partes são construídas.
export function isLocalDemo(): boolean {
  return process.env.NODE_ENV === "development" && (process.env.APP_MODE ?? "demo") === "demo";
}

export const integrationChecklist = [
  { name: "Pesquisa", nextStep: "Conectar busca com fontes e gerar um briefing verificável." },
  { name: "Voz", nextStep: "Configurar o agente ElevenLabs e passar o briefing à sessão." },
  { name: "Agenda", nextStep: "Validar o contrato fornecido por autor e conectar as ferramentas." },
  { name: "Publicação", nextStep: "Adicionar PostgreSQL e autenticação ao painel antes do deploy." },
];
