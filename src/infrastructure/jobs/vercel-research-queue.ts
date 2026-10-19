import "server-only";
import { handleCallback, send } from "@vercel/queue";
import { isLeadId } from "../../modules/leads/domain/lead.ts";
import { isTerminalResearchStatus, type EnqueueResearchInput } from "../../modules/research/domain/research-run.ts";
import type { ResearchQueue, StartResearchJob } from "../../modules/research/ports/research-queue.ts";
import type { ProcessResearchJob } from "../../modules/research/application/process-research-job.ts";

const topic = "atlas-research";

export class VercelResearchQueue implements ResearchQueue {
  constructor(private readonly persistedQueue: ResearchQueue) {}

  async enqueue(input: EnqueueResearchInput) {
    const run = await this.persistedQueue.enqueue(input);
    if (!isTerminalResearchStatus(run.status)) {
      await send(topic, { type: "start_research", leadId: run.leadId, executionId: run.executionId, researchRunId: run.id }, {
        idempotencyKey: `research:${run.id}`,
        retentionSeconds: 3600,
      });
    }
    return run;
  }
}

export function createResearchConsumer(processor: ProcessResearchJob) {
  return (request: Request) => handleCallback<unknown>(async (message) => {
      if (!isResearchMessage(message)) throw new InvalidResearchMessage();
      await processor.execute(message);
    }, {
      retry: (error, metadata) => error instanceof InvalidResearchMessage
        ? { acknowledge: true }
        : { afterSeconds: Math.min(60, metadata.deliveryCount * 5) },
    })(request);
}

class InvalidResearchMessage extends Error {}

function isResearchMessage(value: unknown): value is StartResearchJob {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.type === "start_research" &&
    [message.leadId, message.executionId, message.researchRunId].every((id) => typeof id === "string" && isLeadId(id));
}
