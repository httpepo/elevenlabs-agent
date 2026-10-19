import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Badge } from "@/design-system/components/ui/badge";
import { Button } from "@/design-system/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/design-system/components/ui/card";
import { Input } from "@/design-system/components/ui/input";
import { Label } from "@/design-system/components/ui/label";
import { auditRuntime, deploymentAccess } from "@/infrastructure/bootstrap";
import { LeadBriefingSourcesCard } from "@/components/lead-briefing-sources-card";
import { LeadIdentityCard } from "@/components/lead-identity-card";
import { LeadMeetingCard } from "@/components/lead-meeting-card";
import { LeadSpicedCard } from "@/components/lead-spiced-card";
import { LeadTranscriptCard } from "@/components/lead-transcript-card";
import { ToolTraceCard } from "@/components/tool-trace-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ executionId?: string | string[] }>;
};

export default async function LeadDetailPage({ params, searchParams }: DetailPageProps) {
  if (!deploymentAccess.canAccessPanel({ headers: await headers() })) notFound();
  const { id } = await params;
  const query = await searchParams;
  const requestedExecutionId = Array.isArray(query.executionId) ? query.executionId[0] : query.executionId;
  const audit = await auditRuntime.getLeadAuditSummary.execute({ leadId: id, executionId: requestedExecutionId });
  if (!audit) notFound();

  return (
    <div className="page-space">
      <Link className="text-link" href="/painel">← Todos os atendimentos</Link>
      <div className="page-heading"><div><span className="eyebrow">Registro do visitante</span><h1>{audit.lead.normalized.fullName}<span>.</span></h1><p className="lede">{audit.lead.normalized.company}</p></div><Badge variant="secondary" className="page-status">{audit.execution.isLatest ? "Execução mais recente" : "Execução selecionada"}</Badge></div>
      <Card className="record-card"><CardHeader className="p-0 pb-5"><CardTitle>Execução auditada</CardTitle><CardDescription>O painel não combina tentativas. Briefing, conversa, SPICED, ferramentas e agenda pertencem ao identificador selecionado.</CardDescription></CardHeader><CardContent className="grid gap-5 p-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-end"><div><Label htmlFor="execution-id">Selecionar executionId</Label><Input id="execution-id" name="executionId" form="execution-selector" defaultValue={audit.execution.id} list="execution-options" className="mt-2 font-mono text-xs" /></div><form id="execution-selector" method="get" className="flex flex-wrap items-end gap-3"><datalist id="execution-options">{audit.execution.available.map((execution) => <option value={execution.id} key={execution.id}>{formatDate(execution.createdAt)}</option>)}</datalist><Button type="submit" variant="outline">Abrir execução</Button><span className="break-all text-xs text-muted-foreground">{audit.execution.id}</span></form></CardContent></Card>
      <div className="grid gap-6"><LeadIdentityCard identity={audit.identity} /><LeadBriefingSourcesCard research={audit.research} /><LeadSpicedCard spiced={audit.spiced} /><LeadTranscriptCard conversation={audit.conversation} /><ToolTraceCard tools={audit.tools} /><LeadMeetingCard meeting={audit.meeting} /></div>
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
