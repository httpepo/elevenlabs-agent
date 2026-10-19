import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { loadProjectEnvironment } from "./load-env.mjs";

loadProjectEnvironment();
const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
if (project.projectName !== "elevenlabs-agent") throw new Error("Confirme o vínculo ao projeto elevenlabs-agent antes de configurar o ambiente.");
const names = [
  "APP_MODE", "DATABASE_URL", "DATABASE_URL_UNPOOLED", "NEON_BRANCH",
  "TAVILY_API_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID", "ELEVENLABS_WEBHOOK_SECRET", "LEAD_SESSION_SECRET",
  "AGENDA_BASE_URL", "AGENDA_TOKEN", "AGENDA_AUTH_HEADER", "AGENDA_AUTH_PREFIX",
  "PANEL_USERNAME", "PANEL_PASSWORD",
];
const selected = readSelectedNames();
const usesPublicationCredentials = selected.some((name) => ["LEAD_SESSION_SECRET", "PANEL_USERNAME", "PANEL_PASSWORD"].includes(name));
const credentials = usesPublicationCredentials ? parseEnv(await readFile(".secrets/publication.env", "utf8")) : {};
const environment = { ...process.env, ...credentials, APP_MODE: "live" };
if (selected.includes("ELEVENLABS_WEBHOOK_SECRET") && /https?:\/\/|[\r\n]/i.test(environment.ELEVENLABS_WEBHOOK_SECRET ?? "")) {
  throw new Error("ELEVENLABS_WEBHOOK_SECRET deve conter o segredo HMAC da ElevenLabs, nunca uma URL.");
}
const configured = selected.filter((name) => environment[name]?.trim());
if (process.argv.includes("--only") && configured.length !== selected.length) {
  throw new Error(`Preencha as variáveis selecionadas antes de enviar: ${selected.filter((name) => !configured.includes(name)).join(", ")}.`);
}
for (let offset = 0; offset < configured.length; offset += 3) {
  await Promise.all(configured.slice(offset, offset + 3).map(configureVariable));
}
console.log(`Ambiente production configurado: ${configured.length} variáveis; nenhum valor foi exibido.`);
const missing = selected.filter((name) => !environment[name]?.trim());
if (missing.length) console.log(`Pendências: ${missing.join(", ")}.`);

function readSelectedNames() {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.length === 0) return names;
  const requested = argumentsList.slice(1);
  if (argumentsList[0] !== "--only" || requested.length === 0 || requested.some((name) => !names.includes(name))) {
    throw new Error("Uso: node scripts/configure-vercel-env.mjs [--only NOME_DA_VARIAVEL ...].");
  }
  return [...new Set(requested)];
}

function configureVariable(name) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["dlx", "vercel@64.5.0", "env", "add", name, "production", "--sensitive", "--force", "--yes", "--project", project.projectId], {
      env: { ...process.env, VERCEL_TELEMETRY_DISABLED: "1" },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", () => reject(new Error(`Não foi possível iniciar a configuração de ${name}.`)));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`A Vercel recusou configurar ${name}; código ${code}. Nenhum valor foi exibido.`));
      console.log(`Configurada: ${name}.`);
      resolve();
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(environment[name].trim());
  });
}
