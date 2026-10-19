import { randomUUID } from "node:crypto";

export const meetingAttemptStatuses = [
  "not_requested",
  "offered",
  "pending",
  "confirmed",
  "conflict",
  "uncertain",
  "failed",
  "cancelled",
] as const;

export type MeetingAttemptStatus = typeof meetingAttemptStatuses[number];

export type MeetingAttempt = Readonly<{
  id: string;
  leadId: string;
  executionId: string;
  voiceSessionId: string | null;
  bookingIntentId: string | null;
  slotOfferTokenHash: string | null;
  start: string | null;
  end: string | null;
  availabilityFrom: string | null;
  availabilityUntil: string | null;
  previousStatus: MeetingAttemptStatus | null;
  status: MeetingAttemptStatus;
  reason: string;
  httpStatus: number | null;
  bookingPayload: Readonly<Record<string, string>>;
  transportDiagnostic: string | null;
  createdAt: string;
}>;

const allowedTransitions: Record<MeetingAttemptStatus, readonly MeetingAttemptStatus[]> = {
  not_requested: ["offered", "cancelled", "failed"],
  offered: ["pending", "cancelled", "failed"],
  pending: ["confirmed", "conflict", "uncertain", "failed"],
  confirmed: [],
  conflict: [],
  uncertain: [],
  failed: [],
  cancelled: [],
};

export function createMeetingAttempt(input: {
  leadId: string;
  executionId: string;
  voiceSessionId?: string | null;
  bookingIntentId?: string | null;
  slotOfferTokenHash?: string | null;
  start?: string | null;
  end?: string | null;
  availabilityFrom?: string | null;
  availabilityUntil?: string | null;
  status: MeetingAttemptStatus;
  reason: string;
  httpStatus?: number | null;
  bookingPayload?: Readonly<Record<string, string>>;
  transportDiagnostic?: string | null;
  createdAt?: string;
}): MeetingAttempt {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const reason = sanitizeText(input.reason, 500);
  if (!reason) throw new Error("Toda tentativa de reunião precisa de motivo.");
  return {
    id: randomUUID(),
    leadId: input.leadId,
    executionId: input.executionId,
    voiceSessionId: input.voiceSessionId ?? null,
    bookingIntentId: input.bookingIntentId ?? null,
    slotOfferTokenHash: input.slotOfferTokenHash ?? null,
    start: input.start ?? null,
    end: input.end ?? null,
    availabilityFrom: input.availabilityFrom ?? null,
    availabilityUntil: input.availabilityUntil ?? null,
    previousStatus: null,
    status: input.status,
    reason,
    httpStatus: input.httpStatus ?? null,
    bookingPayload: input.bookingPayload ?? {},
    transportDiagnostic: sanitizeNullableText(input.transportDiagnostic, 300),
    createdAt,
  };
}

export function transitionMeetingAttempt(
  current: MeetingAttempt,
  nextStatus: MeetingAttemptStatus,
  input: {
    reason: string;
    httpStatus?: number | null;
    bookingPayload?: Readonly<Record<string, string>>;
    transportDiagnostic?: string | null;
    createdAt?: string;
  },
): MeetingAttempt {
  if (current.status === nextStatus) return current;
  if (!allowedTransitions[current.status].includes(nextStatus)) {
    throw new MeetingAttemptTransitionError(current.status, nextStatus);
  }
  const next = createMeetingAttempt({
    ...current,
    status: nextStatus,
    reason: input.reason,
    httpStatus: input.httpStatus ?? current.httpStatus,
    bookingPayload: input.bookingPayload ?? current.bookingPayload,
    transportDiagnostic: input.transportDiagnostic ?? current.transportDiagnostic,
    createdAt: input.createdAt,
  });
  return { ...next, previousStatus: current.status };
}

export class MeetingAttemptTransitionError extends Error {
  readonly from: MeetingAttemptStatus;
  readonly to: MeetingAttemptStatus;

  constructor(from: MeetingAttemptStatus, to: MeetingAttemptStatus) {
    super(`Transição de agendamento inválida: ${from} -> ${to}.`);
    this.name = "MeetingAttemptTransitionError";
    this.from = from;
    this.to = to;
  }
}

function sanitizeText(value: string, limit: number): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, limit);
}

function sanitizeNullableText(value: string | null | undefined, limit: number): string | null {
  if (value === null || value === undefined) return null;
  return sanitizeText(value, limit) || null;
}
