import { Badge } from "@/design-system/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/design-system/components/ui/card";
import type { LeadAuditView } from "@/modules/audit/application/audit-dto";

export function LeadMeetingCard({ meeting }: { meeting: LeadAuditView["meeting"] }) {
  const latest = meeting.latest;
  return (
    <Card className="record-card">
      <CardHeader className="p-0 pb-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Resultado da agenda</CardTitle><CardDescription>Estado real da consulta e da tentativa de reserva nesta execução.</CardDescription></div><Badge variant={statusVariant(meeting.status)}>{meetingLabel(meeting.status)}</Badge></div></CardHeader>
      <CardContent className="grid gap-5 p-0">
        {latest ? <div className="rounded-lg border bg-background p-5"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Motivo</dt><dd className="m-0 text-sm">{latest.reason}</dd></div><div><dt className="text-xs text-muted-foreground">Horário</dt><dd className="m-0 text-sm">{latest.start ? `${formatDate(latest.start)} – ${latest.end ? formatDate(latest.end) : "fim não informado"}` : "Não reservado"}</dd></div><div><dt className="text-xs text-muted-foreground">HTTP</dt><dd className="m-0 text-sm">{latest.httpStatus ?? "Não informado"}</dd></div><div><dt className="text-xs text-muted-foreground">Contato</dt><dd className="m-0 break-words text-sm">{latest.bookingPayload.nome ? `${latest.bookingPayload.nome} · ${latest.bookingPayload.email ?? "e-mail não informado"}` : "Não enviado"}</dd></div></dl>{latest.transportDiagnostic ? <p className="notice mt-5 mb-0">Diagnóstico técnico: {latest.transportDiagnostic}</p> : null}{latest.status === "conflict" ? <p className="notice mt-5 mb-0">O horário estava ocupado no momento da reserva. A reunião não foi confirmada; novas opções devem ser consultadas.</p> : null}{latest.status === "uncertain" ? <p className="notice mt-5 mb-0">A resposta da agenda não pôde ser confirmada. Verificação manual obrigatória; o sistema não repetirá o POST cegamente.</p> : null}{latest.status === "failed" ? <p className="notice mt-5 mb-0">A agenda falhou ao processar a tentativa. Nenhuma reunião foi confirmada.</p> : null}</div> : <p className="m-0 text-sm text-muted-foreground">Nenhuma consulta ou tentativa de reserva foi registrada.</p>}
        {meeting.attempts.length > 1 ? <details><summary className="cursor-pointer text-sm text-primary underline underline-offset-4">Ver {meeting.attempts.length} tentativas desta execução</summary><ol className="mt-4 grid gap-3 pl-5 text-sm">{meeting.attempts.map((attempt) => <li key={attempt.id}><strong>{meetingLabel(attempt.status)}</strong><span className="ml-2 text-muted-foreground">{attempt.reason}</span></li>)}</ol></details> : null}
      </CardContent>
    </Card>
  );
}

function meetingLabel(status: string): string {
  const labels: Record<string, string> = { not_requested: "Não solicitada", offered: "Horários oferecidos", pending: "Pendente", confirmed: "Confirmada", conflict: "Conflito (409)", uncertain: "Incerta", failed: "Falha", cancelled: "Cancelada" };
  return labels[status] ?? status;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "confirmed") return "default";
  if (["failed", "cancelled"].includes(status)) return "destructive";
  if (["conflict", "uncertain", "pending", "offered"].includes(status)) return "secondary";
  return "outline";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
