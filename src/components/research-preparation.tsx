"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, type QueryFunctionContext } from "@tanstack/react-query";
import { Badge } from "@/design-system/components/ui/badge";
import { Button } from "@/design-system/components/ui/button";
import { Card } from "@/design-system/components/ui/card";
import type { ResearchStatusView } from "@/modules/research/application/research-dto";

type ResearchPreparationProps = { leadId: string; executionId: string; initialRunId: string | null; onStartConversation: () => void };

export function ResearchPreparation({ initialRunId: _initialRunId, ...props }: ResearchPreparationProps) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}><PreparationContent {...props} /></QueryClientProvider>;
}

function PreparationContent({ leadId, executionId, onStartConversation }: Omit<ResearchPreparationProps, "initialRunId">) {
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
      if (!response.ok) throw new Error("Não foi possível tentar novamente.");
      await statusQuery.refetch();
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "Não foi possível tentar novamente.");
    } finally {
      setRetrying(false);
    }
  }

  const status = statusQuery.data;
  const failed = status?.researchStatus === "failed" || status?.researchStatus === "cancelled" ||
    (status !== undefined && ["ready", "partial"].includes(status.researchStatus) && !status.isReadyForVoice) || statusQuery.isError;
  const ready = status?.isReadyForVoice === true;
  const isPreparing = !failed && !ready;
  const displayedStatus: ResearchStatusView["researchStatus"] = failed ? "failed" : status?.researchStatus ?? "queued";
  const preparationMessage = messageFor(status?.researchStatus ?? "queued", statusQuery.isLoading, statusQuery.isError, failed);
  return (
    <Card className="record-card preparation-card" aria-busy={isPreparing}>
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant="secondary">Seu atendimento</Badge>
        <Badge variant={failed ? "destructive" : ready ? "default" : "outline"}>
          {isPreparing && <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-current" aria-hidden="true" />}
          {statusLabel(displayedStatus)}
        </Badge>
      </div>
      <div aria-live="polite">
        {failed ? (
          <PreparationStatus state="failed" message={preparationMessage} />
        ) : (
          <PreparationStatus state={ready ? "ready" : "preparing"} message={preparationMessage} />
        )}
      </div>
      {failed ? (
        <div className="preparation-action">
          {retryError && <p className="field-error" role="alert">{retryError}</p>}
          <Button type="button" variant="brand" size="lg" onClick={retryResearch} disabled={retrying}>
            {retrying ? "Tentando novamente…" : "Tentar novamente"}
          </Button>
        </div>
      ) : ready ? (
        <div className="preparation-action">
          <Button type="button" variant="brand" size="lg" onClick={onStartConversation}>Iniciar conversa por voz</Button>
        </div>
      ) : (
        <p className="form-note">Aguarde mais um instante. Avisaremos quando estiver tudo pronto.</p>
      )}
    </Card>
  );
}

function PreparationStatus({ state, message }: { state: "preparing" | "ready" | "failed"; message: string }) {
  const ready = state === "ready";
  const failed = state === "failed";
  return (
    <div className={`preparation-status ${ready ? "is-ready" : failed ? "is-failed" : "is-preparing"}`} role="status">
      <div className="preparation-indicator" aria-hidden="true">
        {failed ? (
          <span className="preparation-failure-mark">×</span>
        ) : (
          <>
            <span className={`preparation-spinner ${ready ? "is-fading" : ""}`} />
            <span className={`preparation-checkmark ${ready ? "is-visible" : ""}`}>✓</span>
          </>
        )}
      </div>
      <div className="preparation-status-copy">
        <h2>{ready ? "Tudo pronto!" : failed ? "Não foi possível preparar seu atendimento." : "Aguarde enquanto preparamos seu atendimento."}</h2>
        <p>{ready ? "Sua conversa está pronta para começar." : message}</p>
      </div>
    </div>
  );
}

function statusLabel(status: ResearchStatusView["researchStatus"]): string {
  const labels: Record<ResearchStatusView["researchStatus"], string> = { queued: "Preparando", running: "Preparando", ready: "Pronto", partial: "Pronto", failed: "Indisponível", cancelled: "Indisponível" };
  return labels[status];
}

function messageFor(status: ResearchStatusView["researchStatus"], loading: boolean, error: boolean, failed: boolean): string {
  if (error) return "Não foi possível atualizar o atendimento agora.";
  if (failed) return "Não foi possível preparar seu atendimento agora. Tente novamente em instantes.";
  if (loading) return "Aguarde enquanto preparamos seu atendimento.";
  if (status === "queued") return "Estamos cuidando dos últimos preparativos.";
  if (status === "running") return "Estamos organizando tudo para você.";
  if (status === "partial") return "Estamos finalizando os preparativos para a conversa.";
  return "Seu atendimento está pronto para começar.";
}
