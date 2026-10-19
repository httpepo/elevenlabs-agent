import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { transitionVoiceSession, linkExternalCall, type VoiceSession } from "../../modules/conversation/domain/voice-session.ts";
import type { ConversationArtifact } from "../../modules/conversation/domain/conversation-artifact.ts";
import type { WebhookEvent, WebhookEventStatus } from "../../modules/conversation/domain/call-webhook.ts";
import type { ConversationRepository } from "../../modules/conversation/ports/conversation-repository.ts";
import type { ConversationArtifactRepository } from "../../modules/conversation/ports/conversation-artifact-repository.ts";
import type { WebhookEventRepository } from "../../modules/conversation/ports/webhook-event-repository.ts";
import type { VoiceToolExecution, VoiceToolExecutionRepository } from "../../modules/conversation/ports/voice-tool-execution-repository.ts";
import { sanitizePayload } from "../../modules/audit/domain/sanitizer.ts";

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

export class FileConversationRepository implements ConversationRepository, ConversationArtifactRepository, WebhookEventRepository, VoiceToolExecutionRepository {
  readonly directory: string;
  private readonly pendingArtifactWrites = new Map<string, Promise<void>>();

  constructor(directory = path.join(process.cwd(), ".data", "conversation")) {
    this.directory = directory;
  }

  async createSession(session: VoiceSession): Promise<void> {
    await this.writeIfAbsent("sessions", session.id, session);
  }

  async getSession(id: string): Promise<VoiceSession | null> { return this.read("sessions", id); }

  async getLatestSession(leadId: string, executionId: string): Promise<VoiceSession | null> {
    const sessions = await this.list<VoiceSession>("sessions");
    return sessions.filter((session) => session.leadId === leadId && session.executionId === executionId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }

  async findSessionByExternalCallId(externalCallId: string): Promise<VoiceSession | null> {
    const sessions = await this.list<VoiceSession>("sessions");
    return sessions.find((session) => session.externalCallId === externalCallId) ?? null;
  }

  async transitionSession(input: Parameters<ConversationRepository["transitionSession"]>[0]): Promise<VoiceSession> {
    const current = await this.getSession(input.sessionId);
    if (!current) throw new Error("Sessão de voz não encontrada.");
    const linked = input.externalCallId ? linkExternalCall(current, input.externalCallId) : current;
    const next = transitionVoiceSession(linked, input.status, input.reason);
    await this.write("sessions", next.id, next);
    if (next.transitions.length > linked.transitions.length) {
      await this.write("transitions", randomUUID(), next.transitions.at(-1));
    }
    return next;
  }

  async appendArtifact(artifact: ConversationArtifact): Promise<void> {
    const artifactKey = `${artifact.voiceSessionId}:${artifact.type}:${artifact.contentHash}`;
    const pendingWrite = this.pendingArtifactWrites.get(artifactKey);
    if (pendingWrite) {
      await pendingWrite;
      return;
    }

    const writeOperation = this.persistArtifact(artifact);
    this.pendingArtifactWrites.set(artifactKey, writeOperation);
    try {
      await writeOperation;
    } finally {
      if (this.pendingArtifactWrites.get(artifactKey) === writeOperation) this.pendingArtifactWrites.delete(artifactKey);
    }
  }

  private async persistArtifact(artifact: ConversationArtifact): Promise<void> {
    if (await this.hasHash(artifact.voiceSessionId, artifact.type, artifact.contentHash)) return;
    await this.writeIfAbsent("artifacts", artifact.id, artifact);
  }

  async hasHash(voiceSessionId: string, type: ConversationArtifact["type"], contentHash: string): Promise<boolean> {
    const artifacts = await this.list<ConversationArtifact>("artifacts");
    return artifacts.some((artifact) => artifact.voiceSessionId === voiceSessionId && artifact.type === type && artifact.contentHash === contentHash);
  }

  async listArtifactsByLead(leadId: string, executionId?: string): Promise<ConversationArtifact[]> {
    const artifacts = await this.list<ConversationArtifact>("artifacts");
    return artifacts
      .filter((artifact) => artifact.leadId === leadId && (!executionId || artifact.executionId === executionId))
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  async getByExternalEventId(externalEventId: string): Promise<WebhookEvent | null> {
    const eventIndex = createHash("sha256").update(externalEventId).digest("hex");
    return this.read("webhook-events", eventIndex);
  }

  async getByExternalCallAndType(externalCallId: string, eventType: string): Promise<WebhookEvent | null> {
    const events = await this.list<WebhookEvent>("webhook-events");
    return events.find((event) => event.externalCallId === externalCallId && event.eventType === eventType) ?? null;
  }

  async recordReceived(event: WebhookEvent): Promise<WebhookEvent> {
    const key = createHash("sha256").update(event.externalEventId).digest("hex");
    const existing = await this.getByExternalEventId(event.externalEventId);
    if (existing) return existing;
    try {
      await this.writeIfAbsent("webhook-events", key, event);
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
    return (await this.getByExternalEventId(event.externalEventId)) ?? event;
  }

  async updateStatus(input: { eventId: string; status: WebhookEventStatus; errorReason?: string | null; processedAt?: string | null }): Promise<WebhookEvent> {
    const events = await this.list<WebhookEvent>("webhook-events");
    const current = events.find((event) => event.id === input.eventId);
    if (!current) throw new Error("Evento de webhook não encontrado.");
    const next = { ...current, status: input.status, errorReason: input.errorReason === undefined ? current.errorReason : input.errorReason, processedAt: input.processedAt === undefined ? current.processedAt : input.processedAt };
    const key = createHash("sha256").update(current.externalEventId).digest("hex");
    await this.write("webhook-events", key, next);
    return next;
  }

  async appendToolExecution(execution: VoiceToolExecution): Promise<void> {
    await this.writeIfAbsent("tool-executions", execution.id, {
      ...execution,
      input: sanitizePayload(execution.input),
      output: sanitizePayload(execution.output),
    });
  }

  private async writeIfAbsent(folder: string, id: string, value: unknown): Promise<void> {
    const directory = path.join(this.directory, folder);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, `${id}.json`), JSON.stringify(value, null, 2), { flag: "wx", mode: 0o600 });
  }

  private async write(folder: string, id: string, value: unknown): Promise<void> {
    const directory = path.join(this.directory, folder);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `${id}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(value, null, 2), { flag: "wx", mode: 0o600 });
      await rename(temporary, path.join(directory, `${id}.json`));
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  private async read<T>(folder: string, id: string): Promise<T | null> {
    try { return JSON.parse(await readFile(path.join(this.directory, folder, `${id}.json`), "utf8")) as T; }
    catch (error) { if (isMissing(error)) return null; throw error; }
  }

  private async list<T>(folder: string): Promise<T[]> {
    try {
      const names = (await readdir(path.join(this.directory, folder))).filter((name) => name.endsWith(".json"));
      const values = await Promise.all(names.map((name) => this.read<T>(folder, name.slice(0, -5))));
      return values.filter((value) => value !== null) as T[];
    } catch (error) { if (isMissing(error)) return []; throw error; }
  }
}

export const fileConversationRepository = new FileConversationRepository();
