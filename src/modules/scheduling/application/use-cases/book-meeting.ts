import { randomUUID } from "node:crypto";
import {
  validateCalendarSlot,
  type BookingResult,
} from "../../domain/calendar.ts";
import {
  createMeetingAttempt,
  transitionMeetingAttempt,
  type MeetingAttempt,
} from "../../domain/meeting-attempt.ts";
import type { LeadRepository } from "../../../leads/ports/lead-repository.ts";
import type { ConversationRepository } from "../../../conversation/ports/conversation-repository.ts";
import type { CalendarProvider } from "../../ports/calendar-provider.ts";
import type { MeetingAttemptRepository } from "../../ports/meeting-attempt-repository.ts";
import type { SlotOfferTokenService } from "../../ports/slot-offer-token.ts";
import type { CalendarToolExecutionRepository } from "../../ports/calendar-tool-execution-repository.ts";
import { GetAvailabilityUseCase, type AvailabilityToolResult } from "./get-availability.ts";
import { getAuthorizedVoiceContext } from "../validate-voice-context.ts";
import { InvalidBookingOfferError } from "../scheduling-errors.ts";

export type BookingToolResult = Readonly<{
  status: "confirmed" | "conflict" | "uncertain" | "failed" | "cancelled" | "pending";
  message: string;
  start: string | null;
  alternatives: AvailabilityToolResult["options"];
  manualVerificationRequired: boolean;
}>;

export class BookMeetingUseCase {
  constructor(
    private readonly leads: LeadRepository,
    private readonly conversations: ConversationRepository,
    private readonly provider: CalendarProvider,
    private readonly attempts: MeetingAttemptRepository,
    private readonly tokenService: SlotOfferTokenService,
    private readonly toolExecutions: CalendarToolExecutionRepository,
    private readonly getAvailability: GetAvailabilityUseCase,
  ) {}

  async execute(input: {
    leadId: string;
    voiceSessionId: string;
    bookingIntentId: string;
    slotOfferToken: string;
    consent: boolean;
  }): Promise<BookingToolResult> {
    const startedAt = Date.now();
    let telemetryStatus: "success" | "failed" | "conflict" | "timeout" = "failed";
    let telemetryOutput: Record<string, unknown> = { status: "failed" };
    let executionId = "unknown-until-lead-validation";
    try {
      const { lead, session } = await getAuthorizedVoiceContext(this.leads, this.conversations, input);
      executionId = lead.executionId;
      const existing = await this.attempts.findLatestByBookingIntentId(input.bookingIntentId);
      const sameVoiceContext = existing && existing.leadId === lead.id && existing.executionId === executionId && existing.voiceSessionId === session.id;
      if (existing && !sameVoiceContext) {
        await this.appendFailedAttempt({
          input,
          executionId,
          offer: null,
          bookingIntentId: null,
          reason: "A intenção de reserva pertence a outro visitante ou sessão de voz.",
        });
        throw new InvalidBookingOfferError();
      }
      if (existing && sameVoiceContext && existing.status !== "offered") {
        const result = persistedBookingResult(existing);
        telemetryStatus = result.status === "uncertain" ? "timeout" : "success";
        telemetryOutput = { status: result.status, idempotent: true };
        return result;
      }

      const offer = await this.validateOffer(input, executionId, sameVoiceContext ? existing : null);
      if (!input.consent) {
        const cancelled = transitionFromOffer(offer, "cancelled", "O visitante não consentiu com a reserva.");
        await this.attempts.append(cancelled);
        const result = cancelledResult();
        telemetryStatus = "success";
        telemetryOutput = { status: result.status };
        return result;
      }

      const bookingPayload = {
        inicio: offer.start!,
        nome: lead.normalized.fullName,
        email: lead.normalized.email,
      };
      const pending = transitionMeetingAttempt(offer, "pending", {
        reason: "O visitante escolheu explicitamente este horário e consentiu com a reserva.",
        bookingPayload,
      });
      await this.attempts.append(pending);
      const providerResult = await this.provider.book({
        start: offer.start!,
        name: lead.normalized.fullName,
        email: lead.normalized.email,
      });
      const result = await this.handleProviderResult({
        leadId: lead.id,
        executionId,
        voiceSessionId: session.id,
        pending,
        providerResult,
      });
      telemetryStatus = result.status === "conflict" ? "conflict" : result.status === "uncertain" ? "timeout" : "success";
      telemetryOutput = {
        status: result.status,
        start: result.start,
        alternativeCount: result.alternatives.length,
        manualVerificationRequired: result.manualVerificationRequired,
      };
      return result;
    } catch (error) {
      telemetryOutput = { status: "failed", error: publicErrorMessage(error) };
      throw error;
    } finally {
      await appendTelemetry(this.toolExecutions, {
        leadId: input.leadId,
        executionId,
        voiceSessionId: input.voiceSessionId,
        operation: "calendar_booking",
        status: telemetryStatus,
        durationMs: Date.now() - startedAt,
        input: { bookingIntentId: input.bookingIntentId, consent: input.consent, hasSlotOfferToken: Boolean(input.slotOfferToken) },
        output: telemetryOutput,
      });
    }
  }

