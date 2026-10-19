"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, type QueryFunctionContext } from "@tanstack/react-query";
import { Badge } from "@/design-system/components/ui/badge";
import { Button } from "@/design-system/components/ui/button";
import { Card } from "@/design-system/components/ui/card";
import type { ResearchStatusView } from "@/modules/research/application/research-dto";
import { VoiceSessionWidget } from "@/components/voice/voice-session-widget";

type ResearchPreparationProps = { leadId: string; executionId: string; initialRunId: string | null; visitorName: string };

export function ResearchPreparation({ initialRunId: _initialRunId, ...props }: ResearchPreparationProps) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}><PreparationContent {...props} /></QueryClientProvider>;
}

function PreparationContent({ leadId, executionId, visitorName }: Omit<ResearchPreparationProps, "initialRunId">) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const statusQuery = useQuery<ResearchStatusView>({
    queryKey: ["lead-research-status", leadId, executionId],
    queryFn: async (_context: QueryFunctionContext) => {
      const response = await fetch(`/api/leads/${leadId}/status?executionId=${encodeURIComponent(executionId)}`, { cache: "no-store" });
      const payload = await response.json() as ResearchStatusView & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível consultar a preparação.");
      return payload;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.researchStatus;
      return status === "ready" || status === "partial" || status === "failed" || status === "cancelled" ? false : 1_500;
    },
  });

  async function retryResearch() {
    setRetrying(true);
    setRetryError(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/research`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Não foi possível iniciar uma nova pesquisa.");
      await statusQuery.refetch();
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "Não foi possível iniciar uma nova pesquisa.");
    } finally {
      setRetrying(false);
    }
  }

  const status = statusQuery.data;
  const failed = status?.researchStatus === "failed" || status?.researchStatus === "cancelled" ||
    (status !== undefined && ["ready", "partial"].includes(status.researchStatus) && !status.isReadyForVoice) || statusQuery.isError;
  const ready = status?.isReadyForVoice === true;
  const displayedStatus: ResearchStatusView["researchStatus"] = failed ? "failed" : status?.researchStatus ?? "queued";
  return (
    <Card className="record-card preparation-card">
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant="secondary">Preparação do atendimento</Badge>
        <Badge variant={failed ? "destructive" : ready ? "default" : "outline"}>
          {statusLabel(displayedStatus)}
        </Badge>
      </div>
      <div aria-live="polite">
        <h2>{failed ? "Não conseguimos preparar seu atendimento." : ready ? "Seu atendimento está pronto." : "Estamos preparando seu atendimento."}</h2>
        <p>{messageFor(status?.researchStatus ?? "queued", statusQuery.isLoading, statusQuery.isError, failed)}</p>
      </div>
      <div className="preparation-meta" aria-label="Detalhes da preparação">
        <span>Execução: <code>{executionId}</code></span>
        {status?.durationMs !== null && status?.durationMs !== undefined && <span>Tempo: {formatDuration(status.durationMs)}</span>}
      </div>
      {failed ? (
        <div className="preparation-action">
          <p className="field-error" role="alert">{retryError ?? status?.error ?? statusQuery.error?.message ?? "Falha sem diagnóstico disponível."}</p>
          <Button type="button" variant="brand" size="lg" onClick={retryResearch} disabled={retrying}>
            {retrying ? "Tentando novamente…" : "Preparar atendimento novamente"}
          </Button>
        </div>
      ) : ready ? (
        <VoiceSessionWidget leadId={leadId} visitorName={visitorName} />
      ) : (
        <p className="form-note">A página atualiza automaticamente enquanto o worker processa o job.</p>
      )}
    </Card>
  );
}

function statusLabel(status: ResearchStatusView["researchStatus"]): string {
  const labels: Record<ResearchStatusView["researchStatus"], string> = { queued: "Preparando", running: "Preparando", ready: "Pronto", partial: "Pronto com contexto limitado", failed: "Indisponível", cancelled: "Cancelado" };
  return labels[status];
}

function messageFor(status: ResearchStatusView["researchStatus"], loading: boolean, error: boolean, failed: boolean): string {
  if (error) return "Não foi possível consultar o estado da preparação.";
  if (failed) return "O briefing desta execução não está disponível. Você pode tentar preparar o atendimento novamente.";
  if (loading) return "Estamos preparando seu atendimento.";
  if (status === "queued") return "Seu atendimento será liberado assim que o contexto estiver pronto.";
  if (status === "running") return "Estamos organizando o contexto para uma conversa mais útil.";
  if (status === "partial") return "O atendimento seguirá com o contexto disponível e esclarecerá o que faltar na conversa.";
  return "";
}

function formatDuration(durationMs: number): string {
  return durationMs < 1_000 ? `${durationMs} ms` : `${(durationMs / 1_000).toFixed(1)} s`;
}
