export class CalendarToolInputError extends Error {
  readonly status = 400 as const;

  constructor(message: string) {
    super(message);
    this.name = "CalendarToolInputError";
  }
}

export function parseAvailabilityToolInput(value: unknown): {
  voiceSessionId: string;
  query: { from: string; until: string };
} {
  const payload = asRecord(value);
  const voiceSessionId = requiredBoundedString(payload.voiceSessionId, "voiceSessionId", 100);
  const from = boundedString(payload.from ?? payload.de, "de", 80);
  const until = boundedString(payload.until ?? payload.ate, "ate", 80);
  if (!from || !until) throw new CalendarToolInputError("Informe de e até para consultar a agenda.");
  return { voiceSessionId, query: { from, until } };
}

export function parseBookingToolInput(value: unknown): {
  voiceSessionId: string;
  bookingIntentId: string;
  slotOfferToken: string;
  consent: boolean;
} {
  const payload = asRecord(value);
  return {
    voiceSessionId: requiredBoundedString(payload.voiceSessionId, "voiceSessionId", 100),
    bookingIntentId: boundedString(payload.bookingIntentId, "bookingIntentId", 100) ?? "",
    slotOfferToken: boundedString(payload.slotOfferToken, "slotOfferToken", 2_000) ?? "",
    consent: payload.consent === true,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CalendarToolInputError("Envie um objeto de ferramenta de agenda válido.");
  }
  return value as Record<string, unknown>;
}

function requiredBoundedString(value: unknown, field: string, maxLength: number): string {
  const parsed = boundedString(value, field, maxLength);
  if (!parsed) throw new CalendarToolInputError(`Informe ${field} para executar a ferramenta de agenda.`);
  return parsed;
}

function boundedString(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new CalendarToolInputError(`${field} inválido.`);
  }
  return value.trim();
}
