import "server-only";

type Environment = Readonly<Record<string, string | undefined>>;

const optionalNames = [
  "DATABASE_URL", "DATABASE_URL_UNPOOLED", "NEON_BRANCH", "TAVILY_API_KEY",
  "GEMINI_API_KEY", "GEMINI_MODEL", "ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID",
  "ELEVENLABS_WEBHOOK_SECRET", "LEAD_SESSION_SECRET", "AGENDA_BASE_URL", "AGENDA_TOKEN",
  "AGENDA_AUTH_HEADER", "AGENDA_AUTH_PREFIX", "PANEL_USERNAME", "PANEL_PASSWORD",
] as const;

type OptionalName = typeof optionalNames[number];
export type ServerEnvironment = Partial<Record<OptionalName, string>> & { APP_MODE: "demo" | "live" };

export class EnvironmentError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    // Inclui apenas nomes de variáveis; nunca seus valores ou erros de URL.
    super(`Configuração inválida: ${variables.join(", ")}. Confira .env.example.`);
    this.name = "EnvironmentError";
    this.variables = variables;
  }
}

/** Validação local, sem ler arquivos, fazer requests ou exigir futuras chaves. */
export function parseServerEnvironment(input: Environment): ServerEnvironment {
  const invalid: string[] = [];
  const mode = input.APP_MODE?.trim() || "demo";
  if (mode !== "demo" && mode !== "live") invalid.push("APP_MODE");

  const result = { APP_MODE: mode } as ServerEnvironment;
  for (const name of optionalNames) {
    const value = input[name]?.trim();
    if (value) result[name] = value;
    if (input[`NEXT_PUBLIC_${name}`]?.trim()) invalid.push(`NEXT_PUBLIC_${name}`);
  }

  for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "AGENDA_BASE_URL"] as const) {
    const value = result[name];
    if (!value) continue;
    try {
      const url = new URL(value);
      const protocols = name === "AGENDA_BASE_URL" ? ["http:", "https:"] : ["postgres:", "postgresql:"];
      if (!protocols.includes(url.protocol) || !url.hostname ||
          (name === "AGENDA_BASE_URL" && (url.username || url.password || url.search || url.hash))) invalid.push(name);
    } catch {
      invalid.push(name);
    }
  }

  if (result.AGENDA_TOKEN && /[\r\n]/.test(result.AGENDA_TOKEN)) invalid.push("AGENDA_TOKEN");
  if (result.AGENDA_AUTH_HEADER && result.AGENDA_AUTH_HEADER.toLowerCase() !== "authorization") invalid.push("AGENDA_AUTH_HEADER");
  if (result.AGENDA_AUTH_PREFIX && result.AGENDA_AUTH_PREFIX !== "Bearer") invalid.push("AGENDA_AUTH_PREFIX");
  if (result.PANEL_USERNAME && /[:\r\n]/.test(result.PANEL_USERNAME)) invalid.push("PANEL_USERNAME");
  if (result.PANEL_PASSWORD && result.PANEL_PASSWORD.length < 24) invalid.push("PANEL_PASSWORD");
  if (result.LEAD_SESSION_SECRET && result.LEAD_SESSION_SECRET.length < 32) invalid.push("LEAD_SESSION_SECRET");
  if (result.ELEVENLABS_WEBHOOK_SECRET && /https?:\/\/|[\r\n]/i.test(result.ELEVENLABS_WEBHOOK_SECRET)) invalid.push("ELEVENLABS_WEBHOOK_SECRET");

  if (invalid.length) throw new EnvironmentError([...new Set(invalid)]);
  return result;
}

/** Sob demanda: importar um módulo não exige segredos nem abre conexão. */
export function getServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment(process.env);
}

export const integrationRequirements = {
  database: ["DATABASE_URL", "DATABASE_URL_UNPOOLED"],
  research: ["TAVILY_API_KEY", "GEMINI_API_KEY", "GEMINI_MODEL"],
  voice: ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "ELEVENLABS_WEBHOOK_SECRET", "LEAD_SESSION_SECRET"],
  calendar: ["AGENDA_BASE_URL", "AGENDA_TOKEN"],
} as const satisfies Record<string, readonly OptionalName[]>;
