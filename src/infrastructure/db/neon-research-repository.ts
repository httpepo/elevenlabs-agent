import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./client.ts";
import { transitionResearchRun, type EnqueueResearchInput, type ResearchRun } from "../../modules/research/domain/research-run.ts";
import type { Briefing, ResearchSource } from "../../modules/research/domain/briefing.ts";
import type { ResearchRepository, ResearchToolExecution } from "../../modules/research/ports/research-repository.ts";
import { sanitizePayload } from "../../modules/audit/domain/sanitizer.ts";

type DatabaseRow = Record<string, unknown>;

export class NeonResearchRepository implements ResearchRepository {
  async createRun(input: EnqueueResearchInput): Promise<ResearchRun> {
    const existing = await this.findRunByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;
    const sql = getDatabase();
    const id = randomUUID();
    await sql`INSERT INTO research_runs (id, lead_id, execution_id, idempotency_key, status, query_params)
      VALUES (${id}, ${input.leadId}, ${input.executionId}, ${input.idempotencyKey}, 'queued', ${JSON.stringify(input.queryParams ?? {})}::jsonb)
      ON CONFLICT (idempotency_key) DO NOTHING`;
    const created = await this.findRunByIdempotencyKey(input.idempotencyKey);
    if (!created) throw new Error("Não foi possível criar a execução de pesquisa.");
    return created;
  }

