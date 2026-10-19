import { CalendarToolInputError } from "./calendar-tool-input";
import { InvalidBookingOfferError, SchedulingAuthorizationError } from "./scheduling-errors";

export function calendarErrorResponse(error: unknown, fallback: string): Response {
  if (error instanceof CalendarToolInputError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof InvalidBookingOfferError) {
    return Response.json({ error: error.message, code: "invalid_offer" }, { status: error.status });
  }
  if (error instanceof SchedulingAuthorizationError) {
    return Response.json({ error: error.message, code: error.kind }, { status: error.status });
  }
  if (hasErrorName(error, "CalendarValidationError")) {
    return Response.json({ error: errorMessage(error), code: "invalid_calendar_input" }, { status: 422 });
  }
  if (hasErrorName(error, "EnvironmentError") || hasErrorName(error, "CalendarServiceError")) {
    return Response.json({ error: fallback }, { status: 503 });
  }
  console.error("Falha na ferramenta de agenda", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: fallback }, { status: 500 });
}

function hasErrorName(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Entrada inválida.";
}
