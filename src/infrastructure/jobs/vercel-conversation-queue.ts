import "server-only";
import { handleCallback, send } from "@vercel/queue";
import type { ConversationProcessingJob, ConversationProcessingQueue } from "../../modules/conversation/ports/conversation-processing-queue.ts";

const topic = "atlas-conversation-processing";

export class VercelConversationProcessingQueue implements ConversationProcessingQueue {
  async enqueue(job: ConversationProcessingJob): Promise<void> {
    await send(topic, job, {
      idempotencyKey: `conversation:${job.externalCallId}:${job.eventType}`,
      retentionSeconds: 86_400,
    });
  }
}

export function createConversationConsumer(processor: (job: ConversationProcessingJob) => Promise<void>) {
  return (request: Request) => handleCallback<unknown>(async (message) => {
    if (!isConversationJob(message)) throw new InvalidConversationJob();
    await processor(message);
  }, {
    retry: (error, metadata) => error instanceof InvalidConversationJob
      ? { acknowledge: true }
      : { afterSeconds: Math.min(300, metadata.deliveryCount * 15) },
  })(request);
}

class InvalidConversationJob extends Error {}

function isConversationJob(value: unknown): value is ConversationProcessingJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Record<string, unknown>;
  return typeof job.externalCallId === "string" && typeof job.eventType === "string" &&
    typeof job.transcript === "string" && (job.summary === null || typeof job.summary === "string") &&
    typeof job.occurredAt === "string";
}