  private async validateOffer(input: {
    leadId: string;
    voiceSessionId: string;
    bookingIntentId: string;
    slotOfferToken: string;
  }, executionId: string, existing: MeetingAttempt | null): Promise<MeetingAttempt> {
    const tokenClaims = input.slotOfferToken ? this.tokenService.verify(input.slotOfferToken) : null;
    const offer = existing ?? (tokenClaims ? await this.attempts.findOfferedByTokenHash(this.tokenService.hash(input.slotOfferToken)) : null);
    if (!tokenClaims || !offer || offer.status !== "offered" ||
        offer.bookingIntentId !== input.bookingIntentId ||
        offer.slotOfferTokenHash !== this.tokenService.hash(input.slotOfferToken) ||
        tokenClaims.leadId !== input.leadId || tokenClaims.executionId !== executionId ||
        tokenClaims.voiceSessionId !== input.voiceSessionId || tokenClaims.bookingIntentId !== input.bookingIntentId ||
        tokenClaims.start !== offer.start || tokenClaims.end !== offer.end ||
        tokenClaims.availabilityFrom !== offer.availabilityFrom || tokenClaims.availabilityUntil !== offer.availabilityUntil) {
      await this.appendFailedAttempt({
        input,
        executionId,
        offer,
        reason: "A oferta de horário é inválida, expirou ou não pertence a esta sessão de voz.",
      });
      throw new InvalidBookingOfferError();
    }
    if (!offer.start || !offer.end) {
      await this.appendFailedAttempt({ input, executionId, offer, reason: "A oferta não contém limites de horário válidos." });
      throw new InvalidBookingOfferError();
    }
    try {
      validateCalendarSlot({ start: offer.start, end: offer.end });
    } catch {
      await this.appendFailedAttempt({ input, executionId, offer, reason: "A oferta não contém um slot comercial válido." });
      throw new InvalidBookingOfferError();
    }
    return offer;
  }

  private async appendFailedAttempt(input: {
    input: { leadId: string; voiceSessionId: string; bookingIntentId: string; slotOfferToken: string };
    executionId: string;
    offer: MeetingAttempt | null;
    bookingIntentId?: string | null;
    reason: string;
  }): Promise<void> {
    const attempt = input.offer
      ? transitionFromOffer(input.offer, "failed", input.reason)
      : createMeetingAttempt({
        leadId: input.input.leadId,
        executionId: input.executionId,
        voiceSessionId: input.input.voiceSessionId,
        bookingIntentId: input.bookingIntentId === undefined
          ? (isBookingIntentId(input.input.bookingIntentId) ? input.input.bookingIntentId : null)
          : input.bookingIntentId,
        status: "failed",
        reason: input.reason,
      });
    await this.attempts.append(attempt);
  }

