import type { VoiceSession } from "../domain/voice-session.ts";
import { conversationProcessingTargetMs, type ConversationProcessing } from "../domain/conversation-processing.ts";

export function conversationProcessingView(session: VoiceSession | null, job: ConversationProcessing | null, hasTranscript: boolean, hasQualification: boolean) {
  const finished = hasQualification || job?.status === "completed";
  const expected = Boolean(session && ["finalizing", "failed", "abandoned"].includes(session.status));
  const pending = expected && !finished && job?.status !== "failed";
  const startedAt = session?.finalizingAt ?? job?.requestedAt ?? session?.failedAt ?? session?.abandonedAt;
  const delayed = pending && Boolean(startedAt && Date.now() - Date.parse(startedAt) > conversationProcessingTargetMs);
  const message = finished ? "Resumo e qualificação extraídos." : job?.status === "failed"
    ? "Falha no pós-processamento. A transcrição e o resumo recebidos foram preservados."
    : delayed ? "O processamento ultrapassou a meta de 1 minuto. Recuperação em andamento."
    : !hasTranscript ? "Aguardando a transcrição da ElevenLabs; recuperação automática em andamento."
    : job?.lastError ? "Nova tentativa de extração em andamento." : "Extraindo a qualificação SPICED...";
  return { processing: pending, processingDelayed: delayed, processingStatus: job?.status ?? null,
    processingMessage: expected || finished ? message : null, processingError: job?.lastError ?? null };
}
