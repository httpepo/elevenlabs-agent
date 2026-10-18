import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/design-system/components/ui/badge";
import { Card } from "@/design-system/components/ui/card";
import { isLocalDemo } from "@/infrastructure/config/demo";
import { spicedLabels } from "@/modules/leads/application/lead-dto";
import { demoLeads } from "@/infrastructure/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isLocalDemo()) notFound();
  const { id } = await params;
  const lead = await demoLeads.get(id);
  if (!lead) notFound();
  const labels = { fullName: "Nome", email: "E-mail", phone: "Telefone", company: "Empresa", website: "Site" };
  return (
    <div className="page-space">
      <Link className="text-link" href="/painel">← Todos os atendimentos</Link>
      <div className="page-heading"><div><span className="eyebrow">Registro do visitante</span><h1>{lead.normalized.fullName}<span>.</span></h1><p className="lede">{lead.normalized.company}</p></div><Badge variant="secondary" className="page-status">Demonstração</Badge></div>
      <div className="detail-grid">
        <Card className="record-card"><h2>Formulário original</h2><dl>{(Object.keys(labels) as (keyof typeof labels)[]).map((key) => <div key={key}><dt>{labels[key]}</dt><dd>{lead.original[key] || "Não informado"}</dd></div>)}</dl></Card>
        <Card className="record-card"><span className="eyebrow">Fonte: formulário</span><h2>Briefing inicial</h2><p>{lead.briefing.summary}</p><h3>Lacunas</h3><ul>{lead.briefing.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul><p className="notice">Pesquisa externa pendente. Nenhuma fonte pública foi consultada.</p></Card>
      </div>
      <Card className="record-card"><h2>Qualificação SPICED</h2><div className="spiced-grid">{(Object.entries(spicedLabels) as [keyof typeof spicedLabels, string][]).map(([key, label]) => <div key={key}><h3>{label}</h3><p>{lead.spiced[key].value ?? "Ainda não informado"}</p></div>)}</div></Card>
      <div className="detail-grid"><Card className="record-card"><h2>Conversa</h2><p>Conversa ainda não iniciada. Transcrição e resumo estarão aqui após a integração de voz.</p></Card><Card className="record-card"><h2>Agenda</h2><p>Nenhuma reunião foi marcada.</p></Card></div>
      <Card className="record-card"><h2>Rastro de execução</h2><p className="muted">Ações observáveis desta execução. O preparo inicial não executou pesquisa externa.</p>{lead.trace.map((event) => <div className="trace" key={event.id}><div><code>{event.tool}</code><Badge variant="outline">{event.mode}</Badge></div><p>{event.result}</p><small>{new Date(event.timestamp).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</small></div>)}</Card>
    </div>
  );
}
