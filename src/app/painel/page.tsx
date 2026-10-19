import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Badge } from "@/design-system/components/ui/badge";
import { Button } from "@/design-system/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/design-system/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/design-system/components/ui/table";
import { auditRuntime, deploymentAccess } from "@/infrastructure/bootstrap";
import { getIntegrationChecklist, isLocalDemo } from "@/infrastructure/config/demo";
import type { AttendanceOverviewItem, AttendanceStageStatus } from "@/modules/audit/application/audit-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!deploymentAccess.canAccessPanel({ headers: await headers() })) notFound();
  const attendances = await auditRuntime.listAttendanceOverview.execute();
  const integrations = getIntegrationChecklist();

  return (
    <div className="page-space">
      <div className="page-heading">
        <div><span className="eyebrow">Painel interno</span><h1>Atendimentos<span>.</span></h1><p className="lede">Uma visão executiva das execuções, evidências e próximos passos comerciais.</p></div>
        <Badge variant="secondary" className="page-status">{attendances.length} registro{attendances.length !== 1 ? "s" : ""}</Badge>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2"><Badge variant="outline">Modo: {isLocalDemo() ? "desenvolvimento local" : "online"}</Badge><span className="text-xs text-muted-foreground">Acesso interno protegido; cada registro mantém seu rastro por execução.</span></div>
      {attendances.length ? <div className="table-wrap"><Table className="lead-table" aria-label="Atendimentos cadastrados"><TableHeader><TableRow><TableHead>Visitante</TableHead><TableHead>Empresa</TableHead><TableHead>Recebido em</TableHead><TableHead>Pesquisa</TableHead><TableHead>Voz</TableHead><TableHead>SPICED</TableHead><TableHead>Agenda</TableHead><TableHead><span className="sr-only">Ação</span></TableHead></TableRow></TableHeader><TableBody>{attendances.map((attendance) => <TableRow key={`${attendance.leadId}-${attendance.executionId}`}><TableCell><strong>{attendance.fullName}</strong><small>{attendance.email}</small></TableCell><TableCell>{attendance.company}</TableCell><TableCell className="whitespace-nowrap">{formatDate(attendance.submittedAt)}</TableCell><StageCell label="Pesquisa" status={attendance.stages.research} /><StageCell label="Voz" status={attendance.stages.conversation} /><StageCell label="SPICED" status={attendance.stages.spiced} /><StageCell label="Agenda" status={attendance.stages.meeting} /><TableCell><Link className="text-link" href={`/painel/${attendance.leadId}?executionId=${encodeURIComponent(attendance.executionId)}`}>Abrir <span aria-hidden="true">↗</span></Link></TableCell></TableRow>)}</TableBody></Table></div> : <Card className="record-card empty"><CardHeader className="p-0 pb-4"><CardTitle>O primeiro registro começa no formulário.</CardTitle><CardDescription>Nenhum visitante foi cadastrado nesta base.</CardDescription></CardHeader><CardContent className="p-0"><p>Cadastre um visitante de teste para conferir o briefing, a conversa e o rastro por execução.</p><Button asChild variant="brand" size="lg"><Link href="/">Criar primeiro cadastro <span aria-hidden="true">↗</span></Link></Button></CardContent></Card>}
      <CalendarOverview attendances={attendances} />
      <section className="next-steps" aria-labelledby="integration-status-title"><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><span className="eyebrow">Ambiente</span><h2 id="integration-status-title" className="mb-0">Checklist de integrações</h2></div><span className="text-xs text-muted-foreground">Status informado pelo servidor, sem expor credenciais</span></div><div className="mini-grid">{integrations.map((item) => <Card className="record-card" key={item.name}><CardHeader className="p-0 pb-3"><CardTitle className="text-sm">{item.name}</CardTitle><CardDescription>{item.detail}</CardDescription></CardHeader><CardContent className="p-0"><Badge variant={integrationVariant(item.status)}>{item.statusLabel}</Badge><p className="mt-3 mb-0 text-xs text-muted-foreground">{item.nextStep}</p></CardContent></Card>)}</div></section>
    </div>
  );
}