  async getRun(id: string): Promise<ResearchRun | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM research_runs WHERE id = ${id} LIMIT 1` as DatabaseRow[];
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async findRunByIdempotencyKey(idempotencyKey: string): Promise<ResearchRun | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM research_runs WHERE idempotency_key = ${idempotencyKey} LIMIT 1` as DatabaseRow[];
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async getLatestRun(leadId: string, executionId?: string): Promise<ResearchRun | null> {
    const sql = getDatabase();
    const rows = executionId
      ? await sql`SELECT * FROM research_runs WHERE lead_id = ${leadId} AND execution_id = ${executionId} ORDER BY created_at DESC LIMIT 1` as DatabaseRow[]
      : await sql`SELECT * FROM research_runs WHERE lead_id = ${leadId} ORDER BY created_at DESC LIMIT 1` as DatabaseRow[];
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async getActiveRun(leadId: string, executionId: string): Promise<ResearchRun | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM research_runs WHERE lead_id = ${leadId} AND execution_id = ${executionId}
      AND status IN ('queued', 'running') ORDER BY updated_at DESC LIMIT 1` as DatabaseRow[];
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async transitionRun(input: {
    runId: string;
    status: ResearchRun["status"];
    errorMessage?: string | null;
    executionTimeMs?: number | null;
  }): Promise<ResearchRun> {
    const current = await this.getRun(input.runId);
    if (!current) throw new Error("Execução de pesquisa não encontrada.");
    const next = transitionResearchRun(current, input.status, {
      errorMessage: input.errorMessage,
      executionTimeMs: input.executionTimeMs,
    });
    const sql = getDatabase();
    const rows = await sql`UPDATE research_runs SET status = ${next.status}, error_message = ${next.errorMessage},
      execution_time_ms = ${next.executionTimeMs}, updated_at = ${next.updatedAt}, started_at = ${next.startedAt}
      WHERE id = ${next.id} AND status = ${current.status} RETURNING *` as DatabaseRow[];
    if (!rows[0]) throw new Error("A execução de pesquisa mudou antes da transição.");
    return mapRun(rows[0]);
  }

  async saveSources(sources: ResearchSource[]): Promise<void> {
    const sql = getDatabase();
    for (const source of sources) {
      await sql`INSERT INTO research_sources (id, research_run_id, lead_id, execution_id, url, title, excerpt, source_type, consulted_at)
        VALUES (${source.id}, ${source.researchRunId}, ${source.leadId}, ${source.executionId}, ${source.url}, ${source.title}, ${source.excerpt}, ${source.sourceType}, ${source.consultedAt})
        ON CONFLICT (id) DO NOTHING`;
    }
  }

  async listSources(leadId: string, executionId?: string): Promise<ResearchSource[]> {
    const sql = getDatabase();
    const rows = executionId
      ? await sql`SELECT * FROM research_sources WHERE lead_id = ${leadId} AND execution_id = ${executionId} ORDER BY consulted_at ASC` as DatabaseRow[]
      : await sql`SELECT * FROM research_sources WHERE lead_id = ${leadId} ORDER BY consulted_at ASC` as DatabaseRow[];
    return rows.map(mapSource);
  }

  async createBriefing(input: Omit<Briefing, "id" | "version" | "createdAt">): Promise<Briefing> {
    const sql = getDatabase();
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const rows = await sql`WITH locked AS (
        SELECT pg_advisory_xact_lock(hashtextextended(${`briefing:${input.leadId}`}, 0))
      ), next_version AS (
        SELECT COALESCE(MAX(version), 0) + 1 AS version
        FROM briefings, locked
        WHERE lead_id = ${input.leadId}
      )
      INSERT INTO briefings (id, research_run_id, lead_id, execution_id, version, status, summary, facts, hypotheses, gaps, created_at)
      SELECT ${id}, ${input.researchRunId}, ${input.leadId}, ${input.executionId}, next_version.version, ${input.status}, ${input.summary},
        ${JSON.stringify(input.facts)}::jsonb, ${JSON.stringify(input.hypotheses)}::jsonb, ${JSON.stringify(input.gaps)}::jsonb, ${createdAt}
      FROM next_version
      RETURNING *` as DatabaseRow[];
    if (!rows[0]) throw new Error("Não foi possível persistir o briefing.");
    return mapBriefing(rows[0]);
  }

  async getLatestBriefing(leadId: string, executionId?: string): Promise<Briefing | null> {
    const sql = getDatabase();
    const rows = executionId
      ? await sql`SELECT * FROM briefings WHERE lead_id = ${leadId} AND execution_id = ${executionId} ORDER BY version DESC LIMIT 1` as DatabaseRow[]
      : await sql`SELECT * FROM briefings WHERE lead_id = ${leadId} ORDER BY version DESC LIMIT 1` as DatabaseRow[];
    return rows[0] ? mapBriefing(rows[0]) : null;
  }

  async appendToolExecution(execution: ResearchToolExecution): Promise<void> {
    const sql = getDatabase();
    await sql`INSERT INTO tool_executions (id, lead_id, execution_id, research_run_id, provider, operation, status, duration_ms, input_payload, output_payload, created_at)
      VALUES (${execution.id}, ${execution.leadId}, ${execution.executionId}, ${execution.researchRunId}, ${execution.provider}, ${execution.operation}, ${execution.status}, ${execution.durationMs}, ${JSON.stringify(sanitizePayload(execution.input))}::jsonb, ${JSON.stringify(sanitizePayload(execution.output))}::jsonb, ${execution.createdAt})
      ON CONFLICT (id) DO NOTHING`;
  }
}

function mapRun(row: DatabaseRow): ResearchRun {
  return {
    id: String(row.id), leadId: String(row.lead_id), executionId: String(row.execution_id), idempotencyKey: String(row.idempotency_key),
    status: row.status as ResearchRun["status"], queryParams: parseJson(row.query_params, {}), errorMessage: row.error_message ? String(row.error_message) : null,
    executionTimeMs: row.execution_time_ms === null ? null : Number(row.execution_time_ms), createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(), startedAt: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
  };
}

function mapBriefing(row: DatabaseRow): Briefing {
  return {
    id: String(row.id), leadId: String(row.lead_id), researchRunId: String(row.research_run_id), executionId: String(row.execution_id), version: Number(row.version),
    status: row.status as Briefing["status"], summary: String(row.summary), facts: parseJson(row.facts, []), hypotheses: parseJson(row.hypotheses, []), gaps: parseJson(row.gaps, []), createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapSource(row: DatabaseRow): ResearchSource {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    researchRunId: String(row.research_run_id),
    executionId: String(row.execution_id),
    url: String(row.url),
    title: String(row.title),
    excerpt: String(row.excerpt),
    consultedAt: new Date(String(row.consulted_at)).toISOString(),
    sourceType: row.source_type as ResearchSource["sourceType"],
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") { try { return JSON.parse(value) as T; } catch { return fallback; } }
  return (value as T | null) ?? fallback;
}
