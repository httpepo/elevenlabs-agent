import { Badge } from "@/design-system/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/design-system/components/ui/card";
import type { LeadAuditView } from "@/modules/audit/application/audit-dto";

export function LeadTranscriptCard({ conversation }: { conversation: LeadAuditView["conversation"] }) {
  return (
    <Card className="record-card">
      <CardHeader className="p-0 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle>Conversa por voz</CardTitle><CardDescription>Transcrição completa, resumo executivo e estado da sessão.</CardDescription></div>
          <Badge variant={conversation.status === "failed" ? "destructive" : conversation.status === "completed" ? "default" : "outline"}>{conversation.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 p-0">
        {conversation.processingMessage ? <div role={conversation.processingDelayed || conversation.processingStatus === "failed" ? "alert" : "status"} className="rounded-lg border bg-background p-4 text-sm text-foreground">{conversation.processingMessage}{conversation.processingError ? <p className="mb-0 text-muted-foreground">{conversation.processingError}</p> : null}</div> : null}
        {conversation.failureReason ? <p role="alert" className="notice m-0">{conversation.failureReason}</p> : null}
        <section aria-labelledby="conversation-summary-title" className="rounded-lg border bg-background p-5">
          <h3 id="conversation-summary-title" className="mt-0">Resumo executivo</h3>
          <p className="mb-0 whitespace-pre-wrap text-sm text-muted-foreground">{conversation.summary ?? "O resumo pós-chamada ainda não está disponível."}</p>
          <dl className="mt-5 grid gap-3 border-t pt-4 text-xs sm:grid-cols-3"><div><dt className="text-muted-foreground">Duração</dt><dd className="m-0">{conversation.durationMs === null ? "Não disponível" : formatDuration(conversation.durationMs)}</dd></div><div><dt className="text-muted-foreground">Encerramento</dt><dd className="m-0">{conversation.terminationReason ?? "Em andamento"}</dd></div><div><dt className="text-muted-foreground">Sessão</dt><dd className="m-0 break-all">{conversation.sessionId ?? "Não iniciada"}</dd></div></dl>
        </section>
        <section aria-labelledby="transcript-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 id="transcript-title" className="m-0">Transcrição integral</h3><Badge variant="outline">{conversation.transcript.length} turno(s)</Badge></div>
          {conversation.transcript.length ? <ol className="m-0 grid list-none gap-4 p-0">{conversation.transcript.map((segment) => <li id={`transcript-${segment.id}`} key={segment.id} className={`scroll-mt-6 rounded-lg border p-4 ${segment.role === "agent" ? "border-primary/30 bg-primary/5" : "bg-background"}`}><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><Badge variant={segment.role === "agent" ? "default" : "outline"}>{speakerLabel(segment.role)}</Badge><time className="text-xs text-muted-foreground" dateTime={String(segment.startMs)}>{formatDuration(segment.startMs)}</time></div><p className="m-0 whitespace-pre-wrap text-sm">{segment.text}</p></li>)}</ol> : <p className="m-0 text-sm text-muted-foreground">A transcrição ainda não foi recebida ou não possui segmentos utilizáveis.</p>}
        </section>
      </CardContent>
    </Card>
  );
}

function speakerLabel(role: string): string {
  if (role === "agent") return "Agente Atlas";
  if (role === "user") return "Visitante";
  return "Interlocutor não identificado";
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1_000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}