  private async handleProviderResult(input: {
    leadId: string;
    executionId: string;
    voiceSessionId: string;
    pending: MeetingAttempt;
    providerResult: BookingResult;
  }): Promise<BookingToolResult> {
    if (input.providerResult.status === "confirmed") {
      await this.attempts.append(transitionMeetingAttempt(input.pending, "confirmed", {
        reason: "A API externa confirmou a reserva com resposta HTTP de sucesso.",
        httpStatus: input.providerResult.statusCode,
        bookingPayload: input.pending.bookingPayload,
      }));
      return {
        status: "confirmed",
        message: "A reunião foi reservada com sucesso pela agenda da Atlas.",
        start: input.providerResult.start,
        alternatives: [],
        manualVerificationRequired: false,
      };
    }
    if (input.providerResult.status === "conflict") {
      await this.attempts.append(transitionMeetingAttempt(input.pending, "conflict", {
        reason: "O horário foi ocupado por outra reserva antes da confirmação.",
        httpStatus: input.providerResult.statusCode,
      }));
      const alternatives = await this.refreshAvailability(input.pending);
      return {
        status: "conflict",
        message: alternatives.options.length
          ? "Esse horário acabou de ser ocupado. Escolha uma das novas opções disponíveis."
          : "Esse horário acabou de ser ocupado e não há outra opção nesta janela.",
        start: null,
        alternatives: alternatives.options,
        manualVerificationRequired: false,
      };
    }
    if (input.providerResult.status === "unknown") {
      await this.attempts.append(transitionMeetingAttempt(input.pending, "uncertain", {
        reason: "A reserva foi enviada, mas a resposta da agenda não pôde ser confirmada.",
        httpStatus: input.providerResult.statusCode ?? null,
        bookingPayload: input.pending.bookingPayload,
        transportDiagnostic: input.providerResult.reason,
      }));
      return {
        status: "uncertain",
        message: "A solicitação foi registrada, mas a equipe Atlas precisa verificar a agenda antes de confirmar.",
        start: input.pending.start,
        alternatives: [],
        manualVerificationRequired: true,
      };
    }
    await this.attempts.append(transitionMeetingAttempt(input.pending, "failed", {
      reason: "A agenda recusou a tentativa de reserva.",
      httpStatus: input.providerResult.statusCode,
      bookingPayload: input.pending.bookingPayload,
    }));
    return {
      status: "failed",
      message: "A agenda não aceitou essa reserva. Nenhuma reunião foi confirmada.",
      start: input.pending.start,
      alternatives: [],
      manualVerificationRequired: false,
    };
  }

  private async refreshAvailability(attempt: MeetingAttempt): Promise<AvailabilityToolResult> {
    if (!attempt.availabilityFrom || !attempt.availabilityUntil || !attempt.voiceSessionId) {
      return { status: "no_slots", timezone: "America/Sao_Paulo", options: [], message: "Não foi possível consultar novas opções." };
    }
    try {
      return await this.getAvailability.execute({
        leadId: attempt.leadId,
        voiceSessionId: attempt.voiceSessionId,
        query: { from: attempt.availabilityFrom, until: attempt.availabilityUntil },
      });
    } catch {
      return { status: "no_slots", timezone: "America/Sao_Paulo", options: [], message: "Não foi possível consultar novas opções agora." };
    }
  }
}

function transitionFromOffer(attempt: MeetingAttempt, status: "pending" | "confirmed" | "conflict" | "uncertain" | "failed" | "cancelled", reason: string): MeetingAttempt {
  return transitionMeetingAttempt(attempt, status, {
    reason,
    bookingPayload: attempt.bookingPayload,
    transportDiagnostic: attempt.transportDiagnostic,
  });
}

function persistedBookingResult(attempt: MeetingAttempt): BookingToolResult {
  const common = { start: attempt.start, alternatives: [] as AvailabilityToolResult["options"], manualVerificationRequired: false };
  if (attempt.status === "confirmed") return { ...common, status: "confirmed", message: "A reunião já foi confirmada pela agenda." };
  if (attempt.status === "conflict") return { ...common, status: "conflict", message: "Esse horário já estava ocupado. Escolha uma nova opção oferecida.", };
  if (attempt.status === "uncertain") return { ...common, status: "uncertain", message: "Esta reserva aguarda verificação manual da equipe Atlas.", manualVerificationRequired: true };
  if (attempt.status === "cancelled") return { ...common, status: "cancelled", message: "A reserva não foi realizada porque não houve consentimento." };
  if (attempt.status === "pending") return { ...common, status: "pending", message: "Esta reserva já foi enviada e aguarda resposta da agenda." };
  return { ...common, status: "failed", message: "A tentativa anterior não confirmou uma reunião." };
}

function cancelledResult(): BookingToolResult {
  return { status: "cancelled", message: "Tudo bem. Nenhuma reunião foi reservada.", start: null, alternatives: [], manualVerificationRequired: false };
}

function isBookingIntentId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function publicErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "A reserva da agenda falhou.";
  return error.message.replace(/[\r\n]+/g, " ").slice(0, 300) || "A reserva da agenda falhou.";
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
      id: randomUUID(), leadId: input.leadId, executionId: input.executionId, voiceSessionId: input.voiceSessionId,
      provider: "elevenlabs", operation: input.operation, status: input.status, durationMs: input.durationMs,
      input: input.input, output: input.output, createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Falha ao registrar ferramenta de reserva", error instanceof Error ? error.name : "UnknownError");
  }
}
