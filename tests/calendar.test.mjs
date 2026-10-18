import assert from "node:assert/strict";
import test from "node:test";
import {
  CalendarValidationError, validateAvailabilityQuery, validateBookingRequest, validateCalendarSlot,
} from "../src/modules/scheduling/domain/calendar.ts";
import { CalendarServiceError } from "../src/modules/scheduling/ports/calendar-provider.ts";
import { EnvironmentError } from "../src/infrastructure/config/env.ts";
import { HttpCalendarProvider } from "../src/infrastructure/providers/calendar/http-calendar-provider.ts";

const slot = { start: "2026-10-19T09:00:00-03:00", end: "2026-10-19T09:30:00-03:00" };
const booking = { start: slot.start, name: "Ana Souza", email: "ana@example.invalid" };
const query = { from: "2026-10-19", until: "2026-10-20" };
const configuration = { baseUrl: "https://calendar.example.invalid", token: "fixture-token" };
const availability = { fuso: "America/Sao_Paulo", livres: [{ inicio: slot.start, fim: slot.end }] };

test("agenda aceita 30 minutos nos dias úteis, inclusive o último horário até 18h", () => {
  validateCalendarSlot(slot);
  validateCalendarSlot({ start: "2026-10-23T17:30:00-03:00", end: "2026-10-23T18:00:00-03:00" });
  validateCalendarSlot({ start: "2026-10-19T12:00:00Z", end: "2026-10-19T12:30:00Z" });
  validateBookingRequest(booking);
  validateAvailabilityQuery(query);
  validateAvailabilityQuery({ from: query.from, until: query.from });
});

test("agenda rejeita fins de semana, horários fora da janela e duração incorreta", () => {
  for (const value of [
    { start: "2026-10-18T09:00:00-03:00", end: "2026-10-18T09:30:00-03:00" },
    { start: "2026-10-19T08:30:00-03:00", end: "2026-10-19T09:00:00-03:00" },
    { start: "2026-10-19T17:45:00-03:00", end: "2026-10-19T18:15:00-03:00" },
    { ...slot, end: "2026-10-19T10:00:00-03:00" },
  ]) assert.throws(() => validateCalendarSlot(value), CalendarValidationError);
});

test("datas impossíveis, timestamps sem fuso e dados incompletos não chegam ao provedor", async () => {
  let calls = 0;
  const provider = new HttpCalendarProvider(configuration, async () => { calls++; throw new Error(); });
  for (const input of [
    { ...booking, start: "2026-02-30T09:00:00-03:00" },
    { ...booking, start: "2026-10-19T09:00:00" },
    { ...booking, email: "invalid" },
    { ...booking, name: " " },
  ]) await assert.rejects(provider.book(input), CalendarValidationError);
  await assert.rejects(provider.availability({ from: "2026-10-20", until: "2026-10-19" }), CalendarValidationError);
  assert.equal(calls, 0);
});

test("GET usa /disponibilidade e Bearer, preserva o prefixo da base e traduz a resposta", async () => {
  const provider = new HttpCalendarProvider({ ...configuration, baseUrl: `${configuration.baseUrl}/api/calendar` }, async (url, options) => {
    assert.equal(url.pathname, "/api/calendar/disponibilidade");
    assert.equal(url.searchParams.get("de"), query.from);
    assert.equal(url.searchParams.get("ate"), query.until);
    assert.equal(options.method, "GET");
    assert.equal(options.headers.Authorization, "Bearer fixture-token");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    return Response.json(availability);
  });
  assert.deepEqual(await provider.availability(query), { timezone: "America/Sao_Paulo", slots: [slot] });
});