function CalendarOverview({ attendances }: { attendances: AttendanceOverviewItem[] }) {
  const scheduledAttendances = attendances.filter((attendance) => attendance.meeting.status !== "not_requested");
  return (
    <section className="next-steps" aria-labelledby="calendar-overview-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><span className="eyebrow">Agenda</span><h2 id="calendar-overview-title" className="mb-0">Horários por execução</h2></div><span className="text-xs text-muted-foreground">Último estado persistido de cada atendimento</span></div>
      {scheduledAttendances.length ? <div className="table-wrap"><Table aria-label="Horários da agenda por atendimento"><TableHeader><TableRow><TableHead>Visitante</TableHead><TableHead>Estado</TableHead><TableHead>Horário</TableHead><TableHead>Janela consultada</TableHead><TableHead><span className="sr-only">Ação</span></TableHead></TableRow></TableHeader><TableBody>{scheduledAttendances.map((attendance) => <TableRow key={`calendar-${attendance.leadId}-${attendance.executionId}`}><TableCell><strong>{attendance.fullName}</strong><small>{attendance.company}</small></TableCell><TableCell><Badge variant={meetingVariant(attendance.meeting.status)}>{meetingLabel(attendance.meeting.status)}</Badge></TableCell><TableCell className="whitespace-nowrap text-xs">{attendance.meeting.start ? formatSlot(attendance.meeting.start, attendance.meeting.end) : "Sem horário confirmado"}</TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatAvailabilityWindow(attendance.meeting.availabilityFrom, attendance.meeting.availabilityUntil)}</TableCell><TableCell><Link className="text-link" href={`/painel/${attendance.leadId}?executionId=${encodeURIComponent(attendance.executionId)}`}>Detalhes <span aria-hidden="true">↗</span></Link></TableCell></TableRow>)}</TableBody></Table></div> : <Card className="record-card"><CardContent className="p-0"><p className="m-0 text-sm text-muted-foreground">Nenhuma consulta de agenda foi registrada nas execuções atuais.</p></CardContent></Card>}
    </section>
  );
}

function meetingLabel(status: AttendanceOverviewItem["meeting"]["status"]): string {
  return { not_requested: "Não solicitada", offered: "Horários oferecidos", pending: "Pendente", confirmed: "Confirmada", conflict: "Conflito (409)", uncertain: "Incerta", failed: "Falha", cancelled: "Cancelada" }[status];
}

function meetingVariant(status: AttendanceOverviewItem["meeting"]["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "confirmed") return "default";
  if (["failed", "cancelled"].includes(status)) return "destructive";
  if (["conflict", "uncertain", "pending", "offered"].includes(status)) return "secondary";
  return "outline";
}

function formatSlot(start: string, end: string | null): string {
  const startDate = new Date(start);
  const date = startDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });
  const startTime = startDate.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const endTime = end ? new Date(end).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : null;
  return `${date} · ${startTime}${endTime ? `–${endTime}` : ""}`;
}

function formatAvailabilityWindow(from: string | null, until: string | null): string {
  if (!from || !until) return "Não informada";
  return `${formatDate(from)} – ${formatDate(until)}`;
}

function StageCell({ label, status }: { label: string; status: AttendanceStageStatus }) {
  return <TableCell><Badge aria-label={`${label}: ${stageLabel(status)}`} variant={stageVariant(status)}>{stageLabel(status)}</Badge></TableCell>;
}

function stageLabel(status: AttendanceStageStatus): string {
  const labels: Record<AttendanceStageStatus, string> = { completed: "Concluído", in_progress: "Em andamento", pending: "Pendente", failed: "Falha", conflict: "Conflito" };
  return labels[status];
}

function stageVariant(status: AttendanceStageStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "in_progress" || status === "conflict") return "secondary";
  return "outline";
}

function integrationVariant(status: "local_demo" | "configured" | "pending"): "default" | "secondary" | "destructive" {
  if (status === "configured") return "default";
  if (status === "pending") return "destructive";
  return "secondary";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
