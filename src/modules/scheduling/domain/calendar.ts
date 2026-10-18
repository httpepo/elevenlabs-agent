export const calendarTimezone = "America/Sao_Paulo";
export const meetingDurationMilliseconds = 30 * 60 * 1_000;

export type AvailabilityQuery = Readonly<{ from: string; until: string }>;
export type CalendarSlot = Readonly<{ start: string; end: string }>;
export type CalendarAvailability = Readonly<{ timezone: string; slots: CalendarSlot[] }>;
export type BookingRequest = Readonly<{ start: string; name: string; email: string }>;
export type BookingResult =
  | { status: "confirmed"; start: string }
  | { status: "conflict" }
  | { status: "rejected"; statusCode: number }
  | { status: "unknown"; reason: "transport" | "server_error" | "pending" | "unexpected_response" };

export class CalendarValidationError extends Error {
  constructor() {
    super("Informe datas válidas e um horário comercial de 30 minutos, além de nome e e-mail para a reserva.");
    this.name = "CalendarValidationError";
  }
}

function validDatePart(value: string): boolean {
  const date = value.slice(0, 10);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function parseCalendarInstant(value: string): number {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !validDatePart(value)) throw new CalendarValidationError();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new CalendarValidationError();
  return timestamp;
}

function parseBoundary(value: string): number {
  if (typeof value !== "string") throw new CalendarValidationError();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && validDatePart(value)) {
    return Date.parse(`${value}T00:00:00-03:00`);
  }
  return parseCalendarInstant(value);
}

export function validateAvailabilityQuery(query: AvailabilityQuery): void {
  if (parseBoundary(query.from) > parseBoundary(query.until)) throw new CalendarValidationError();
}

function businessTime(timestamp: number): { day: string; minutes: number; weekday: string; seconds: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: calendarTimezone, weekday: "short", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
    weekday: values.weekday,
    seconds: values.second,
  };
}

export function validateCalendarSlot(slot: CalendarSlot): void {
  const start = parseCalendarInstant(slot.start);
  const end = parseCalendarInstant(slot.end);
  const localStart = businessTime(start);
  const localEnd = businessTime(end);
  if (end - start !== meetingDurationMilliseconds ||
      !["Mon", "Tue", "Wed", "Thu", "Fri"].includes(localStart.weekday) ||
      localStart.day !== localEnd.day || localStart.minutes < 9 * 60 || localEnd.minutes > 18 * 60 ||
      localStart.seconds !== "00" || start % 1_000 !== 0) throw new CalendarValidationError();
}

export function validateBookingRequest(request: BookingRequest): void {
  const start = parseCalendarInstant(request.start);
  validateCalendarSlot({ start: request.start, end: new Date(start + meetingDurationMilliseconds).toISOString() });
  if (typeof request.name !== "string" || !request.name.trim() || request.name.length > 120 ||
      typeof request.email !== "string" || request.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) throw new CalendarValidationError();
}
