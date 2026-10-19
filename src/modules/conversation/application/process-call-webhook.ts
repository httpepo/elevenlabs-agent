import { createHash, randomUUID } from "node:crypto";
import { createConversationArtifact } from "../domain/conversation-artifact.ts";
import { webhookIdempotencyKey, type VerifiedCallWebhook, type WebhookEvent } from "../domain/call-webhook.ts";
import type { ConversationRepository } from "../ports/conversation-repository.ts";
import type { ConversationArtifactRepository } from "../ports/conversation-artifact-repository.ts";
import type { WebhookEventRepository } from "../ports/webhook-event-repository.ts";
import type { CallWebhookVerifier } from "../ports/call-webhook-verifier.ts";
import type { ExtractSpicedQualificationUseCase } from "../../qualification/application/use-cases/extract-spiced-qualification.ts";
import type { ConversationProcessingJob, ConversationProcessingQueue } from "../ports/conversation-processing-queue.ts";

export class ProcessCallWebhookUseCase {
  constructor(
    private readonly verifier: CallWebhookVerifier,
    private readonly conversations: ConversationRepository,
    private readonly artifacts: ConversationArtifactRepository,
    private readonly webhooks: WebhookEventRepository,
    private readonly qualification: ExtractSpicedQualificationUseCase,
    private readonly processingQueue?: ConversationProcessingQueue,
  ) {}

  async execute(input: { rawBody: string; signature: string | null }) {
    let webhook: VerifiedCallWebhook;
    try {
      webhook = this.verifier.verify(input);
    } catch (error) {
      await this.recordRejected(input.rawBody, error);
      return { outcome: "rejected" as const, message: "Assinatura do webhook inválida." };
    }

    const existing = await this.webhooks.getByExternalCallAndType(webhook.externalCallId, webhook.eventType);
    if (existing?.status === "processed" || existing?.status === "ignored") return { outcome: "duplicate" as const, message: "Evento já processado." };
    const event = existing ?? await this.webhooks.recordReceived(toWebhookEvent(webhook));
    const session = await this.conversations.findSessionByExternalCallId(webhook.externalCallId);
    if (!session) {
      await this.webhooks.updateStatus({ eventId: event.id, status: "ignored", errorReason: "Conversa externa sem sessão de voz conhecida.", processedAt: new Date().toISOString() });
      return { outcome: "unassociated" as const, message: "Evento válido sem sessão de voz associada." };
    }

    try {
      await this.appendArtifacts(webhook, session);
      if (this.processingQueue) {
        await this.conversations.transitionSession({ sessionId: session.id, status: "finalizing", reason: "Transcrição salva; qualificação enfileirada.", externalCallId: webhook.externalCallId });
        await this.processingQueue.enqueue(toProcessingJob(webhook));
        return { outcome: "queued" as const, message: "Artefatos salvos; qualificação enfileirada." };
      }
      const qualification = await this.qualification.execute({
        leadId: session.leadId,
        executionId: session.executionId,
        voiceSessionId: session.id,
        externalCallId: webhook.externalCallId,
        eventType: webhook.eventType,
        idempotencyKey: `${webhook.externalCallId}:${webhook.eventType}`,
        transcript: webhook.transcript ?? "",
      });
      if (qualification.status === "failed") {
        await this.failSession(session.id, webhook.externalCallId, qualification.error ?? "A extração SPICED falhou.");
      } else {
        await this.completeSession(session.id, webhook.externalCallId);
      }
      const webhookStatus = qualification.status === "failed" ? "failed" as const : "processed" as const;
      await this.webhooks.updateStatus({
        eventId: event.id,
        status: webhookStatus,
        errorReason: qualification.error ?? null,
        processedAt: new Date().toISOString(),
      });
      return {
        outcome: qualification.status === "failed" ? "failed" as const : "processed" as const,
        message: qualification.status === "failed" ? "Conversa salva, mas a qualificação falhou; o webhook pode ser reenviado." : "Artefatos de conversa processados.",
        qualificationStatus: qualification.status,
      };
    } catch (error) {
      await this.webhooks.updateStatus({ eventId: event.id, status: "failed", errorReason: publicError(error), processedAt: new Date().toISOString() });
      throw error;
    }
  }

