import "server-only";
import { getDatabase } from "./client.ts";
import type { LeadProfileVersion } from "../../modules/qualification/domain/lead-profile-version.ts";
import type { SpicedQualification } from "../../modules/qualification/domain/spiced-qualification.ts";
import type { LeadProfileVersionRepository } from "../../modules/qualification/ports/lead-profile-version-repository.ts";
import type { QualificationRepository } from "../../modules/qualification/ports/qualification-repository.ts";
import type { QualificationToolExecution, QualificationToolExecutionRepository } from "../../modules/qualification/ports/qualification-tool-execution-repository.ts";
import { sanitizePayload } from "../../modules/audit/domain/sanitizer.ts";

type Row = Record<string, unknown>;

export class NeonQualificationRepository implements QualificationRepository, LeadProfileVersionRepository, QualificationToolExecutionRepository {
  async findByIdempotencyKey(idempotencyKey: string): Promise<SpicedQualification | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM spiced_qualifications WHERE idempotency_key = ${idempotencyKey} LIMIT 1` as Row[];
    return rows[0] ? mapQualification(rows[0]) : null;
  }

  async getLatestByLead(leadId: string, executionId?: string): Promise<SpicedQualification | null> {
    const sql = getDatabase();
    const rows = executionId
      ? await sql`SELECT * FROM spiced_qualifications WHERE lead_id = ${leadId} AND execution_id = ${executionId} ORDER BY created_at DESC LIMIT 1` as Row[]
      : await sql`SELECT * FROM spiced_qualifications WHERE lead_id = ${leadId} ORDER BY created_at DESC LIMIT 1` as Row[];
    return rows[0] ? mapQualification(rows[0]) : null;
  }

  async save(qualification: SpicedQualification, idempotencyKey: string): Promise<void> {
    const sql = getDatabase();
    await sql`INSERT INTO spiced_qualifications
      (id, lead_id, execution_id, voice_session_id, external_call_id, event_type, idempotency_key, situation, pain, impact, critical_event, decision, qualification_status, interest_status, decline_reason, objections, created_at)
      VALUES (${qualification.id}, ${qualification.leadId}, ${qualification.executionId}, ${qualification.voiceSessionId}, ${qualification.externalCallId}, ${qualification.eventType}, ${idempotencyKey}, ${JSON.stringify(qualification.situation)}::jsonb, ${JSON.stringify(qualification.pain)}::jsonb, ${JSON.stringify(qualification.impact)}::jsonb, ${JSON.stringify(qualification.criticalEvent)}::jsonb, ${JSON.stringify(qualification.decision)}::jsonb, ${qualification.qualificationStatus}, ${qualification.interestStatus}, ${qualification.declineReason}, ${JSON.stringify(qualification.objections)}::jsonb, ${qualification.createdAt})
      ON CONFLICT (idempotency_key) DO NOTHING`;
  }

  async getLatest(leadId: string, executionId?: string): Promise<LeadProfileVersion | null> {
    const sql = getDatabase();
    const rows = executionId
      ? await sql`SELECT * FROM lead_profile_versions WHERE lead_id = ${leadId} AND execution_id = ${executionId} ORDER BY version DESC LIMIT 1` as Row[]
      : await sql`SELECT * FROM lead_profile_versions WHERE lead_id = ${leadId} ORDER BY version DESC LIMIT 1` as Row[];
    return rows[0] ? mapProfileVersion(rows[0]) : null;
  }

  async saveProfileVersion(version: LeadProfileVersion): Promise<void> {
    const sql = getDatabase();
    await sql`INSERT INTO lead_profile_versions (id, lead_id, execution_id, voice_session_id, version, changes, created_at)
      VALUES (${version.id}, ${version.leadId}, ${version.executionId}, ${version.voiceSessionId}, ${version.version}, ${JSON.stringify(version.changes)}::jsonb, ${version.createdAt})
      ON CONFLICT (lead_id, version) DO NOTHING`;
  }

  async appendToolExecution(execution: QualificationToolExecution): Promise<void> {
    const sql = getDatabase();
    await sql`INSERT INTO tool_executions (id, lead_id, execution_id, research_run_id, voice_session_id, provider, operation, status, duration_ms, input_payload, output_payload, created_at)
      VALUES (${execution.id}, ${execution.leadId}, ${execution.executionId}, NULL, ${execution.voiceSessionId}, ${execution.provider}, ${execution.operation}, ${execution.status}, ${execution.durationMs}, ${JSON.stringify(sanitizePayload(execution.input))}::jsonb, ${JSON.stringify(sanitizePayload(execution.output))}::jsonb, ${execution.createdAt})
      ON CONFLICT (id) DO NOTHING`;
  }
}

function mapQualification(row: Row): SpicedQualification {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    executionId: String(row.execution_id),
    voiceSessionId: String(row.voice_session_id),
    externalCallId: String(row.external_call_id),
    eventType: String(row.event_type),
    situation: parseJson(row.situation, {} as SpicedQualification["situation"]),
    pain: parseJson(row.pain, {} as SpicedQualification["pain"]),
    impact: parseJson(row.impact, {} as SpicedQualification["impact"]),
    criticalEvent: parseJson(row.critical_event, {} as SpicedQualification["criticalEvent"]),
    decision: parseJson(row.decision, {} as SpicedQualification["decision"]),
    qualificationStatus: row.qualification_status as SpicedQualification["qualificationStatus"],
    interestStatus: row.interest_status as SpicedQualification["interestStatus"],
    declineReason: row.decline_reason ? String(row.decline_reason) : null,
    objections: parseJson(row.objections, []),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapProfileVersion(row: Row): LeadProfileVersion {
  return {
    id: String(row.id), leadId: String(row.lead_id), executionId: String(row.execution_id), voiceSessionId: String(row.voice_session_id),
    version: Number(row.version), changes: parseJson(row.changes, []), createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") { try { return JSON.parse(value) as T; } catch { return fallback; } }
  return (value as T | null) ?? fallback;
}

export const neonQualificationRepository = new NeonQualificationRepository();

