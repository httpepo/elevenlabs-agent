"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Badge } from "@/design-system/components/ui/badge";
import { Button } from "@/design-system/components/ui/button";
import { Card } from "@/design-system/components/ui/card";
import { MicPermissionGuide, type VoiceUiErrorKind } from "./mic-permission-guide";

type PreparedVoiceSession = {
  voiceSessionId: string;
  executionId: string;
  briefingId: string;
  conversationToken: string;
  dynamicVariables: Record<string, string | number | boolean>;
};

type VoiceWidgetState = "preparing" | "idle" | "authorizing" | "connecting" | "active" | "ending" | "completed" | "abandoned" | "failed";

type VoiceUiError = { kind: VoiceUiErrorKind; message: string };
type ConversationLine = { id: number; role: "agent" | "user"; text: string };

export function VoiceSessionWidget({ leadId, visitorName, autoStart = false }: { leadId: string; visitorName: string; autoStart?: boolean }) {
  return <ConversationProvider><VoiceSessionContent leadId={leadId} visitorName={visitorName} autoStart={autoStart} /></ConversationProvider>;
}

function VoiceSessionContent({ leadId, visitorName, autoStart }: { leadId: string; visitorName: string; autoStart: boolean }) {
  const [state, setState] = useState<VoiceWidgetState>("preparing");
  const [error, setError] = useState<VoiceUiError | null>(null);
  const [prepared, setPrepared] = useState<PreparedVoiceSession | null>(null);
  const [conversationLines, setConversationLines] = useState<ConversationLine[]>([]);
  const [streamingAgentText, setStreamingAgentText] = useState("");
  const stateRef = useRef<VoiceWidgetState>(state);
  const sessionIdRef = useRef<string | null>(null);
  const endingRef = useRef(false);
  const nextLineIdRef = useRef(0);
  const autoStartStartedRef = useRef(false);

  const sendBrowserEvent = useCallback((event: "connecting" | "connected" | "finalizing" | "abandoned" | "failed" | "disconnected", reason?: string) => {
    const voiceSessionId = sessionIdRef.current;
    if (!voiceSessionId) return;
    void fetch(`/api/leads/${leadId}/voice/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ voiceSessionId, event, reason }),
      keepalive: event === "abandoned",
    }).catch(() => undefined);
  }, [leadId]);

  const handleConnect = useCallback(() => {
    setState("active");
    sendBrowserEvent("connected", "Conexão WebRTC estabelecida no navegador.");
  }, [sendBrowserEvent]);

  const handleDisconnect = useCallback((details: { reason: "error" | "agent" | "user"; message?: string }) => {
    if (details.reason === "error") {
      setError({ kind: "network", message: "A conexão de voz foi interrompida antes da confirmação do atendimento." });
      setState("failed");
      sendBrowserEvent("failed", "O SDK de voz encerrou a conexão com erro.");
      return;
    }
    if (!endingRef.current) sendBrowserEvent("finalizing", details.reason === "agent" ? "O agente encerrou a conversa." : "A conexão foi encerrada.");
    setState("ending");
  }, [sendBrowserEvent]);

  const handleError = useCallback(() => {
    setError({ kind: "network", message: "Não foi possível manter a conexão de voz. Nenhuma conclusão foi inventada." });
    setState("failed");
    sendBrowserEvent("failed", "O SDK de voz informou uma falha de conexão.");
  }, [sendBrowserEvent]);

  const { startSession, endSession, isMuted, setMuted, isSpeaking, isListening, mode, status } = useConversation({
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onError: handleError,
    onMessage: ({ message: nextMessage, role }) => {
      const cleanedMessage = cleanDisplayedVoiceText(nextMessage);
      if (!cleanedMessage) return;
      setConversationLines((currentLines) => [...currentLines, {
        id: nextLineIdRef.current++,
        role: role === "user" ? "user" : "agent",
        text: cleanedMessage,
      }]);
      setStreamingAgentText("");
    },
    onAgentChatResponsePart: ({ text: nextText, type }) => {
      if (typeof nextText !== "string" || !nextText) return;
      if (type === "start") setStreamingAgentText(cleanDisplayedVoiceText(nextText));
      if (type === "delta") setStreamingAgentText((currentText) => cleanDisplayedVoiceText(currentText + nextText));
    },
  });

  const requestPreparedSession = useCallback(async (): Promise<PreparedVoiceSession> => {
    const response = await fetch(`/api/leads/${leadId}/voice/session`, { method: "POST", credentials: "same-origin" });
    const payload = await response.json() as Partial<PreparedVoiceSession> & { error?: string; code?: string };
    if (!response.ok) throw new VoiceRequestError(response.status, payload.error ?? "Não foi possível preparar a conversa.", payload.code);
    if (!isPreparedSession(payload)) throw new VoiceRequestError(500, "A preparação da conversa veio incompleta.");
    return payload;
  }, [leadId]);

  const prepareAgentSession = useCallback(async (): Promise<PreparedVoiceSession | null> => {
    setError(null);
    setState("preparing");
    try {
      const payload = await requestPreparedSession();
      setPrepared(payload);
      sessionIdRef.current = payload.voiceSessionId;
      setState("idle");
      return payload;
    } catch (caughtError) {
      const nextError = toVoiceUiError(caughtError);
      setError(nextError);
      setState("failed");
      return null;
    }
  }, [requestPreparedSession]);

  useEffect(() => {
    void prepareAgentSession();
  }, [prepareAgentSession]);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    if (state !== "ending") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/leads/${leadId}/voice/status`, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const payload = await response.json() as { status?: string };
        if (payload.status === "completed") setState("completed");
        if (payload.status === "failed") {
          setError({ kind: "network", message: "Não foi possível confirmar o encerramento da conversa. Tente novamente." });
          setState("failed");
        }
        if (payload.status === "abandoned") setState("abandoned");
      } catch { /* A próxima consulta tenta novamente. */ }
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [leadId, state]);

  useEffect(() => {
    function abandonOnUnload() {
      const voiceSessionId = sessionIdRef.current;
      if (!voiceSessionId || !["connecting", "active"].includes(stateRef.current)) return;
      const body = new Blob([JSON.stringify({ voiceSessionId, event: "abandoned", reason: "Aba encerrada antes do webhook final." })], { type: "application/json" });
      navigator.sendBeacon(`/api/leads/${leadId}/voice/events`, body);
    }
    window.addEventListener("beforeunload", abandonOnUnload);
    return () => window.removeEventListener("beforeunload", abandonOnUnload);
  }, [leadId]);

  async function startVoiceSession() {
    setError(null);
    setState("authorizing");
    endingRef.current = false;
    try {
      const sessionToStart = state === "completed" || state === "abandoned" || !prepared
        ? await prepareAgentSession()
        : prepared;
      if (!sessionToStart) return;
      await requestMicrophone();
      sessionIdRef.current = sessionToStart.voiceSessionId;
      sendBrowserEvent("connecting", "Visitante autorizou o início da conversa.");
      setState("connecting");
      startSession({
        conversationToken: sessionToStart.conversationToken,
        connectionType: "webrtc",
        dynamicVariables: sessionToStart.dynamicVariables,
        userId: sessionToStart.voiceSessionId,
      });
    } catch (caughtError) {
      const nextError = toVoiceUiError(caughtError);
      setError(nextError);
      setState("failed");
      sendBrowserEvent("failed", nextError.message);
    }
  }

  useEffect(() => {
    if (!autoStart || state !== "idle" || !prepared || autoStartStartedRef.current) return;
    autoStartStartedRef.current = true;
    void startVoiceSession();
  }, [autoStart, prepared, state]);

  function finishVoiceSession() {
    endingRef.current = true;
    setState("ending");
    sendBrowserEvent("finalizing", "Visitante encerrou a conversa explicitamente.");
    endSession();
  }

  function retry() {
    setPrepared(null);
    sessionIdRef.current = null;
    endingRef.current = false;
    autoStartStartedRef.current = false;
    setError(null);
    void prepareAgentSession();
  }

  const canStart = state === "idle" || state === "failed" || state === "abandoned";
  const statusMessage = statusText(state, status);
  const orbState = isSpeaking ? "is-speaking" : isListening ? "is-listening" : state === "connecting" || state === "preparing" ? "is-connecting" : "";
  const showStartButton = canStart && (!autoStart || state === "abandoned");

  if (state === "ending") return <ConversationEndingState />;
  if (state === "completed") return <ConversationCompletedState />;

  return (
    <Card className="voice-session-card record-card">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Conversa por voz</Badge>
        <Badge variant={state === "failed" ? "destructive" : state === "active" ? "default" : "outline"}>{statusLabel(state)}</Badge>
      </div>
      <h2>Converse com o atendimento, {visitorName.split(" ")[0]}.</h2>
      <p className="text-sm text-muted-foreground">Fale naturalmente. Você verá as mensagens do atendimento enquanto a conversa acontece.</p>
      <div className="voice-orb-stage">
        <div className={`voice-orb ${orbState}`} role="img" aria-label={isSpeaking ? "O atendimento está falando" : isListening ? "O atendimento está ouvindo" : "Aguardando a conversa"}>
          <span className="voice-orb-core" />
        </div>
        <span className="form-note">{statusMessage}</span>
      </div>
      <div className="voice-transcript" aria-live="polite" aria-label="Mensagens da conversa">
        {conversationLines.length === 0 && !streamingAgentText && <p className="voice-transcript-empty">As mensagens aparecerão aqui quando a conversa começar.</p>}
        {conversationLines.slice(-8).map((line) => (
          <p className={`voice-transcript-line ${line.role === "agent" ? "is-agent" : "is-user"}`} key={line.id}>
            <strong>{line.role === "agent" ? "Atendimento" : "Você"}</strong>
            <span>{line.text}</span>
          </p>
        ))}
        {streamingAgentText && (
          <p className="voice-transcript-line is-agent is-streaming">
            <strong>Atendimento</strong>
            <span>{streamingAgentText}</span>
          </p>
        )}
      </div>
      {error ? <MicPermissionGuide kind={error.kind} message={error.message} onRetry={retry} /> : (
        <div className="voice-actions">
          {showStartButton && <Button type="button" variant="brand" size="lg" onClick={startVoiceSession}>Iniciar conversa por voz</Button>}
          {state === "active" && <>
            <Button type="button" variant="outline" size="lg" onClick={() => setMuted(!isMuted)}>{isMuted ? "Ativar microfone" : "Silenciar microfone"}</Button>
            <Button type="button" variant="destructive" size="lg" onClick={finishVoiceSession}>Encerrar conversa</Button>
          </>}
          {state === "connecting" && <Button type="button" variant="destructive" size="lg" onClick={finishVoiceSession}>Cancelar conexão</Button>}
          {state === "preparing" && <span className="form-note">Finalizando os preparativos…</span>}
        </div>
      )}
      {state === "active" && <p className="form-note">{mode === "speaking" ? "O atendimento está falando." : "Aguardando sua fala."}</p>}
    </Card>
  );
}

function ConversationEndingState() {
  return (
    <Card className="voice-session-card record-card">
      <div className="preparation-status voice-closing-status is-preparing" role="status" aria-live="polite">
        <div className="preparation-indicator" aria-hidden="true">
          <span className="preparation-spinner" />
        </div>
        <div className="preparation-status-copy">
          <p>Aguarde enquanto encerramos a conversa</p>
        </div>
      </div>
    </Card>
  );
}

function ConversationCompletedState() {
  return (
    <Card className="voice-session-card record-card">
      <div className="preparation-status voice-closing-status is-ready" role="status" aria-live="polite">
        <div className="preparation-indicator" aria-hidden="true">
          <span className="preparation-checkmark is-visible">✓</span>
        </div>
        <div className="preparation-status-copy">
          <p>Obrigado, nosso time entrará em contato com você!</p>
        </div>
      </div>
    </Card>
  );
}

async function requestMicrophone(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new VoiceRequestError(0, "Seu navegador não oferece acesso seguro ao microfone.", "browser");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  stream.getTracks().forEach((track) => track.stop());
}

function isPreparedSession(value: Partial<PreparedVoiceSession>): value is PreparedVoiceSession {
  return typeof value.voiceSessionId === "string" && typeof value.executionId === "string" && typeof value.briefingId === "string" &&
    typeof value.conversationToken === "string" && typeof value.dynamicVariables === "object" && value.dynamicVariables !== null;
}

class VoiceRequestError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
    this.name = "VoiceRequestError";
  }
}

