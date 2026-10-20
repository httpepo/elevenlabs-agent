import { createHash, randomUUID } from "node:crypto";
import { webhookIdempotencyKey, type VerifiedCallWebhook, type WebhookEvent } from "../domain/call-webhook.ts";
import type { ConversationRepository } from "../ports/conversation-repository.ts";
import type { ConversationArtifactRepository } from "../ports/conversation-artifact-repository.ts";
import type { WebhookEventRepository } from "../ports/webhook-event-repository.ts";
import type { CallWebhookVerifier } from "../ports/call-webhook-verifier.ts";
import type { ScheduleConversationProcessingUseCase } from "./schedule-conversation-processing.ts";
import { SaveConversationArtifacts } from "./save-conversation-artifacts.ts";

export class ProcessCallWebhookUseCase {
  constructor(
    private readonly verifier: CallWebhookVerifier,
    private readonly conversations: ConversationRepository,
    private readonly artifacts: ConversationArtifactRepository,
    private readonly webhooks: WebhookEventRepository,
    private readonly schedule: ScheduleConversationProcessingUseCase,
  ) {}

  async execute(input: { rawBody: string; signature: string | null }) {
    let webhook: VerifiedCallWebhook;
    try { webhook = this.verifier.verify(input); }
    catch (error) {
      await this.recordRejected(input.rawBody, error);
      return { outcome: "rejected" as const, message: "Assinatura do webhook inválida." };
    }
    const existing = await this.webhooks.getByExternalCallAndType(webhook.externalCallId, webhook.eventType);
    if (existing?.status === "processed" || existing?.status === "ignored") return { outcome: "duplicate" as const, message: "Evento já processado." };
    const event = existing ?? await this.webhooks.recordReceived(toWebhookEvent(webhook));
    const session = await this.conversations.findSessionByExternalCallId(webhook.externalCallId);
    if (!session || webhook.eventType !== "post_call_transcription") {
      await this.webhooks.updateStatus({ eventId: event.id, status: "ignored", errorReason: "Evento sem sessão associada ou sem transcrição pós-chamada.", processedAt: new Date().toISOString() });
      return { outcome: "unassociated" as const, message: "Evento registrado sem processamento adicional." };
    }
    await new SaveConversationArtifacts(this.artifacts).execute(session, webhook);
    if (session.status === "active") {
      await this.conversations.transitionSession({ sessionId: session.id, status: "finalizing", reason: "Transcrição pós-chamada recebida." });
    }
    await this.schedule.execute(session.id);
    return { outcome: "queued" as const, voiceSessionId: session.id, message: "Artefatos salvos; qualificação enfileirada." };
  }

  private async recordRejected(rawBody: string, error: unknown): Promise<void> {
    const eventId = `rejected:${createHash("sha256").update(rawBody).digest("hex")}`;
    if (await this.webhooks.getByExternalEventId(eventId)) return;
    await this.webhooks.recordReceived({
      id: randomUUID(), externalEventId: eventId, externalCallId: null, eventType: "invalid_signature", status: "failed",
      payload: { rejected: true }, errorReason: error instanceof Error ? error.message.slice(0, 300) : "Assinatura inválida.",
      receivedAt: new Date().toISOString(), processedAt: new Date().toISOString(),
    });
  }
}

function toWebhookEvent(webhook: VerifiedCallWebhook): WebhookEvent {
  return {
    id: randomUUID(), externalEventId: webhookIdempotencyKey(webhook), externalCallId: webhook.externalCallId,
    eventType: webhook.eventType, status: "received", payload: webhook.payload, errorReason: null,
    receivedAt: new Date().toISOString(), processedAt: null,
  };
}
