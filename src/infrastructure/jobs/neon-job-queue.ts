import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/client.ts";
import type { EnqueueResearchInput } from "../../modules/research/domain/research-run.ts";
import type { ResearchRepository } from "../../modules/research/ports/research-repository.ts";
import type { JobQueue, ResearchJob, ResearchQueue } from "../../modules/research/ports/research-queue.ts";

type Row = Record<string, unknown>;

export class NeonJobQueue implements ResearchQueue, JobQueue {
  private readonly research: ResearchRepository;

  constructor(research: ResearchRepository) {
    this.research = research;
  }

  async enqueue(input: EnqueueResearchInput) {
    const sql = getDatabase();
    await sql.transaction([
      sql`INSERT INTO research_runs (id, lead_id, execution_id, idempotency_key, status, query_params)
        VALUES (${randomUUID()}, ${input.leadId}, ${input.executionId}, ${input.idempotencyKey}, 'queued', '{}'::jsonb)
        ON CONFLICT (idempotency_key) DO NOTHING`,
      sql`INSERT INTO job_queue (id, type, lead_id, research_run_id, execution_id, idempotency_key, status)
        SELECT ${randomUUID()}::uuid, 'start_research', lead_id, id, execution_id, 'research-job:' || id::text, 'queued'
        FROM research_runs WHERE idempotency_key = ${input.idempotencyKey}
        ON CONFLICT (idempotency_key) DO NOTHING`,
    ]);
    const run = await this.research.findRunByIdempotencyKey(input.idempotencyKey);
    if (!run) throw new Error("Não foi possível recuperar a pesquisa enfileirada.");
    return run;
  }

  async claim(_workerId: string, leaseMs: number, researchRunId?: string): Promise<ResearchJob | null> {
    const sql = getDatabase();
    const rows = await sql`WITH candidate AS (
      SELECT id FROM job_queue
      WHERE (${researchRunId ?? null}::uuid IS NULL OR research_run_id = ${researchRunId ?? null}::uuid)
        AND ((status = 'queued' AND available_at <= NOW())
         OR (status = 'running' AND locked_until IS NOT NULL AND locked_until <= NOW()))
      ORDER BY available_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE job_queue AS jobs
    SET status = 'running', attempts = jobs.attempts + 1,
        locked_until = NOW() + (${leaseMs} * INTERVAL '1 millisecond'), updated_at = NOW()
    FROM candidate WHERE jobs.id = candidate.id
    RETURNING jobs.*` as Row[];
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async complete(jobId: string): Promise<void> {
    const sql = getDatabase();
    await sql`UPDATE job_queue SET status = 'completed', locked_until = NULL, updated_at = NOW() WHERE id = ${jobId}`;
  }

  async fail(jobId: string, errorMessage: string): Promise<{ retry: boolean; job: ResearchJob }> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM job_queue WHERE id = ${jobId} LIMIT 1` as Row[];
    if (!rows[0]) throw new Error("Job de pesquisa não encontrado.");
    const current = mapJob(rows[0]);
    const run = await this.research.getRun(current.researchRunId);
    const retry = current.attempts < current.maxAttempts && run?.status === "queued";
    const nextStatus = retry ? "queued" : "failed";
    const updated = await sql`UPDATE job_queue SET status = ${nextStatus}, locked_until = NULL,
      available_at = NOW(), last_error = ${errorMessage.slice(0, 500)}, updated_at = NOW()
      WHERE id = ${jobId} RETURNING *` as Row[];
    const job = mapJob(updated[0]);
    if (!retry) {
      if (run && ["queued", "running"].includes(run.status)) {
        await this.research.transitionRun({ runId: run.id, status: "failed", errorMessage: job.lastError });
      }
    }
    return { retry, job };
  }
}

function mapJob(row: Row): ResearchJob {
  return {
    id: String(row.id), type: "start_research", leadId: String(row.lead_id), researchRunId: String(row.research_run_id), executionId: String(row.execution_id),
    idempotencyKey: String(row.idempotency_key), status: row.status as ResearchJob["status"], attempts: Number(row.attempts), maxAttempts: Number(row.max_attempts),
    availableAt: new Date(String(row.available_at)).toISOString(), lockedUntil: row.locked_until ? new Date(String(row.locked_until)).toISOString() : null,
    lastError: row.last_error ? String(row.last_error) : null, createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
