import { setTimeout } from "node:timers/promises";
import { loadProjectEnvironment } from "./load-env.mjs";

loadProjectEnvironment();
const { conversationRuntime } = await import("../src/infrastructure/bootstrap.ts");
while (true) {
  for (const voiceSessionId of await conversationRuntime.conversationProcessingRepository.listPending()) {
    try { await conversationRuntime.processConversationJob.execute(voiceSessionId); }
    catch (error) { console.warn(error instanceof Error ? error.message : "Falha no worker de conversa."); }
  }
  await setTimeout(2000);
}
