import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { loadProjectEnvironment } from "./load-env.mjs";

loadProjectEnvironment();
const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
if (project.projectName !== "elevenlabs-agent") throw new Error("Confirme o vínculo ao projeto elevenlabs-agent antes de configurar o ambiente.");
const credentials = parseEnv(await readFile(".secrets/publication.env", "utf8"));
const environment = { ...process.env, ...credentials, APP_MODE: "live" };
const names = [
  "APP_MODE", "DATABASE_URL", "DATABASE_URL_UNPOOLED", "NEON_BRANCH",
  "TAVILY_API_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID", "ELEVENLABS_WEBHOOK_SECRET", "LEAD_SESSION_SECRET",
  "AGENDA_BASE_URL", "AGENDA_TOKEN", "AGENDA_AUTH_HEADER", "AGENDA_AUTH_PREFIX",
  "PANEL_USERNAME", "PANEL_PASSWORD",
];
const configured = names.filter((name) => environment[name]?.trim());
for (let offset = 0; offset < configured.length; offset += 3) {
  await Promise.all(configured.slice(offset, offset + 3).map(configureVariable));
}
console.log(`Ambiente production configurado: ${configured.length} variáveis; nenhum valor foi exibido.`);
const missing = names.filter((name) => !environment[name]?.trim());
if (missing.length) console.log(`Pendências: ${missing.join(", ")}.`);

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
