import "server-only";
import { getDatabase } from "./client.ts";
import { isLeadId, type LeadRecord, type LeadSubmissionRecord } from "../../modules/leads/domain/lead.ts";
import type { LeadCaptureRepository, PersistedLeadCapture } from "../../modules/leads/ports/lead-repository.ts";

type Row = Record<string, unknown>;
type Database = ReturnType<typeof getDatabase>;

export class NeonLeadRepository implements LeadCaptureRepository {
  async get(id: string): Promise<LeadRecord | null> {
    if (!isLeadId(id)) return null;
    const sql = getDatabase();
    const rows = await sql`${leadProjection(sql)} WHERE l.id = ${id}`;
    return rows[0] ? mapLead(rows[0]) : null;
  }

  async list(): Promise<LeadRecord[]> {
    const sql = getDatabase();
    const rows = await sql`${leadProjection(sql)} ORDER BY l.created_at DESC, l.id`;
    return rows.map(mapLead);
  }

  async findSubmissionByIdempotencyKey(key: string): Promise<LeadSubmissionRecord | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT id, lead_id, execution_id, idempotency_key, original, normalized, received_at
      FROM lead_submissions WHERE idempotency_key = ${key}`;
    return rows[0] ? mapSubmission(rows[0]) : null;
  }

  async persistCapture(lead: LeadRecord, submission: LeadSubmissionRecord): Promise<PersistedLeadCapture> {
    if (lead.id !== submission.leadId || lead.executionId !== submission.executionId || lead.submissionId !== submission.id) {
      throw new Error("Cadastro e submissão possuem identificadores incompatíveis.");
    }
    const sql = getDatabase();
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${submission.idempotencyKey}, 0))`,
      insertLead(sql, lead, submission.idempotencyKey),
      insertSubmission(sql, submission),
      appendEvents(sql, lead),
    ], { isolationLevel: "ReadCommitted" });
    const persistedSubmission = await this.findSubmissionByIdempotencyKey(submission.idempotencyKey);
    const persistedLead = persistedSubmission ? await this.get(persistedSubmission.leadId) : null;
    if (!persistedSubmission || !persistedLead) throw new Error("Não foi possível recuperar o cadastro persistido.");
    return { lead: persistedLead, submission: persistedSubmission, created: persistedSubmission.id === submission.id };
  }

  async save(lead: LeadRecord): Promise<void> {
    const sql = getDatabase();
    const [updated] = await sql.transaction([
      sql`UPDATE leads SET normalized = ${JSON.stringify(lead.normalized)}::jsonb,
        briefing = ${JSON.stringify(lead.briefing)}::jsonb, spiced = ${JSON.stringify(lead.spiced)}::jsonb,
        conversation = ${JSON.stringify(lead.conversation)}::jsonb, meeting = ${JSON.stringify(lead.meeting)}::jsonb,
        research_status = ${lead.research.status}, research_run_id = ${lead.research.runId},
        research_sources = ${JSON.stringify(lead.research.sources)}::jsonb
        WHERE id = ${lead.id} AND execution_id = ${lead.executionId} AND submission_id = ${lead.submissionId}
        RETURNING id`,
      appendEvents(sql, lead),
    ]);
    if (!updated.length) throw new Error("Cadastro não encontrado para atualização.");
  }
}

function insertLead(sql: Database, lead: LeadRecord, key: string) {
  return sql`INSERT INTO leads (id, execution_id, submission_id, mode, normalized, briefing, spiced,
      conversation, meeting, research_status, research_run_id, research_sources, created_at)
    SELECT ${lead.id}::uuid, ${lead.executionId}::uuid, ${lead.submissionId}::uuid, ${lead.mode}, ${JSON.stringify(lead.normalized)}::jsonb,
      ${JSON.stringify(lead.briefing)}::jsonb, ${JSON.stringify(lead.spiced)}::jsonb,
      ${JSON.stringify(lead.conversation)}::jsonb, ${JSON.stringify(lead.meeting)}::jsonb,
      ${lead.research.status}, ${lead.research.runId}::uuid, ${JSON.stringify(lead.research.sources)}::jsonb, ${lead.createdAt}::timestamptz
    WHERE NOT EXISTS (SELECT 1 FROM lead_submissions WHERE idempotency_key = ${key})`;
}

function insertSubmission(sql: Database, submission: LeadSubmissionRecord) {
  return sql`INSERT INTO lead_submissions (id, lead_id, execution_id, idempotency_key, original, normalized, received_at)
    SELECT ${submission.id}::uuid, ${submission.leadId}::uuid, ${submission.executionId}::uuid, ${submission.idempotencyKey},
      ${JSON.stringify(submission.original)}::jsonb, ${JSON.stringify(submission.normalized)}::jsonb, ${submission.receivedAt}::timestamptz
    WHERE EXISTS (SELECT 1 FROM leads WHERE id = ${submission.leadId})
    ON CONFLICT (idempotency_key) DO NOTHING`;
}

function appendEvents(sql: Database, lead: LeadRecord) {
  return sql`INSERT INTO lead_events (id, lead_id, execution_id, payload, occurred_at)
    SELECT (entry->>'id')::uuid, ${lead.id}::uuid, ${lead.executionId}::uuid, entry, (entry->>'timestamp')::timestamptz
    FROM jsonb_array_elements(${JSON.stringify(lead.trace)}::jsonb) AS entry
    WHERE EXISTS (SELECT 1 FROM leads WHERE id = ${lead.id} AND execution_id = ${lead.executionId} AND submission_id = ${lead.submissionId})
    ON CONFLICT (id) DO NOTHING`;
}

function leadProjection(sql: Database) {
  return sql`SELECT l.*, s.original,
    COALESCE((SELECT jsonb_agg(e.payload ORDER BY e.occurred_at, e.id)
      FROM lead_events e WHERE e.lead_id = l.id AND e.execution_id = l.execution_id), '[]'::jsonb) AS trace
    FROM leads l JOIN lead_submissions s ON s.id = l.submission_id`;
}

function mapLead(row: Row): LeadRecord {
  return {
    id: String(row.id), executionId: String(row.execution_id), submissionId: String(row.submission_id),
    createdAt: new Date(String(row.created_at)).toISOString(), mode: row.mode as LeadRecord["mode"],
    original: jsonValue(row.original), normalized: jsonValue(row.normalized),
    briefing: jsonValue(row.briefing), spiced: jsonValue(row.spiced),
    conversation: jsonValue(row.conversation), meeting: jsonValue(row.meeting), trace: jsonValue(row.trace),
    research: { status: row.research_status as LeadRecord["research"]["status"],
      runId: row.research_run_id ? String(row.research_run_id) : null, sources: jsonValue(row.research_sources) },
  };
}

function mapSubmission(row: Row): LeadSubmissionRecord {
  return {
    id: String(row.id), leadId: String(row.lead_id), executionId: String(row.execution_id),
    idempotencyKey: String(row.idempotency_key), receivedAt: new Date(String(row.received_at)).toISOString(),
    original: jsonValue(row.original), normalized: jsonValue(row.normalized),
  };
}

function jsonValue<T>(value: unknown): T {
  return typeof value === "string" ? JSON.parse(value) as T : value as T;
}
