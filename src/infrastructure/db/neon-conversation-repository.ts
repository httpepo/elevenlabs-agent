import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./client.ts";
import { linkExternalCall, transitionVoiceSession, type VoiceSession } from "../../modules/conversation/domain/voice-session.ts";
import type { ConversationArtifact } from "../../modules/conversation/domain/conversation-artifact.ts";
import type { WebhookEvent, WebhookEventStatus } from "../../modules/conversation/domain/call-webhook.ts";
import type { ConversationRepository } from "../../modules/conversation/ports/conversation-repository.ts";
import type { ConversationArtifactRepository } from "../../modules/conversation/ports/conversation-artifact-repository.ts";
import type { WebhookEventRepository } from "../../modules/conversation/ports/webhook-event-repository.ts";
import type { VoiceToolExecution, VoiceToolExecutionRepository } from "../../modules/conversation/ports/voice-tool-execution-repository.ts";
import { sanitizePayload } from "../../modules/audit/domain/sanitizer.ts";

type Row = Record<string, unknown>;

export class NeonConversationRepository implements ConversationRepository, ConversationArtifactRepository, WebhookEventRepository, VoiceToolExecutionRepository {
  async createSession(session: VoiceSession): Promise<void> {
    const sql = getDatabase();
    await sql`INSERT INTO voice_sessions (id, lead_id, execution_id, briefing_id, status, created_at, duration_ms)
      VALUES (${session.id}, ${session.leadId}, ${session.executionId}, ${session.briefingId}, ${session.status}, ${session.createdAt}, ${session.durationMs})`;
  }

