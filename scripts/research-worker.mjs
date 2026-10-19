import { randomUUID } from "node:crypto";
import { loadProjectEnvironment } from "./load-env.mjs";

loadProjectEnvironment();
const { researchRuntime } = await import("../src/infrastructure/bootstrap.ts");

const workerId = `research-worker:${randomUUID()}`;
const leaseMs = 60_000;
const once = process.argv.includes("--once");

async function processOne() {
  const job = await researchRuntime.jobQueue.claim(workerId, leaseMs);
  if (!job) return false;
  try {
    const run = await researchRuntime.researchRepository.getRun(job.researchRunId);
    await researchRuntime.runResearch.execute({
      leadId: job.leadId,
      researchRunId: job.researchRunId,
      allowRecovery: run?.status === "running",
    });
    await researchRuntime.jobQueue.complete(job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no job de pesquisa.";
    const result = await researchRuntime.jobQueue.fail(job.id, message);
    if (!result.retry) throw new Error(`Job de pesquisa esgotou tentativas: ${message}`);
  }
  return true;
}

do {
  const processed = await processOne();
  if (!processed && !once) await new Promise((resolve) => setTimeout(resolve, 1_000));
  if (!processed && once) break;
} while (!once);
