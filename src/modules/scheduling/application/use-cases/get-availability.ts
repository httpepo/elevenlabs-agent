import { randomUUID } from "node:crypto";
import {
  calendarOfferLifetimeMilliseconds,
  calendarTimezone,
  getCalendarLocalParts,
  validateAvailabilityQuery,
  type AvailabilityQuery,
  type CalendarSlot,
} from "../../domain/calendar.ts";
import { createMeetingAttempt } from "../../domain/meeting-attempt.ts";
import type { LeadRepository } from "../../../leads/ports/lead-repository.ts";
import type { ConversationRepository } from "../../../conversation/ports/conversation-repository.ts";
import type { CalendarProvider } from "../../ports/calendar-provider.ts";
import type { MeetingAttemptRepository } from "../../ports/meeting-attempt-repository.ts";
import type { SlotOfferTokenService } from "../../ports/slot-offer-token.ts";
import type { CalendarToolExecutionRepository } from "../../ports/calendar-tool-execution-repository.ts";
import { getAuthorizedVoiceContext } from "../validate-voice-context.ts";

export type AvailabilityOption = Readonly<{
  bookingIntentId: string;
  slotOfferToken: string;
  start: string;
  end: string;
  spokenLabel: string;
}>;

export type AvailabilityToolResult = Readonly<{
  status: "offered" | "no_slots";
  timezone: typeof calendarTimezone;
  options: AvailabilityOption[];
  message: string;
}>;

export class GetAvailabilityUseCase {
  constructor(
    private readonly leads: LeadRepository,
    private readonly conversations: ConversationRepository,
    private readonly provider: CalendarProvider,
    private readonly attempts: MeetingAttemptRepository,
    private readonly tokenService: SlotOfferTokenService,
    private readonly toolExecutions: CalendarToolExecutionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: { leadId: string; voiceSessionId: string; query: AvailabilityQuery }): Promise<AvailabilityToolResult> {
    const startedAt = Date.now();
    let telemetryStatus: "success" | "failed" | "conflict" | "timeout" = "failed";
    let telemetryOutput: Record<string, unknown> = { status: "failed" };
    let executionId = "unknown-until-lead-validation";
    const safeInput = { from: input.query.from, until: input.query.until };
    try {
      const { lead, session } = await getAuthorizedVoiceContext(this.leads, this.conversations, input);
      executionId = lead.executionId;
      validateAvailabilityQuery(input.query);
      const availability = await this.provider.availability(input.query);
      const selectedSlots = selectFriendlySlots(availability.slots);
      if (!selectedSlots.length) {
        const attempt = createMeetingAttempt({
          leadId: lead.id,
          executionId: lead.executionId,
          voiceSessionId: session.id,
          status: "not_requested",
          reason: "A agenda consultada não retornou horários elegíveis nesta janela.",
          availabilityFrom: input.query.from,
          availabilityUntil: input.query.until,
          createdAt: this.now().toISOString(),
        });
        await this.attempts.append(attempt);
        const result: AvailabilityToolResult = {
          status: "no_slots",
          timezone: calendarTimezone,
          options: [],
          message: "Não encontrei horários livres nesta janela. Posso consultar outro período.",
        };
        telemetryStatus = "success";
        telemetryOutput = { status: result.status, optionCount: 0 };
        return result;
      }

      const expiresAt = Math.floor((this.now().getTime() + calendarOfferLifetimeMilliseconds) / 1_000);
      const options = await Promise.all(selectedSlots.map(async (slot) => this.createOffer({
        leadId: lead.id,
        executionId: lead.executionId,
        voiceSessionId: session.id,
        query: input.query,
        slot,
        expiresAt,
      })));
      const result: AvailabilityToolResult = {
        status: "offered",
        timezone: calendarTimezone,
        options,
        message: "Encontrei algumas opções. Escolha uma delas e confirme que deseja reservar.",
      };
      telemetryStatus = "success";
      telemetryOutput = { status: result.status, optionCount: options.length, timezone: result.timezone };
      return result;
    } catch (error) {
      if (isUnavailableCalendarError(error)) telemetryStatus = "timeout";
      telemetryOutput = { status: "failed", error: publicErrorMessage(error) };
      throw error;
    } finally {
      await appendTelemetry(this.toolExecutions, {
        leadId: input.leadId,
        executionId,
        voiceSessionId: input.voiceSessionId,
        operation: "calendar_availability",
        status: telemetryStatus,
        durationMs: Date.now() - startedAt,
        input: safeInput,
        output: telemetryOutput,
      });
    }
  }

