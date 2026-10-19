import { randomUUID } from "node:crypto";

export const voiceSessionStatuses = [
  "not_started",
  "ready",
  "connecting",
  "active",
  "finalizing",
  "completed",
  "abandoned",
  "failed",
] as const;

export type VoiceSessionStatus = typeof voiceSessionStatuses[number];

export type VoiceSessionTransition = {
  id: string;
  from: VoiceSessionStatus;
  to: VoiceSessionStatus;
  reason: string;
  occurredAt: string;
};

export type VoiceSession = {
  id: string;
  leadId: string;
  executionId: string;
  briefingId: string;
  externalCallId: string | null;
  status: VoiceSessionStatus;
  createdAt: string;
  connectingAt: string | null;
  activeAt: string | null;
  finalizingAt: string | null;
  completedAt: string | null;
  abandonedAt: string | null;
  failedAt: string | null;
  durationMs: number | null;
  failureReason: string | null;
  transitions: VoiceSessionTransition[];
};

const allowedTransitions: Record<VoiceSessionStatus, readonly VoiceSessionStatus[]> = {
  not_started: ["ready", "failed"],
  ready: ["connecting", "abandoned", "failed"],
  connecting: ["active", "abandoned", "failed"],
  active: ["finalizing", "abandoned", "failed"],
  finalizing: ["completed", "abandoned", "failed"],
  completed: [],
  abandoned: [],
  failed: [],
};

export function createVoiceSession(input: {
  id?: string;
  leadId: string;
  executionId: string;
  briefingId: string;
  createdAt?: string;
}): VoiceSession {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    id: input.id ?? randomUUID(),
    leadId: input.leadId,
    executionId: input.executionId,
    briefingId: input.briefingId,
    externalCallId: null,
    status: "not_started",
    createdAt,
    connectingAt: null,
    activeAt: null,
    finalizingAt: null,
    completedAt: null,
    abandonedAt: null,
    failedAt: null,
    durationMs: null,
    failureReason: null,
    transitions: [],
  };
}

export function linkExternalCall(session: VoiceSession, externalCallId: string): VoiceSession {
  if (!externalCallId.trim()) throw new Error("Identificador externo da conversa inválido.");
  if (session.externalCallId && session.externalCallId !== externalCallId) {
    throw new Error("Sessão de voz já vinculada a outra conversa externa.");
  }
  return { ...session, externalCallId };
}

export function transitionVoiceSession(
  session: VoiceSession,
  nextStatus: VoiceSessionStatus,
  reason: string,
  occurredAt = new Date().toISOString(),
): VoiceSession {
  if (session.status === nextStatus) return session;
  if (!reason.trim()) throw new Error("Toda transição de voz precisa de motivo.");
  if (!allowedTransitions[session.status].includes(nextStatus)) {
    throw new VoiceSessionTransitionError(session.status, nextStatus);
  }

  const transition: VoiceSessionTransition = {
    id: randomUUID(),
    from: session.status,
    to: nextStatus,
    reason: sanitizeReason(reason),
    occurredAt,
  };
  return {
    ...session,
    status: nextStatus,
    connectingAt: nextStatus === "connecting" ? occurredAt : session.connectingAt,
    activeAt: nextStatus === "active" ? occurredAt : session.activeAt,
    finalizingAt: nextStatus === "finalizing" ? occurredAt : session.finalizingAt,
    completedAt: nextStatus === "completed" ? occurredAt : session.completedAt,
    abandonedAt: nextStatus === "abandoned" ? occurredAt : session.abandonedAt,
    failedAt: nextStatus === "failed" ? occurredAt : session.failedAt,
    durationMs: ["completed", "abandoned", "failed"].includes(nextStatus) ? calculateDuration(session, occurredAt) : session.durationMs,
    failureReason: nextStatus === "failed" ? sanitizeReason(reason) : session.failureReason,
    transitions: [...session.transitions, transition],
  };
}

export class VoiceSessionTransitionError extends Error {
  readonly from: VoiceSessionStatus;
  readonly to: VoiceSessionStatus;

  constructor(from: VoiceSessionStatus, to: VoiceSessionStatus) {
    super(`Transição de voz inválida: ${from} -> ${to}.`);
    this.name = "VoiceSessionTransitionError";
    this.from = from;
    this.to = to;
  }
}

function sanitizeReason(reason: string): string {
  return reason.replace(/[\r\n]+/g, " ").trim().slice(0, 300);
}

function calculateDuration(session: VoiceSession, endedAt: string): number | null {
  const startedAt = session.activeAt ?? session.connectingAt;
  if (!startedAt) return 0;
  const durationMs = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : null;
}
