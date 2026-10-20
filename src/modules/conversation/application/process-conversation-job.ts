import { randomUUID } from "node:crypto";
import { ConversationProcessingRetry, conversationProcessingLeaseMs, conversationProcessingMaxAttempts } from "../domain/conversation-processing.ts";
import type { ConversationProcessingRepository } from "../ports/conversation-processing-repository.ts";
import type { ConversationRepository } from "../ports/conversation-repository.ts";
import type { ConversationArtifactRepository } from "../ports/conversation-artifact-repository.ts";
import type { ConversationResultProvider } from "../ports/conversation-result-provider.ts";
import type { WebhookEventRepository } from "../ports/webhook-event-repository.ts";
import type { VoiceToolExecutionRepository } from "../ports/voice-tool-execution-repository.ts";
import type { ExtractSpicedQualificationUseCase } from "../../qualification/application/use-cases/extract-spiced-qualification.ts";
import type { VoiceSession } from "../domain/voice-session.ts";
import { SaveConversationArtifacts } from "./save-conversation-artifacts.ts";

export class ProcessConversationJobUseCase {
  constructor(
    private readonly jobs: ConversationProcessingRepository,
    private readonly conversations: ConversationRepository,
    private readonly artifacts: ConversationArtifactRepository,
    private readonly results: ConversationResultProvider,
    private readonly qualification: ExtractSpicedQualificationUseCase,
    private readonly webhooks: WebhookEventRepository,
    private readonly tools: VoiceToolExecutionRepository,
  ) {}

  async execute(voiceSessionId: string, redeliverWhenBusy = false): Promise<void> {
    const owner = randomUUID();
    const job = await this.jobs.claim(voiceSessionId, owner, conversationProcessingLeaseMs);
    if (!job) {
      const existing = await this.jobs.get(voiceSessionId);
      if (redeliverWhenBusy && existing && ["running", "queued"].includes(existing.status)) {
        throw new ConversationProcessingRetry(3, "Aguardando a tentativa que já está em execução.");
      }
      return;
    }
    try {
      const session = await this.conversations.getSession(voiceSessionId);
      if (!session?.externalCallId) throw new Error("A sessão não possui uma conversa externa vinculada.");
      const transcript = await this.getTranscript(session);
      const result = await this.qualification.execute({
        leadId: session.leadId, executionId: session.executionId, voiceSessionId,
        externalCallId: session.externalCallId, eventType: "post_call_transcription",
        idempotencyKey: `${session.externalCallId}:post_call_transcription`, transcript,
      });
      if (result.status === "failed") throw new Error(result.error ?? "Falha na extração SPICED.");
      await this.completeSession(session);
      await this.updateWebhook(session.externalCallId);
      await this.jobs.finish({ voiceSessionId, owner, status: "completed", error: null, delaySeconds: 0 });
      console.info("conversation_processing_completed", { voiceSessionId, attempts: job.attempts, elapsedMs: Date.now() - Date.parse(job.requestedAt) });
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Falha no pós-processamento.").slice(0, 300);
      const failed = job.attempts >= conversationProcessingMaxAttempts && Date.now() - Date.parse(job.requestedAt) >= 60_000;
      const delaySeconds = error instanceof ConversationProcessingRetry ? error.afterSeconds : job.attempts < 3 ? 2 : 10;
      await this.jobs.finish({ voiceSessionId, owner, status: failed ? "failed" : "queued", error: message, delaySeconds });
      if (failed) return;
      throw new ConversationProcessingRetry(delaySeconds, message);
    }
  }

  private async getTranscript(session: VoiceSession): Promise<string> {
    const saved = await this.artifacts.listArtifactsByLead(session.leadId, session.executionId);
    const own = saved.filter((item) => item.voiceSessionId === session.id);
    if (own.some((item) => item.type === "transcript") && own.some((item) => item.type === "summary")) {
      return own.filter((item) => item.type === "transcript").at(-1)!.content;
    }
    const startedAt = Date.now();
    const result = await this.results.getResult(session.externalCallId!);
    await this.tools.appendToolExecution({
      id: randomUUID(), leadId: session.leadId, executionId: session.executionId, voiceSessionId: session.id,
      provider: "elevenlabs", operation: "get_conversation_result", status: "success", durationMs: Date.now() - startedAt,
      input: { externalCallId: session.externalCallId }, output: { status: result.status, hasSummary: Boolean(result.summary) }, createdAt: new Date().toISOString(),
    });
    if (result.status === "pending") throw new ConversationProcessingRetry(2, "Aguardando a ElevenLabs concluir a conversa.");
    await new SaveConversationArtifacts(this.artifacts).execute(session, { ...result, externalCallId: session.externalCallId! });
    if (result.failureReason && !["failed", "abandoned", "completed"].includes(session.status)) {
      await this.conversations.transitionSession({ sessionId: session.id, status: "failed", reason: result.failureReason });
    }
    if (!result.transcript || !result.summary) throw new ConversationProcessingRetry(3, "Aguardando a transcrição e o resumo do provedor de voz.");
    return result.transcript;
  }

  private async completeSession(session: VoiceSession): Promise<void> {
    const current = await this.conversations.getSession(session.id);
    if (current?.status !== "finalizing") return;
    await this.conversations.transitionSession({ sessionId: session.id, status: "completed", reason: "Resumo e SPICED persistidos pelo worker." });
  }

  private async updateWebhook(externalCallId: string): Promise<void> {
    const event = await this.webhooks.getByExternalCallAndType(externalCallId, "post_call_transcription");
    if (event) await this.webhooks.updateStatus({ eventId: event.id, status: "processed", errorReason: null, processedAt: new Date().toISOString() });
  }
}
