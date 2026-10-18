import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/design-system/components/ui/badge";
import { Button } from "@/design-system/components/ui/button";
import { Card } from "@/design-system/components/ui/card";
import { isLocalDemo } from "@/infrastructure/config/demo";
import { demoLeads } from "@/infrastructure/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AtendimentoPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isLocalDemo()) notFound();
  const { id } = await params;
  const lead = await demoLeads.get(id);
  if (!lead) notFound();
  return (
    <section className="narrow page-space">
      <span className="eyebrow">Cadastro recebido</span>
      <h1>Obrigado, {lead.normalized.fullName.split(" ")[0]}<span>.</span></h1>
      <p className="lede">Registramos seus dados e a empresa {lead.normalized.company}.</p>
      <Card className="record-card">
        <Badge variant="secondary" className="mb-6">Demonstração local</Badge>
        <h2>O ponto de partida está pronto.</h2>
        <p>A pesquisa externa e a conversa por voz ainda não estão disponíveis nesta primeira versão. Seu cadastro já pode ser consultado no painel interno.</p>
        <Button asChild variant="brand" size="lg"><Link href={`/painel/${lead.id}`}>Ver registro no painel <span aria-hidden="true">↗</span></Link></Button>
      </Card>
      <Link className="text-link" href="/">Voltar ao formulário</Link>
    </section>
  );
}