function toVoiceUiError(error: unknown): VoiceUiError {
  if (error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(error.name)) return { kind: "permission", message: "O navegador não liberou o microfone para esta conversa." };
  if (error instanceof DOMException && error.name === "NotFoundError") return { kind: "missing", message: "Nenhum microfone foi encontrado no dispositivo." };
  if (error instanceof VoiceRequestError) {
    if (error.code === "unauthorized" || error.status === 401) return { kind: "credential", message: "Não foi possível validar seu atendimento. Atualize a página e tente novamente." };
    if (error.code === "research_pending" || error.code === "briefing_missing") return { kind: "generic", message: "Ainda estamos preparando seu atendimento. Tente novamente em instantes." };
    if (error.status >= 500 || error.code === "configuration" || error.code === "unavailable") return { kind: "network", message: "Não foi possível iniciar seu atendimento agora. Tente novamente em instantes." };
    return { kind: "generic", message: "Não foi possível iniciar seu atendimento. Tente novamente." };
  }
  return { kind: "network", message: "Não foi possível acessar o microfone ou conectar a conversa. Confira a rede e tente novamente." };
}

function statusLabel(state: VoiceWidgetState): string {
  const labels: Record<VoiceWidgetState, string> = { preparing: "Preparando", idle: "Pronto", authorizing: "Preparando microfone", connecting: "Conectando", active: "Em conversa", ending: "Finalizando", completed: "Concluída", abandoned: "Interrompida", failed: "Não foi possível iniciar" };
  return labels[state];
}

function statusText(state: VoiceWidgetState, sdkStatus: string): string {
  if (state === "preparing") return "Finalizando os preparativos…";
  if (state === "idle") return "Tudo pronto para iniciar.";
  if (state === "authorizing") return "Preparando o microfone…";
  if (state === "connecting") return "Conectando o atendimento…";
  if (state === "active") return `${sdkStatus === "connected" ? "Conexão estabelecida." : "Conversa em andamento."} Fale quando estiver pronto.`;
  if (state === "abandoned") return "A conversa foi interrompida antes de ser concluída.";
  return "A conversa não pôde ser concluída.";
}

function cleanDisplayedVoiceText(text: string): string {
  return text
    .replace(/\bThe user said\b[\s\S]*$/i, "")
    .replace(/\[[^\]\r\n]{1,48}\]\s*/g, "")
    .replace(/^\s*[a-z][\w-]{0,32}\]\s*/i, "")
    .replace(/\[[^\]\r\n]{0,48}$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
