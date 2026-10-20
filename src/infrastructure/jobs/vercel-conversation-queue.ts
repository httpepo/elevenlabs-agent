import "server-only";
import { handleCallback, send } from "@vercel/queue";
import type { ConversationProcessingJob, ConversationProcessingQueue } from "../../modules/conversation/ports/conversation-processing-queue.ts";
import { ConversationProcessingRetry } from "../../modules/conversation/domain/conversation-processing.ts";

const topic = "atlas-conversation-processing";

export class VercelConversationProcessingQueue implements ConversationProcessingQueue {
  async enqueue(job: ConversationProcessingJob): Promise<void> {
    await send(topic, job, {
      idempotencyKey: `conversation-v2:${job.voiceSessionId}:${Math.floor(Date.now() / 10_000)}`,
      retentionSeconds: 86_400,
      region: "gru1",
    });
  }
}

export function createConversationConsumer(processor: (job: ConversationProcessingJob) => Promise<void>) {
  return (request: Request) => handleCallback<unknown>(async (message) => {
    if (!isConversationJob(message)) throw new InvalidConversationJob();
    console.info("conversation_queue_received", { voiceSessionId: message.voiceSessionId });
    await processor(message);
  }, {
    retry: (error, metadata) => error instanceof InvalidConversationJob
      ? { acknowledge: true }
      : { afterSeconds: error instanceof ConversationProcessingRetry ? error.afterSeconds : Math.min(30, metadata.deliveryCount * 2) },
  })(request);
}

class InvalidConversationJob extends Error {}

function isConversationJob(value: unknown): value is ConversationProcessingJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Record<string, unknown>;
  return typeof job.voiceSessionId === "string" && /^[a-f0-9-]{36}$/i.test(job.voiceSessionId);
}