test("consulta vazia é válida; dados inválidos e erros de autenticação não viram disponibilidade", async () => {
  const empty = new HttpCalendarProvider(configuration, async () => Response.json({ fuso: availability.fuso, livres: [] }));
  assert.deepEqual(await empty.availability(query), { timezone: availability.fuso, slots: [] });
  for (const payload of [null, {}, { ...availability, livres: "invalid" }, {
    ...availability, livres: [{ inicio: slot.start, fim: "2026-10-19T10:00:00-03:00" }],
  }]) {
    const provider = new HttpCalendarProvider(configuration, async () => Response.json(payload));
    await assert.rejects(provider.availability(query), (error) => error instanceof CalendarServiceError && error.kind === "invalid_response");
  }
  const unauthorized = new HttpCalendarProvider(configuration, async () => new Response("sensitive upstream body", { status: 401 }));
  await assert.rejects(unauthorized.availability(query), (error) => {
    assert.ok(error instanceof CalendarServiceError);
    assert.equal(error.kind, "authentication");
    assert.ok(!error.message.includes("sensitive"));
    assert.ok(!error.message.includes(configuration.token));
    return true;
  });
});

test("POST usa /reunioes e somente inicio, nome e email; não devolve payload externo", async () => {
  for (const status of [200, 201, 204]) {
    const provider = new HttpCalendarProvider(configuration, async (url, options) => {
      assert.equal(url.pathname, "/reunioes");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer fixture-token");
      assert.deepEqual(JSON.parse(options.body), { inicio: booking.start, nome: booking.name, email: booking.email });
      return status === 204 ? new Response(null, { status }) : Response.json({ internal: "must not escape" }, { status });
    });
    assert.deepEqual(await provider.book(booking), { status: "confirmed", start: booking.start });
  }
});

test("409 retorna conflito, sem confirmar reserva ou repetir o POST", async () => {
  let calls = 0;
  const provider = new HttpCalendarProvider(configuration, async () => { calls++; return new Response(null, { status: 409 }); });
  assert.deepEqual(await provider.book(booking), { status: "conflict" });
  assert.equal(calls, 1);
});

test("falha de transporte ou timeout mantém resultado desconhecido, sem retry ou vazamento de segredo", async () => {
  for (const error of [new Error("sensitive fixture-token"), new DOMException("timed out", "TimeoutError")]) {
    let calls = 0;
    const provider = new HttpCalendarProvider(configuration, async () => { calls++; throw error; });
    const result = await provider.book(booking);
    assert.deepEqual(result, { status: "unknown", reason: "transport" });
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify(result).includes(configuration.token));
  }
});

test("POST tem um sinal de timeout que aborta a espera", async () => {
  const provider = new HttpCalendarProvider({ ...configuration, timeoutMilliseconds: 10 }, async (_url, options) => {
    return new Promise((resolve, reject) => {
      const keepAlive = setTimeout(() => resolve(new Response(null, { status: 201 })), 1_000);
      options.signal.addEventListener("abort", () => { clearTimeout(keepAlive); reject(options.signal.reason); }, { once: true });
    });
  });
  assert.deepEqual(await provider.book(booking), { status: "unknown", reason: "transport" });
});

test("respostas pendentes e erros do servidor nunca confirmam reunião", async () => {
  for (const [status, expected] of [
    [202, { status: "unknown", reason: "pending" }],
    [500, { status: "unknown", reason: "server_error" }],
    [408, { status: "unknown", reason: "server_error" }],
    [401, { status: "rejected", statusCode: 401 }],
    [422, { status: "rejected", statusCode: 422 }],
    [302, { status: "unknown", reason: "unexpected_response" }],
  ]) {
    let calls = 0;
    const provider = new HttpCalendarProvider(configuration, async () => { calls++; return new Response(null, { status }); });
    assert.deepEqual(await provider.book(booking), expected);
    assert.equal(calls, 1);
  }
});

test("configuração inválida falha antes de qualquer request e não inclui valores sensíveis", () => {
  for (const input of [
    { ...configuration, baseUrl: "https://user:sensitive@example.invalid" },
    { ...configuration, baseUrl: "https://example.invalid?token=sensitive" },
    { ...configuration, token: "sensitive\r\nInjected: true" },
    { ...configuration, token: "" },
  ]) assert.throws(() => new HttpCalendarProvider(input), (error) => {
    assert.ok(error instanceof EnvironmentError);
    assert.ok(!error.message.includes("sensitive"));
    return true;
  });
});
