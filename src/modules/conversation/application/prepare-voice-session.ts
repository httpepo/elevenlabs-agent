import { randomUUID } from "node:crypto";
import { createVoiceSession, type VoiceSession } from "../domain/voice-session.ts";
import { compileVoiceContext } from "../domain/voice-context.ts";
import type { LeadRepository } from "../../leads/ports/lead-repository.ts";
import type { ResearchRepository } from "../../research/ports/research-repository.ts";
import type { ConversationRepository } from "../ports/conversation-repository.ts";
import type { LeadSessionCredentialVerifier } from "../ports/lead-session-credential-verifier.ts";
import type { VoiceProvider } from "../ports/voice-provider.ts";
import type { VoiceToolExecutionRepository } from "../ports/voice-tool-execution-repository.ts";
import type { VoiceToolCredentialService } from "../ports/voice-tool-credential-service.ts";

export class VoiceAuthorizationError extends Error {
  readonly kind: "unauthorized" | "not_found" | "research_pending" | "research_failed" | "briefing_missing";
  readonly status: number;

  constructor(message: string, kind: VoiceAuthorizationError["kind"], status: number) {
    super(message);
    this.name = "VoiceAuthorizationError";
    this.kind = kind;
    this.status = status;
  }
}

export class PrepareVoiceSessionUseCase {
  constructor(
    private readonly leads: LeadRepository,
    private readonly research: ResearchRepository,
    private readonly conversations: ConversationRepository,
    private readonly voiceProvider: VoiceProvider,
    private readonly credentials: LeadSessionCredentialVerifier,
    private readonly executions: VoiceToolExecutionRepository,
    private readonly toolCredentials: VoiceToolCredentialService,
  ) {}

  async execute(input: { leadId: string; credential: string | null }) {
    const lead = await this.leads.get(input.leadId);
    if (!lead) throw new VoiceAuthorizationError("Visitante não encontrado.", "not_found", 404);
    if (!input.credential || !(await this.credentials.verify({ credential: input.credential, leadId: lead.id, executionId: lead.executionId }))) {
      throw new VoiceAuthorizationError("Sessão pública inválida ou expirada.", "unauthorized", 401);
    }

    const eligibility = await this.getEligibility(lead.id, lead.executionId);
    const session = createVoiceSession({ leadId: lead.id, executionId: lead.executionId, briefingId: eligibility.briefing.id });
    await this.conversations.createSession(session);
    const context = compileVoiceContext({ leadId: lead.id, lead: lead.normalized, briefing: eligibility.briefing, voiceSessionId: session.id });
    const startedAt = Date.now();
    try {
      const calendarCredential = this.toolCredentials.issue({ leadId: lead.id, executionId: lead.executionId, voiceSessionId: session.id });
      const providerSession = await this.voiceProvider.prepareSession({ participantName: lead.normalized.fullName });
      const readySession = await this.conversations.transitionSession({
        sessionId: session.id,
        status: "ready",
        reason: "Token temporário de voz autorizado pelo backend.",
        externalCallId: providerSession.externalCallId,
      });
      await this.auditTokenRequest({ lead, session: readySession, startedAt, status: "success", output: { providerStatus: 200, hasToken: true, externalCallId: providerSession.externalCallId } });
      return {
        voiceSessionId: readySession.id,
        executionId: lead.executionId,
        briefingId: eligibility.briefing.id,
        conversationToken: providerSession.conversationToken,
        agentId: providerSession.agentId,
        dynamicVariables: { ...context, secret__calendar_authorization: `Bearer ${calendarCredential}` },
      };
    } catch (error) {
      await this.markFailed(session, error);
      await this.auditTokenRequest({ lead, session, startedAt, status: "failed", output: { error: publicErrorMessage(error) } });
      throw error;
    }
  }

  private async getEligibility(leadId: string, executionId: string) {
    const [run, briefing] = await Promise.all([
      this.research.getLatestRun(leadId, executionId),
      this.research.getLatestBriefing(leadId, executionId),
    ]);
    if (!run || run.status === "queued" || run.status === "running") {
      throw new VoiceAuthorizationError("O briefing ainda está sendo preparado. Aguarde antes de iniciar a conversa.", "research_pending", 409);
    }
    if (run.status === "failed" || run.status === "cancelled") {
      throw new VoiceAuthorizationError("O briefing não pôde ser gerado. Tente preparar a pesquisa novamente.", "research_failed", 422);
    }
    if (!briefing || !["ready", "partial"].includes(briefing.status)) {
      throw new VoiceAuthorizationError("A conversa não pode começar sem um briefing válido.", "briefing_missing", 422);
    }
    return { run, briefing };
  }

  private async markFailed(session: VoiceSession, error: unknown): Promise<void> {
    const current = await this.conversations.getSession(session.id);
    if (!current || ["failed", "completed", "abandoned"].includes(current.status)) return;
    await this.conversations.transitionSession({ sessionId: session.id, status: "failed", reason: publicErrorMessage(error) });
  }

  private async auditTokenRequest(input: {
    lead: { id: string; executionId: string };
    session: { id: string };
    startedAt: number;
    status: "success" | "failed";
    output: Record<string, unknown>;
  }): Promise<void> {
    await this.executions.appendToolExecution({
      id: randomUUID(), leadId: input.lead.id, executionId: input.lead.executionId, voiceSessionId: input.session.id,
      provider: "elevenlabs", operation: "get_conversation_token", status: input.status, durationMs: Date.now() - input.startedAt,
      input: { provider: "elevenlabs", tokenType: "webrtc_conversation_token" }, output: input.output, createdAt: new Date().toISOString(),
    });
  }
}

function publicErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "A autorização da conversa falhou.";
  return error.message.replace(/[\r\n]+/g, " ").slice(0, 300) || "A autorização da conversa falhou.";
}
