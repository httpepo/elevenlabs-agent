import "server-only";
import { getDatabase } from "../client.ts";
import { createToolExecution, type ToolExecution, type ToolExecutionInput } from "../../../modules/audit/domain/tool-execution.ts";
import type { AuditRepository } from "../../../modules/audit/ports/audit-repository.ts";
import { sanitizePayload } from "../../../modules/audit/domain/sanitizer.ts";

type Row = Record<string, unknown>;

export class NeonAuditRepository implements AuditRepository {
  async recordExecution(input: ToolExecutionInput): Promise<void> {
    const execution = createToolExecution(input);
    const sql = getDatabase();
    await sql`INSERT INTO tool_executions
      (id, lead_id, execution_id, research_run_id, voice_session_id, provider, operation, status, duration_ms, input_payload, output_payload, created_at)
      VALUES (${execution.id}, ${execution.leadId}, ${execution.executionId}, ${execution.researchRunId}, ${execution.voiceSessionId}, ${execution.provider}, ${execution.operation}, ${execution.status}, ${execution.durationMs}, ${JSON.stringify(execution.input)}::jsonb, ${JSON.stringify(execution.output)}::jsonb, ${execution.createdAt})
      ON CONFLICT (id) DO NOTHING`;
  }

  async listExecutionsByLeadId(leadId: string, executionId?: string): Promise<ToolExecution[]> {
    const sql = getDatabase();
    const rows = executionId
      ? await sql`SELECT * FROM tool_executions WHERE lead_id = ${leadId} AND execution_id = ${executionId} ORDER BY created_at ASC` as Row[]
      : await sql`SELECT * FROM tool_executions WHERE lead_id = ${leadId} ORDER BY created_at ASC` as Row[];
    return rows.map(mapExecution);
  }
}

function mapExecution(row: Row): ToolExecution {
  return createToolExecution({
    id: String(row.id),
    leadId: String(row.lead_id),
    executionId: String(row.execution_id),
    researchRunId: nullableString(row.research_run_id),
    voiceSessionId: nullableString(row.voice_session_id),
    provider: String(row.provider),
    operation: String(row.operation),
    status: statusValue(row.status),
    durationMs: Number(row.duration_ms),
    input: sanitizePayload(parseJson(row.input_payload, {})),
    output: sanitizePayload(parseJson(row.output_payload, {})),
    createdAt: new Date(String(row.created_at)).toISOString(),
  });
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function parseJson(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return isRecord(value) ? value : fallback;
}

function statusValue(value: unknown): ToolExecution["status"] {
  return value === "success" || value === "conflict" || value === "timeout" ? value : "failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const neonAuditRepository = new NeonAuditRepository();
