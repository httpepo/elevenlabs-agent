import { loadProjectEnvironment } from "./load-env.mjs";

loadProjectEnvironment();
const { getServerEnvironment } = await import("../src/infrastructure/config/env.ts");
const { ensureElevenLabsAgentPersona } = await import(
  "../src/infrastructure/providers/elevenlabs/elevenlabs-agent-persona-sync.ts"
);

const environment = getServerEnvironment();
if (!environment.ELEVENLABS_API_KEY || !environment.ELEVENLABS_AGENT_ID) {
  console.error("Defina ELEVENLABS_API_KEY e ELEVENLABS_AGENT_ID antes de sincronizar o agente.");
  process.exit(1);
}

await ensureElevenLabsAgentPersona({
  apiKey: environment.ELEVENLABS_API_KEY,
  agentId: environment.ELEVENLABS_AGENT_ID,
});

console.log("Agente ElevenLabs sincronizado como Anderson - Atlas.");
