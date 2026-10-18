import "server-only";
import {
  calendarTimezone, validateAvailabilityQuery, validateBookingRequest, validateCalendarSlot,
  type AvailabilityQuery, type BookingRequest, type BookingResult, type CalendarAvailability,
} from "../../../modules/scheduling/domain/calendar.ts";
import { CalendarServiceError, type CalendarProvider } from "../../../modules/scheduling/ports/calendar-provider.ts";
import { EnvironmentError, getServerEnvironment } from "../../config/env.ts";

type CalendarConfiguration = Readonly<{ baseUrl: string; token: string; timeoutMilliseconds?: number }>;
type Fetch = typeof globalThis.fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class HttpCalendarProvider implements CalendarProvider {
  private readonly baseUrl: URL;
  private readonly token: string;
  private readonly timeoutMilliseconds: number;
  private readonly fetcher: Fetch;

  constructor(configuration: CalendarConfiguration, fetcher: Fetch = globalThis.fetch) {
    try {
      this.baseUrl = new URL(configuration.baseUrl.endsWith("/") ? configuration.baseUrl : `${configuration.baseUrl}/`);
      if (!["https:", "http:"].includes(this.baseUrl.protocol) || this.baseUrl.username || this.baseUrl.password ||
          this.baseUrl.search || this.baseUrl.hash) throw new Error();
    } catch {
      throw new EnvironmentError(["AGENDA_BASE_URL"]);
    }
    if (!configuration.token.trim() || /[\r\n]/.test(configuration.token)) throw new EnvironmentError(["AGENDA_TOKEN"]);
    this.token = configuration.token.trim();
    this.timeoutMilliseconds = configuration.timeoutMilliseconds ?? 8_000;
    if (!Number.isFinite(this.timeoutMilliseconds) || this.timeoutMilliseconds <= 0) throw new Error("Timeout da agenda inválido.");
    this.fetcher = fetcher;
  }

  private request(path: string, method: "GET" | "POST", body?: BookingRequest, query?: AvailabilityQuery): Promise<Response> {
    const url = new URL(path, this.baseUrl);
    if (query) {
      url.searchParams.set("de", query.from);
      url.searchParams.set("ate", query.until);
    }
    return this.fetcher(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify({ inicio: body.start, nome: body.name, email: body.email }) : undefined,
      signal: AbortSignal.timeout(this.timeoutMilliseconds),
      // O token e os dados da pessoa não devem acompanhar redirecionamentos.
      redirect: "error",
      cache: "no-store",
    });
  }

  async availability(query: AvailabilityQuery): Promise<CalendarAvailability> {
    validateAvailabilityQuery(query);
    let response: Response;
    try {
      response = await this.request("disponibilidade", "GET", undefined, query);
    } catch {
      throw new CalendarServiceError("unavailable");
    }
    if (!response.ok) throw new CalendarServiceError([401, 403].includes(response.status) ? "authentication" : "unavailable");
    try {
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.fuso !== calendarTimezone || !Array.isArray(payload.livres)) throw new Error();
      const slots = payload.livres.map((item: unknown) => {
        if (!isRecord(item) || typeof item.inicio !== "string" || typeof item.fim !== "string") throw new Error();
        const slot = { start: item.inicio, end: item.fim };
        validateCalendarSlot(slot);
        return slot;
      });
      return { timezone: payload.fuso, slots };
    } catch {
      throw new CalendarServiceError("invalid_response");
    }
  }

  async book(input: BookingRequest): Promise<BookingResult> {
    validateBookingRequest(input);
    let response: Response;
    try {
      // POST único: uma falha de transporte pode acontecer depois da reserva.
      response = await this.request("reunioes", "POST", input);
    } catch {
      return { status: "unknown", reason: "transport" };
    }
    if (response.status === 409) return { status: "conflict" };
    if ([200, 201, 204].includes(response.status)) return { status: "confirmed", start: input.start };
    if (response.status === 202) return { status: "unknown", reason: "pending" };
    if (response.status >= 500 || response.status === 408) return { status: "unknown", reason: "server_error" };
    if (response.status >= 400 && response.status < 500) return { status: "rejected", statusCode: response.status };
    return { status: "unknown", reason: "unexpected_response" };
  }
}

/** Criado somente quando o fluxo de agenda solicitar o provedor. */
export function createConfiguredCalendarProvider(): CalendarProvider {
  const environment = getServerEnvironment();
  const missing = (["AGENDA_BASE_URL", "AGENDA_TOKEN"] as const).filter((name) => !environment[name]);
  if (missing.length) throw new EnvironmentError(missing);
  return new HttpCalendarProvider({ baseUrl: environment.AGENDA_BASE_URL!, token: environment.AGENDA_TOKEN! });
}
