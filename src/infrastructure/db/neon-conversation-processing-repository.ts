import "server-only";
import { getDatabase } from "./client.ts";
import type { ConversationProcessing } from "../../modules/conversation/domain/conversation-processing.ts";
import type { ConversationProcessingRepository } from "../../modules/conversation/ports/conversation-processing-repository.ts";

export class NeonConversationProcessingRepository implements ConversationProcessingRepository {
  async ensure(voiceSessionId: string): Promise<ConversationProcessing> {
    const sql = getDatabase();
    await sql`INSERT INTO conversation_processing_jobs (voice_session_id) VALUES (${voiceSessionId}) ON CONFLICT DO NOTHING`;
    return (await this.get(voiceSessionId))!;
  }

  async get(voiceSessionId: string): Promise<ConversationProcessing | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM conversation_processing_jobs WHERE voice_session_id = ${voiceSessionId}`;
    return rows[0] ? mapProcessing(rows[0]) : null;
  }

  async claim(voiceSessionId: string, owner: string, leaseMs: number): Promise<ConversationProcessing | null> {
    const sql = getDatabase();
    const rows = await sql`UPDATE conversation_processing_jobs
      SET status = 'running', attempts = attempts + 1, lease_owner = ${owner},
        lease_until = NOW() + (${leaseMs} * INTERVAL '1 millisecond'), updated_at = NOW()
      WHERE voice_session_id = ${voiceSessionId} AND
        ((status = 'queued' AND available_at <= NOW()) OR (status = 'running' AND lease_until <= NOW()))
      RETURNING *`;
    return rows[0] ? mapProcessing(rows[0]) : null;
  }

  async finish(input: Parameters<ConversationProcessingRepository["finish"]>[0]): Promise<void> {
    const sql = getDatabase();
    await sql`UPDATE conversation_processing_jobs SET status = ${input.status},
      last_error = ${input.error}, lease_until = NULL, lease_owner = NULL, updated_at = NOW(),
      available_at = NOW() + (${input.delaySeconds} * INTERVAL '1 second')
      WHERE voice_session_id = ${input.voiceSessionId} AND lease_owner = ${input.owner}`;
  }

  async listPending(): Promise<string[]> {
    const sql = getDatabase();
    const rows = await sql`SELECT voice_session_id FROM conversation_processing_jobs
      WHERE (status = 'queued' AND available_at <= NOW()) OR (status = 'running' AND lease_until <= NOW())
      ORDER BY requested_at LIMIT 20`;
    return rows.map((row) => String(row.voice_session_id));
  }
}

function mapProcessing(row: Record<string, unknown>): ConversationProcessing {
  return {
    voiceSessionId: String(row.voice_session_id), status: row.status as ConversationProcessing["status"],
    attempts: Number(row.attempts), requestedAt: new Date(String(row.requested_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(), availableAt: new Date(String(row.available_at)).toISOString(),
    leaseUntil: row.lease_until ? new Date(String(row.lease_until)).toISOString() : null,
    leaseOwner: row.lease_owner ? String(row.lease_owner) : null, lastError: row.last_error ? String(row.last_error) : null,
  };
}