  async getSession(id: string): Promise<VoiceSession | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM voice_sessions WHERE id = ${id} LIMIT 1` as Row[];
    return rows[0] ? this.mapSession(rows[0]) : null;
  }

  async getLatestSession(leadId: string, executionId: string): Promise<VoiceSession | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM voice_sessions WHERE lead_id = ${leadId} AND execution_id = ${executionId} ORDER BY created_at DESC LIMIT 1` as Row[];
    return rows[0] ? this.mapSession(rows[0]) : null;
  }

  async findSessionByExternalCallId(externalCallId: string): Promise<VoiceSession | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM voice_sessions WHERE external_call_id = ${externalCallId} LIMIT 1` as Row[];
    return rows[0] ? this.mapSession(rows[0]) : null;
  }

  async transitionSession(input: Parameters<ConversationRepository["transitionSession"]>[0]): Promise<VoiceSession> {
    const current = await this.getSession(input.sessionId);
    if (!current) throw new Error("Sessão de voz não encontrada.");
    const linked = input.externalCallId ? linkExternalCall(current, input.externalCallId) : current;
    const next = transitionVoiceSession(linked, input.status, input.reason);
    const sql = getDatabase();
    const rows = await sql`UPDATE voice_sessions SET status = ${next.status}, external_call_id = ${next.externalCallId},
      connecting_at = ${next.connectingAt}, active_at = ${next.activeAt}, finalizing_at = ${next.finalizingAt},
      completed_at = ${next.completedAt}, abandoned_at = ${next.abandonedAt}, failed_at = ${next.failedAt}, duration_ms = ${next.durationMs}, failure_reason = ${next.failureReason}
      WHERE id = ${next.id} AND status = ${current.status} RETURNING *` as Row[];
    if (!rows[0]) {
      const latest = await this.getSession(next.id);
      if (latest?.status === next.status) return latest;
      throw new Error("A sessão de voz mudou antes da transição.");
    }
    const transition = next.transitions.length > linked.transitions.length ? next.transitions.at(-1) : null;
    if (transition) await sql`INSERT INTO voice_session_transitions (id, voice_session_id, from_status, to_status, reason, occurred_at)
      VALUES (${transition.id}, ${next.id}, ${transition.from}, ${transition.to}, ${transition.reason}, ${transition.occurredAt}) ON CONFLICT (id) DO NOTHING`;
    return this.mapSession(rows[0], next.transitions);
  }

  async appendArtifact(artifact: ConversationArtifact): Promise<void> {
    const sql = getDatabase();
    await sql`INSERT INTO conversation_artifacts (id, voice_session_id, lead_id, execution_id, external_call_id, artifact_type, content, content_hash, occurred_at, created_at)
      VALUES (${artifact.id}, ${artifact.voiceSessionId}, ${artifact.leadId}, ${artifact.executionId}, ${artifact.externalCallId}, ${artifact.type}, ${artifact.content}, ${artifact.contentHash}, ${artifact.occurredAt}, ${artifact.createdAt})
      ON CONFLICT DO NOTHING`;
  }

  async hasHash(voiceSessionId: string, type: ConversationArtifact["type"], contentHash: string): Promise<boolean> {
    const sql = getDatabase();
    const rows = await sql`SELECT 1 FROM conversation_artifacts WHERE voice_session_id = ${voiceSessionId} AND artifact_type = ${type} AND content_hash = ${contentHash} LIMIT 1` as Row[];
    return Boolean(rows[0]);
  }

  async listArtifactsByLead(leadId: string, executionId?: string): Promise<ConversationArtifact[]> {
    const sql = getDatabase();
    const rows = executionId
      ? await sql`SELECT * FROM conversation_artifacts WHERE lead_id = ${leadId} AND execution_id = ${executionId} ORDER BY occurred_at ASC` as Row[]
      : await sql`SELECT * FROM conversation_artifacts WHERE lead_id = ${leadId} ORDER BY occurred_at ASC` as Row[];
    return rows.map(mapArtifact);
  }

  async getByExternalEventId(externalEventId: string): Promise<WebhookEvent | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM webhook_events WHERE external_event_id = ${externalEventId} LIMIT 1` as Row[];
    return rows[0] ? mapWebhookEvent(rows[0]) : null;
  }

  async getByExternalCallAndType(externalCallId: string, eventType: string): Promise<WebhookEvent | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM webhook_events WHERE external_call_id = ${externalCallId} AND event_type = ${eventType} ORDER BY received_at DESC LIMIT 1` as Row[];
    return rows[0] ? mapWebhookEvent(rows[0]) : null;
  }

  async recordReceived(event: WebhookEvent): Promise<WebhookEvent> {
    const sql = getDatabase();
    await sql`INSERT INTO webhook_events (id, external_event_id, external_call_id, event_type, status, payload, error_reason, received_at)
      VALUES (${event.id}, ${event.externalEventId}, ${event.externalCallId}, ${event.eventType}, ${event.status}, ${JSON.stringify(event.payload)}::jsonb, ${event.errorReason}, ${event.receivedAt})
      ON CONFLICT (external_event_id) DO NOTHING`;
    return (await this.getByExternalEventId(event.externalEventId)) ?? event;
  }

  async updateStatus(input: { eventId: string; status: WebhookEventStatus; errorReason?: string | null; processedAt?: string | null }): Promise<WebhookEvent> {
    const current = await this.findWebhookById(input.eventId);
    if (!current) throw new Error("Evento de webhook não encontrado.");
    const nextError = input.errorReason === undefined ? current.errorReason : input.errorReason;
    const nextProcessedAt = input.processedAt === undefined ? current.processedAt : input.processedAt;
    const sql = getDatabase();
    const rows = await sql`UPDATE webhook_events SET status = ${input.status}, error_reason = ${nextError}, processed_at = ${nextProcessedAt}
      WHERE id = ${input.eventId} RETURNING *` as Row[];
    return rows[0] ? mapWebhookEvent(rows[0]) : { ...current, status: input.status, errorReason: nextError, processedAt: nextProcessedAt };
  }

  async appendToolExecution(execution: VoiceToolExecution): Promise<void> {
    const sql = getDatabase();
    await sql`INSERT INTO tool_executions (id, lead_id, execution_id, research_run_id, voice_session_id, provider, operation, status, duration_ms, input_payload, output_payload, created_at)
      VALUES (${execution.id}, ${execution.leadId}, ${execution.executionId}, NULL, ${execution.voiceSessionId}, ${execution.provider}, ${execution.operation}, ${execution.status}, ${execution.durationMs}, ${JSON.stringify(sanitizePayload(execution.input))}::jsonb, ${JSON.stringify(sanitizePayload(execution.output))}::jsonb, ${execution.createdAt})
      ON CONFLICT (id) DO NOTHING`;
  }

  private async findWebhookById(id: string): Promise<WebhookEvent | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM webhook_events WHERE id = ${id} LIMIT 1` as Row[];
    return rows[0] ? mapWebhookEvent(rows[0]) : null;
  }

  private async mapSession(row: Row, knownTransitions?: VoiceSession["transitions"]): Promise<VoiceSession> {
    const sql = getDatabase();
    const transitions = knownTransitions ?? (await sql`SELECT id, from_status, to_status, reason, occurred_at FROM voice_session_transitions WHERE voice_session_id = ${String(row.id)} ORDER BY occurred_at ASC` as Row[]).map((transition) => ({
      id: String(transition.id), from: transition.from_status as VoiceSession["status"], to: transition.to_status as VoiceSession["status"], reason: String(transition.reason), occurredAt: new Date(String(transition.occurred_at)).toISOString(),
    }));
    return {
      id: String(row.id), leadId: String(row.lead_id), executionId: String(row.execution_id), briefingId: String(row.briefing_id),
      externalCallId: row.external_call_id ? String(row.external_call_id) : null, status: row.status as VoiceSession["status"],
      createdAt: new Date(String(row.created_at)).toISOString(), connectingAt: toIso(row.connecting_at), activeAt: toIso(row.active_at),
      finalizingAt: toIso(row.finalizing_at), completedAt: toIso(row.completed_at), abandonedAt: toIso(row.abandoned_at), failedAt: toIso(row.failed_at),
      durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
      failureReason: row.failure_reason ? String(row.failure_reason) : null, transitions,
    };
  }
}

function mapArtifact(row: Row): ConversationArtifact {
  return {
    id: String(row.id),
    voiceSessionId: String(row.voice_session_id),
    leadId: String(row.lead_id),
    executionId: String(row.execution_id),
    externalCallId: String(row.external_call_id),
    type: row.artifact_type as ConversationArtifact["type"],
    content: String(row.content),
    contentHash: String(row.content_hash),
    occurredAt: new Date(String(row.occurred_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapWebhookEvent(row: Row): WebhookEvent {
  return {
    id: String(row.id), externalEventId: String(row.external_event_id), externalCallId: row.external_call_id ? String(row.external_call_id) : null,
    eventType: String(row.event_type), status: row.status as WebhookEvent["status"], payload: parseJson(row.payload, {}),
    errorReason: row.error_reason ? String(row.error_reason) : null, receivedAt: new Date(String(row.received_at)).toISOString(), processedAt: toIso(row.processed_at),
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") { try { return JSON.parse(value) as T; } catch { return fallback; } }
  return (value as T | null) ?? fallback;
}

function toIso(value: unknown): string | null { return value ? new Date(String(value)).toISOString() : null; }

export const neonConversationRepository = new NeonConversationRepository();
