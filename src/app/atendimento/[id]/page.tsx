import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Badge } from "@/design-system/components/ui/badge";
import { Button } from "@/design-system/components/ui/button";
import { Card } from "@/design-system/components/ui/card";
import { isLocalDemo } from "@/infrastructure/config/demo";
import { demoLeads, deploymentAccess } from "@/infrastructure/bootstrap";
import { ResearchPreparation } from "@/components/research-preparation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AtendimentoPage({ params }: { params: Promise<{ id: string }> }) {
  if (!deploymentAccess.isEnabled()) notFound();
  const { id } = await params;
  if (!await deploymentAccess.canAccessLead({ headers: await headers() }, id)) notFound();
  const lead = await demoLeads.get(id);
  if (!lead) notFound();
  return (
    <section className="narrow page-space">
      <span className="eyebrow">Cadastro recebido</span>
      <h1>Obrigado, {lead.normalized.fullName.split(" ")[0]}<span>.</span></h1>
      <p className="lede">Registramos seus dados e a empresa {lead.normalized.company}.</p>
      <ResearchPreparation leadId={lead.id} executionId={lead.executionId} initialRunId={lead.research.runId} visitorName={lead.normalized.fullName} />
      <Card className="record-card">
        <div className="mb-6 flex flex-wrap gap-2"><Badge variant="secondary">{isLocalDemo() ? "Desenvolvimento local" : "Atendimento online"}</Badge><Badge variant="outline">Dados originais preservados</Badge></div>
        <h2>Seu cadastro está rastreável.</h2>
        <p>O painel interno mantém o formulário, a execução, as fontes e o briefing de cada tentativa.</p>
        <Button asChild variant="outline" size="lg"><Link href={`/painel/${lead.id}`}>Ver registro no painel <span aria-hidden="true">↗</span></Link></Button>
      </Card>
      <Link className="text-link" href="/">Voltar ao formulário</Link>
    </section>
  );
}
