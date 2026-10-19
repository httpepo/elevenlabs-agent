import { Badge } from "@/design-system/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/design-system/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/design-system/components/ui/table";
import type { LeadAuditView } from "@/modules/audit/application/audit-dto";

export function LeadMeetingCard({ meeting }: { meeting: LeadAuditView["meeting"] }) {
  const latest = meeting.latest;
  return (
    <Card className="record-card">
      <CardHeader className="p-0 pb-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Agenda da execução</CardTitle><CardDescription>Horários consultados, ofertas e tentativas de reserva vinculados a esta execução.</CardDescription></div><Badge variant={statusVariant(meeting.status)}>{meetingLabel(meeting.status)}</Badge></div></CardHeader>
      <CardContent className="grid gap-5 p-0">
        {meeting.attempts.length ? <AgendaAttempts attempts={meeting.attempts} /> : <p className="m-0 text-sm text-muted-foreground">Nenhuma consulta ou tentativa de reserva foi registrada.</p>}
        {latest ? <LatestMeetingAttempt attempt={latest} /> : null}
      </CardContent>
    </Card>
  );
}

function AgendaAttempts({ attempts }: { attempts: LeadAuditView["meeting"]["attempts"] }) {
  const window = findAvailabilityWindow(attempts);
  return (
    <section aria-labelledby="agenda-attempts-title" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h3 id="agenda-attempts-title" className="m-0">Horários e tentativas</h3><p className="mt-1 mb-0 text-sm text-muted-foreground">A agenda mantém cada oferta e resultado; uma oferta não significa reunião confirmada.</p></div>
        <Badge variant="outline">{attempts.length} registro{attempts.length === 1 ? "" : "s"}</Badge>
      </div>
      {window ? <p className="m-0 rounded-lg border bg-background p-4 text-sm"><span className="font-medium">Janela consultada:</span> {formatDate(window.from)} – {formatDate(window.until)}</p> : null}
      <div className="table-wrap">
        <Table aria-label="Histórico de horários e tentativas da agenda">
          <TableHeader><TableRow><TableHead>Horário</TableHead><TableHead>Estado</TableHead><TableHead>Registrado em</TableHead><TableHead>Detalhe</TableHead></TableRow></TableHeader>
          <TableBody>{attempts.map((attempt) => <TableRow key={attempt.id}><TableCell className="whitespace-nowrap text-xs">{attempt.start ? formatSlot(attempt.start, attempt.end) : "Sem horário"}</TableCell><TableCell><Badge variant={statusVariant(attempt.status)}>{meetingLabel(attempt.status)}</Badge></TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(attempt.createdAt)}</TableCell><TableCell className="min-w-64 text-xs text-muted-foreground">{attempt.reason}{attempt.httpStatus ? ` · HTTP ${attempt.httpStatus}` : ""}</TableCell></TableRow>)}</TableBody>
        </Table>
      </div>
    </section>
  );
}

function LatestMeetingAttempt({ attempt }: { attempt: NonNullable<LeadAuditView["meeting"]["latest"]> }) {
  return <div className="rounded-lg border bg-background p-5"><h3 className="mt-0 text-sm">Último resultado</h3><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Motivo</dt><dd className="m-0 text-sm">{attempt.reason}</dd></div><div><dt className="text-xs text-muted-foreground">Horário</dt><dd className="m-0 text-sm">{attempt.start ? `${formatDate(attempt.start)} – ${attempt.end ? formatDate(attempt.end) : "fim não informado"}` : "Não reservado"}</dd></div><div><dt className="text-xs text-muted-foreground">HTTP</dt><dd className="m-0 text-sm">{attempt.httpStatus ?? "Não informado"}</dd></div><div><dt className="text-xs text-muted-foreground">Contato</dt><dd className="m-0 break-words text-sm">{attempt.bookingPayload.nome ? `${attempt.bookingPayload.nome} · ${attempt.bookingPayload.email ?? "e-mail não informado"}` : "Não enviado"}</dd></div></dl><MeetingNotice attempt={attempt} /></div>;
}

function MeetingNotice({ attempt }: { attempt: NonNullable<LeadAuditView["meeting"]["latest"]> }) {
  if (attempt.transportDiagnostic) return <p className="notice mt-5 mb-0">Diagnóstico técnico: {attempt.transportDiagnostic}</p>;
  if (attempt.status === "conflict") return <p className="notice mt-5 mb-0">O horário estava ocupado no momento da reserva. A reunião não foi confirmada; novas opções devem ser consultadas.</p>;
  if (attempt.status === "uncertain") return <p className="notice mt-5 mb-0">A resposta da agenda não pôde ser confirmada. Verificação manual obrigatória; o sistema não repetirá o POST cegamente.</p>;
  if (attempt.status === "failed") return <p className="notice mt-5 mb-0">A agenda falhou ao processar a tentativa. Nenhuma reunião foi confirmada.</p>;
  return null;
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

function formatSlot(start: string, end: string | null): string {
  const startDate = new Date(start);
  const date = startDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });
  const startTime = startDate.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const endTime = end ? new Date(end).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : null;
  return `${date} · ${startTime}${endTime ? `–${endTime}` : ""}`;
}

function findAvailabilityWindow(attempts: LeadAuditView["meeting"]["attempts"]): { from: string; until: string } | null {
  const attempt = [...attempts].reverse().find((item) => item.availabilityFrom && item.availabilityUntil);
  if (!attempt?.availabilityFrom || !attempt.availabilityUntil) return null;
  return { from: attempt.availabilityFrom, until: attempt.availabilityUntil };
}
