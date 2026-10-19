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

type VoiceWidgetState = "idle" | "authorizing" | "connecting" | "active" | "ending" | "completed" | "abandoned" | "failed";

type VoiceUiError = { kind: VoiceUiErrorKind; message: string };

export function VoiceSessionWidget({ leadId, visitorName }: { leadId: string; visitorName: string }) {
  return <ConversationProvider><VoiceSessionContent leadId={leadId} visitorName={visitorName} /></ConversationProvider>;
}

function VoiceSessionContent({ leadId, visitorName }: { leadId: string; visitorName: string }) {
  const [state, setState] = useState<VoiceWidgetState>("idle");
  const [error, setError] = useState<VoiceUiError | null>(null);
  const [prepared, setPrepared] = useState<PreparedVoiceSession | null>(null);
  const [lastMessage, setLastMessage] = useState<string | undefined>();
  const stateRef = useRef<VoiceWidgetState>(state);
  const sessionIdRef = useRef<string | null>(null);
  const endingRef = useRef(false);

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

  const { startSession, endSession, isMuted, setMuted, isSpeaking, isListening, mode, status, message } = useConversation({
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onError: handleError,
    onMessage: ({ message: nextMessage }) => setLastMessage(nextMessage),
  });

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    if (state !== "ending") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/leads/${leadId}/voice/status`, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const payload = await response.json() as { status?: string };
        if (payload.status === "completed") setState("completed");
        if (payload.status === "failed") setState("failed");
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
      await requestMicrophone();
      const response = await fetch(`/api/leads/${leadId}/voice/session`, { method: "POST", credentials: "same-origin" });
      const payload = await response.json() as Partial<PreparedVoiceSession> & { error?: string; code?: string };
      if (!response.ok) throw new VoiceRequestError(response.status, payload.error ?? "Não foi possível autorizar a conversa.", payload.code);
      if (!isPreparedSession(payload)) throw new VoiceRequestError(500, "A autorização da conversa veio incompleta.");
      setPrepared(payload);
      sessionIdRef.current = payload.voiceSessionId;
      sendBrowserEvent("connecting", "Visitante autorizou o início da conversa.");
      setState("connecting");
      startSession({
        conversationToken: payload.conversationToken,
        connectionType: "webrtc",
        dynamicVariables: payload.dynamicVariables,
        userId: payload.voiceSessionId,
      });
    } catch (caughtError) {
      const nextError = toVoiceUiError(caughtError);
      setError(nextError);
      setState("failed");
      sendBrowserEvent("failed", nextError.message);
    }
  }

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
    setError(null);
    setState("idle");
  }

  const canStart = state === "idle" || state === "failed" || state === "abandoned" || state === "completed";
  const statusMessage = statusText(state, status, visitorName);

  return (
    <Card className="voice-session-card record-card">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Conversa por voz</Badge>
        <Badge variant={state === "failed" ? "destructive" : state === "active" ? "default" : "outline"}>{statusLabel(state)}</Badge>
      </div>
      <h2>Converse com o atendimento, {visitorName.split(" ")[0]}.</h2>
      <p className="text-sm text-muted-foreground">O briefing da pesquisa é enviado à sessão autorizada. A conversa só começa após sua ação e permissão do microfone.</p>
      <div className="voice-visualizer" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <span className={isSpeaking || isListening ? "voice-wave-bar is-live" : "voice-wave-bar"} key={index} />)}
      </div>
      <div className="voice-status" aria-live="polite">
        <strong>{statusMessage}</strong>
        {lastMessage && <span className="voice-last-message">Última mensagem: {lastMessage}</span>}
        {message && state === "active" && <span className="voice-last-message">{message}</span>}
      </div>
      {error ? <MicPermissionGuide kind={error.kind} message={error.message} leadId={leadId} onRetry={retry} /> : (
        <div className="voice-actions">
          {canStart && <Button type="button" variant="brand" size="lg" onClick={startVoiceSession}>{state === "completed" ? "Iniciar nova conversa" : "Iniciar conversa por voz"}</Button>}
          {state === "active" && <>
            <Button type="button" variant="outline" size="lg" onClick={() => setMuted(!isMuted)}>{isMuted ? "Ativar microfone" : "Silenciar microfone"}</Button>
            <Button type="button" variant="destructive" size="lg" onClick={finishVoiceSession}>Encerrar conversa</Button>
          </>}
          {state === "connecting" && <Button type="button" variant="destructive" size="lg" onClick={finishVoiceSession}>Cancelar conexão</Button>}
          {state === "ending" && <span className="form-note">Encerrando a conexão e aguardando a confirmação segura do provedor.</span>}
        </div>
      )}
      {prepared && <p className="form-note">Execução: <code>{prepared.executionId}</code> · Briefing: <code>{prepared.briefingId}</code></p>}
      <p className="form-note">Modo atual: {mode === "speaking" ? "agente falando" : "aguardando sua fala"}.</p>
    </Card>
  );
}

async function requestMicrophone(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new VoiceRequestError(0, "Seu navegador não oferece acesso seguro ao microfone.", "browser");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    if (error.code === "unauthorized" || error.status === 401) return { kind: "credential", message: error.message };
    if (error.code === "research_pending" || error.code === "briefing_missing") return { kind: "generic", message: error.message };
    if (error.status >= 500 || error.code === "configuration" || error.code === "unavailable") return { kind: "network", message: error.message };
    return { kind: "generic", message: error.message };
  }
  return { kind: "network", message: "Não foi possível acessar o microfone ou conectar a conversa. Confira a rede e tente novamente." };
}

function statusLabel(state: VoiceWidgetState): string {
  const labels: Record<VoiceWidgetState, string> = { idle: "Pronto", authorizing: "Autorizando", connecting: "Conectando", active: "Em conversa", ending: "Finalizando", completed: "Concluída", abandoned: "Abandonada", failed: "Falhou" };
  return labels[state];
}

function statusText(state: VoiceWidgetState, sdkStatus: string, visitorName: string): string {
  if (state === "idle") return "Seu briefing está pronto.";
  if (state === "authorizing") return "Validando sessão e preparando o microfone…";
  if (state === "connecting") return "Conectando o atendimento…";
  if (state === "active") return `${sdkStatus === "connected" ? "Conexão estabelecida." : "Conversa em andamento."} Fale quando estiver pronto.`;
  if (state === "ending") return `Obrigado, ${visitorName.split(" ")[0]}. A conversa está sendo finalizada.`;
  if (state === "completed") return "Conversa finalizada e confirmada pelo provedor.";
  if (state === "abandoned") return "A conversa foi interrompida antes da confirmação do provedor.";
  return "A conversa não pôde ser concluída.";
}
