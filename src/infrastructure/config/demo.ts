import "server-only";

export function isLocalDemo(): boolean {
  return process.env.NODE_ENV === "development" && (process.env.APP_MODE ?? "demo") === "demo";
}

export type IntegrationChecklistStatus = "local_demo" | "configured" | "pending";

export type IntegrationChecklistItem = Readonly<{
  name: string;
  detail: string;
  status: IntegrationChecklistStatus;
  statusLabel: string;
  nextStep: string;
}>;

export function getIntegrationChecklist(): IntegrationChecklistItem[] {
  const localDemo = isLocalDemo();
  return [
    createIntegrationItem(
      "Pesquisa · Tavily / Gemini",
      "Pesquisa pública e síntese do briefing",
      hasEnvironmentValues("TAVILY_API_KEY", "GEMINI_API_KEY") ? "configured" : localDemo ? "local_demo" : "pending",
      "As credenciais indicam configuração presente; a execução externa ainda precisa ser validada.",
    ),
    createIntegrationItem(
      "Voz · ElevenLabs",
      "Sessão bidirecional pelo navegador",
      hasEnvironmentValues("ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID") ? "configured" : localDemo ? "local_demo" : "pending",
      "O agente recebe o briefing e os eventos pós-chamada ficam rastreáveis quando a integração responde.",
    ),
    createIntegrationItem(
      "Persistência · Neon PostgreSQL",
      "Dados de produção e histórico append-only",
      hasEnvironmentValues("DATABASE_URL") ? "configured" : localDemo ? "local_demo" : "pending",
      "Com DATABASE_URL, o app consulta o Neon; sem ela, arquivos locais são usados somente na demonstração.",
    ),
    createIntegrationItem(
      "Agenda · Calendar API",
      "Disponibilidade e reserva explícita",
      hasEnvironmentValues("AGENDA_BASE_URL", "AGENDA_TOKEN") ? "configured" : localDemo ? "local_demo" : "pending",
      "A reserva só é confirmada após resposta de sucesso da API externa.",
    ),
  ];
}

// Mantido para consumidores legados; páginas server-side usam a função para ler o ambiente atual.
export const integrationChecklist = getIntegrationChecklist();

function hasEnvironmentValues(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

function createIntegrationItem(
  name: string,
  detail: string,
  status: IntegrationChecklistStatus,
  nextStep: string,
): IntegrationChecklistItem {
  return {
    name,
    detail,
    status,
    statusLabel: status === "configured" ? "Configurado · não validado" : status === "local_demo" ? "Demo local" : "Pendente",
    nextStep,
  };
}