  private async createOffer(input: {
    leadId: string;
    executionId: string;
    voiceSessionId: string;
    query: AvailabilityQuery;
    slot: CalendarSlot;
    expiresAt: number;
  }): Promise<AvailabilityOption> {
    const bookingIntentId = randomUUID();
    const token = this.tokenService.issue({
      leadId: input.leadId,
      executionId: input.executionId,
      voiceSessionId: input.voiceSessionId,
      bookingIntentId,
      start: input.slot.start,
      end: input.slot.end,
      availabilityFrom: input.query.from,
      availabilityUntil: input.query.until,
      expiresAt: input.expiresAt,
    });
    const attempt = createMeetingAttempt({
      leadId: input.leadId,
      executionId: input.executionId,
      voiceSessionId: input.voiceSessionId,
      bookingIntentId,
      slotOfferTokenHash: this.tokenService.hash(token),
      start: input.slot.start,
      end: input.slot.end,
      availabilityFrom: input.query.from,
      availabilityUntil: input.query.until,
      status: "offered",
      reason: "Horário válido oferecido ao visitante após consulta real da agenda.",
    });
    await this.attempts.append(attempt);
    return {
      bookingIntentId,
      slotOfferToken: token,
      start: input.slot.start,
      end: input.slot.end,
      spokenLabel: formatSpokenLabel(input.slot.start),
    };
  }
}

export function selectFriendlySlots(slots: CalendarSlot[]): CalendarSlot[] {
  const ordered = [...slots].sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  if (ordered.length <= 3) return ordered;
  const selected: CalendarSlot[] = [ordered[0]];
  const firstPeriod = periodOf(ordered[0]);
  const balanced = ordered.find((slot) => periodOf(slot) !== firstPeriod);
  if (balanced && balanced !== ordered[0]) selected.push(balanced);
  for (const slot of ordered) {
    if (selected.length >= 3) break;
    if (!selected.includes(slot)) selected.push(slot);
  }
  return selected.sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

function periodOf(slot: CalendarSlot): "morning" | "afternoon" {
  const local = getCalendarLocalParts(Date.parse(slot.start));
  return local.minutes < 12 * 60 ? "morning" : "afternoon";
}

function formatSpokenLabel(start: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: calendarTimezone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(start)).replace(",", " às");
}

function publicErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "A consulta da agenda falhou.";
  return error.message.replace(/[\r\n]+/g, " ").slice(0, 300) || "A consulta da agenda falhou.";
}

function isUnavailableCalendarError(error: unknown): boolean {
  return error instanceof Error && error.name === "CalendarServiceError" &&
    "kind" in error && (error as { kind?: unknown }).kind === "unavailable";
}

async function appendTelemetry(repository: CalendarToolExecutionRepository, input: {
  leadId: string;
  executionId: string;
  voiceSessionId: string | null;
  operation: string;
  status: "success" | "failed" | "conflict" | "timeout";
  durationMs: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}): Promise<void> {
  try {
    await repository.appendToolExecution({
      id: randomUUID(),
      leadId: input.leadId,
      executionId: input.executionId,
      voiceSessionId: input.voiceSessionId,
      provider: "elevenlabs",
      operation: input.operation,
      status: input.status,
      durationMs: input.durationMs,
      input: input.input,
      output: input.output,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Falha ao registrar ferramenta de agenda", error instanceof Error ? error.name : "UnknownError");
  }
}
