import "server-only";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "./client.ts";
import type { MeetingAttempt, MeetingAttemptStatus } from "../../modules/scheduling/domain/meeting-attempt.ts";
import type { MeetingAttemptRepository } from "../../modules/scheduling/ports/meeting-attempt-repository.ts";

type Row = Record<string, unknown>;

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export class FileMeetingAttemptRepository implements MeetingAttemptRepository {
  constructor(readonly directory = path.join(process.cwd(), ".data", "scheduling", "meeting-attempts")) {}

  async append(attempt: MeetingAttempt): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(this.directory, `${attempt.id}.json`), JSON.stringify(attempt, null, 2), { flag: "wx", mode: 0o600 });
  }

  async findLatestByBookingIntentId(bookingIntentId: string): Promise<MeetingAttempt | null> {
    const attempts = await this.list();
    return attempts
      .filter((attempt) => attempt.bookingIntentId === bookingIntentId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }

  async findOfferedByTokenHash(tokenHash: string): Promise<MeetingAttempt | null> {
    const attempts = await this.list();
    return attempts
      .filter((attempt) => attempt.status === "offered" && attempt.slotOfferTokenHash === tokenHash)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }

  async listByLead(leadId: string, executionId?: string): Promise<MeetingAttempt[]> {
    const attempts = await this.list();
    return attempts
      .filter((attempt) => attempt.leadId === leadId && (!executionId || attempt.executionId === executionId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  private async list(): Promise<MeetingAttempt[]> {
    let names: string[];
    try {
      names = (await readdir(this.directory)).filter((name) => name.endsWith(".json"));
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const attempts = await Promise.all(names.map(async (name) => {
      try {
        return JSON.parse(await readFile(path.join(this.directory, name), "utf8")) as MeetingAttempt;
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    }));
    return attempts.filter((attempt): attempt is MeetingAttempt => attempt !== null);
  }
}

export class NeonMeetingAttemptRepository implements MeetingAttemptRepository {
  async append(attempt: MeetingAttempt): Promise<void> {
    const sql = getDatabase();
    await sql`INSERT INTO meeting_attempts
      (id, lead_id, execution_id, voice_session_id, booking_intent_id, slot_offer_token_hash, start_at, end_at,
       availability_from, availability_until, previous_status, status, reason, http_status, booking_payload,
       transport_diagnostic, created_at)
      VALUES (${attempt.id}, ${attempt.leadId}, ${attempt.executionId}, ${attempt.voiceSessionId}, ${attempt.bookingIntentId},
        ${attempt.slotOfferTokenHash}, ${attempt.start}, ${attempt.end}, ${attempt.availabilityFrom}, ${attempt.availabilityUntil},
        ${attempt.previousStatus}, ${attempt.status}, ${attempt.reason}, ${attempt.httpStatus}, ${JSON.stringify(attempt.bookingPayload)}::jsonb,
        ${attempt.transportDiagnostic}, ${attempt.createdAt})
      ON CONFLICT (id) DO NOTHING`;
  }

  async findLatestByBookingIntentId(bookingIntentId: string): Promise<MeetingAttempt | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM meeting_attempts WHERE booking_intent_id = ${bookingIntentId} ORDER BY created_at DESC LIMIT 1` as Row[];
    return rows[0] ? mapMeetingAttempt(rows[0]) : null;
  }

  async findOfferedByTokenHash(tokenHash: string): Promise<MeetingAttempt | null> {
    const sql = getDatabase();
    const rows = await sql`SELECT * FROM meeting_attempts
      WHERE slot_offer_token_hash = ${tokenHash} AND status = 'offered'
      ORDER BY created_at DESC LIMIT 1` as Row[];
    return rows[0] ? mapMeetingAttempt(rows[0]) : null;
  }

  async listByLead(leadId: string, executionId?: string): Promise<MeetingAttempt[]> {
    const sql = getDatabase();
    const rows = executionId
      ? await sql`SELECT * FROM meeting_attempts WHERE lead_id = ${leadId} AND execution_id = ${executionId} ORDER BY created_at ASC`
      : await sql`SELECT * FROM meeting_attempts WHERE lead_id = ${leadId} ORDER BY created_at ASC`;
    return (rows as Row[]).map(mapMeetingAttempt);
  }
}

function mapMeetingAttempt(row: Row): MeetingAttempt {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    executionId: String(row.execution_id),
    voiceSessionId: nullableString(row.voice_session_id),
    bookingIntentId: nullableString(row.booking_intent_id),
    slotOfferTokenHash: nullableString(row.slot_offer_token_hash),
    start: nullableString(row.start_at),
    end: nullableString(row.end_at),
    availabilityFrom: nullableString(row.availability_from),
    availabilityUntil: nullableString(row.availability_until),
    previousStatus: row.previous_status ? String(row.previous_status) as MeetingAttemptStatus : null,
    status: String(row.status) as MeetingAttemptStatus,
    reason: String(row.reason),
    httpStatus: row.http_status === null || row.http_status === undefined ? null : Number(row.http_status),
    bookingPayload: parseJson(row.booking_payload, {}),
    transportDiagnostic: nullableString(row.transport_diagnostic),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value as T | null) ?? fallback;
}

export const fileMeetingAttemptRepository = new FileMeetingAttemptRepository();
export const neonMeetingAttemptRepository = new NeonMeetingAttemptRepository();