  async executeQueued(job: ConversationProcessingJob): Promise<void> {
    const session = await this.conversations.findSessionByExternalCallId(job.externalCallId);
    if (!session) throw new Error("Sessão de voz não encontrada para o processamento enfileirado.");
    const event = await this.webhooks.getByExternalCallAndType(job.externalCallId, job.eventType);
    if (!event) throw new Error("Evento de webhook não encontrado para o processamento enfileirado.");
    const result = await this.qualification.execute({
      leadId: session.leadId, executionId: session.executionId, voiceSessionId: session.id,
      externalCallId: job.externalCallId, eventType: job.eventType,
      idempotencyKey: `${job.externalCallId}:${job.eventType}`, transcript: job.transcript,
    });
    if (result.status === "failed") {
      await this.failSession(session.id, job.externalCallId, result.error ?? "A extração SPICED falhou.");
      await this.webhooks.updateStatus({ eventId: event.id, status: "failed", errorReason: result.error ?? "A extração SPICED falhou.", processedAt: new Date().toISOString() });
      throw new Error(result.error ?? "A extração SPICED falhou.");
    }
    await this.completeSession(session.id, job.externalCallId);
    await this.webhooks.updateStatus({ eventId: event.id, status: "processed", errorReason: null, processedAt: new Date().toISOString() });
  }

  private async appendArtifacts(webhook: VerifiedCallWebhook, session: { id: string; leadId: string; executionId: string }) {
    const artifacts = [
      webhook.transcript ? { type: "transcript" as const, content: webhook.transcript } : null,
      webhook.summary ? { type: "summary" as const, content: webhook.summary } : null,
    ].filter((artifact): artifact is { type: "transcript" | "summary"; content: string } => artifact !== null);
    for (const artifact of artifacts) {
      const contentHash = createHash("sha256").update(artifact.content).digest("hex");
      if (await this.artifacts.hasHash(session.id, artifact.type, contentHash)) continue;
      await this.artifacts.appendArtifact(createConversationArtifact({
        id: randomUUID(), voiceSessionId: session.id, leadId: session.leadId, executionId: session.executionId,
        externalCallId: webhook.externalCallId, type: artifact.type, content: artifact.content, contentHash,
        occurredAt: webhook.occurredAt,
      }));
    }
  }

  private async completeSession(sessionId: string, externalCallId: string): Promise<void> {
    const current = await this.conversations.getSession(sessionId);
    if (!current || ["completed", "abandoned", "failed"].includes(current.status)) return;
    if (current.status === "active") {
      await this.conversations.transitionSession({ sessionId, status: "finalizing", reason: "Webhook pós-chamada recebido.", externalCallId });
    }
    const latest = await this.conversations.getSession(sessionId);
    if (latest?.status === "finalizing") {
      await this.conversations.transitionSession({ sessionId, status: "completed", reason: "Webhook pós-chamada processado.", externalCallId });
    }
  }

  private async failSession(sessionId: string, externalCallId: string, reason: string): Promise<void> {
    const current = await this.conversations.getSession(sessionId);
    if (!current || ["completed", "abandoned", "failed"].includes(current.status)) return;
    await this.conversations.transitionSession({
      sessionId,
      status: "failed",
      reason: `Processamento pós-chamada: ${reason}`,
      externalCallId,
    });
  }

  private async recordRejected(rawBody: string, error: unknown): Promise<void> {
    const eventId = `rejected:${createHash("sha256").update(rawBody).digest("hex")}`;
    const existing = await this.webhooks.getByExternalEventId(eventId);
    if (existing) return;
    await this.webhooks.recordReceived({
      id: randomUUID(), externalEventId: eventId, externalCallId: null, eventType: "invalid_signature", status: "failed",
      payload: { rejected: true }, errorReason: publicError(error), receivedAt: new Date().toISOString(), processedAt: new Date().toISOString(),
    });
  }
}

function toProcessingJob(webhook: VerifiedCallWebhook): ConversationProcessingJob {
  return {
    externalCallId: webhook.externalCallId,
    eventType: webhook.eventType,
    transcript: webhook.transcript ?? "",
    summary: webhook.summary,
    occurredAt: webhook.occurredAt,
  };
}

function toWebhookEvent(webhook: VerifiedCallWebhook): WebhookEvent {
  return {
    id: randomUUID(), externalEventId: webhookIdempotencyKey(webhook), externalCallId: webhook.externalCallId, eventType: webhook.eventType,
    status: "received", payload: webhook.payload, errorReason: null, receivedAt: new Date().toISOString(), processedAt: null,
  };
}

function publicError(error: unknown): string {
  return (error instanceof Error ? error.message : "Falha ao processar webhook.").replace(/[\r\n]+/g, " ").slice(0, 300);
}
