import type { AvailabilityQuery, BookingRequest, BookingResult, CalendarAvailability } from "../domain/calendar.ts";

// A infraestrutura traduz o contrato HTTP; formatos externos não atravessam a porta.
export interface CalendarProvider {
  availability(query: AvailabilityQuery): Promise<CalendarAvailability>;
  book(input: BookingRequest): Promise<BookingResult>;
}

export class CalendarServiceError extends Error {
  readonly kind: "authentication" | "unavailable" | "invalid_response";

  constructor(kind: CalendarServiceError["kind"]) {
    super("Não foi possível consultar a agenda. Nenhuma reserva foi confirmada.");
    this.name = "CalendarServiceError";
    this.kind = kind;
  }
}
