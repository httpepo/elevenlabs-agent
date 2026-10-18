import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/design-system/components/ui/badge";
import { Button } from "@/design-system/components/ui/button";
import { Card } from "@/design-system/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/design-system/components/ui/table";
import { integrationChecklist, isLocalDemo } from "@/infrastructure/config/demo";
import { demoLeads } from "@/infrastructure/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!isLocalDemo()) notFound();
  const leads = await demoLeads.list();
  return (
    <div className="page-space">
      <div className="page-heading">
        <div><span className="eyebrow">Painel interno</span><h1>Atendimentos<span>.</span></h1></div>
        <Badge variant="secondary" className="page-status">{leads.length} registro{leads.length !== 1 ? "s" : ""}</Badge>
      </div>
      <p className="notice">Base local de desenvolvimento. A pesquisa e a voz ainda não foram conectadas.</p>
      {leads.length ? (
        <div className="table-wrap">
          <Table className="lead-table" aria-label="Atendimentos cadastrados">
            <TableHeader><TableRow>
              <TableHead>Visitante</TableHead><TableHead>Empresa</TableHead><TableHead>Recebido em</TableHead><TableHead>Estado</TableHead><TableHead><span className="sr-only">Ação</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>{leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell><strong>{lead.normalized.fullName}</strong><small>{lead.normalized.email}</small></TableCell>
                <TableCell>{lead.normalized.company}</TableCell>
                <TableCell>{new Date(lead.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</TableCell>
                <TableCell><Badge variant="secondary">Cadastro recebido</Badge></TableCell>
                <TableCell><Link className="text-link" href={`/painel/${lead.id}`}>Abrir ↗</Link></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      ) : (
        <Card className="record-card empty">
          <h2>O primeiro registro começa no formulário.</h2>
          <p>Cadastre um visitante de teste para conferir os dados, o briefing inicial e o rastro.</p>
          <Button asChild variant="brand" size="lg"><Link href="/">Criar primeiro cadastro <span aria-hidden="true">↗</span></Link></Button>
        </Card>
      )}
      <section className="next-steps">
        <h2>Próximas integrações</h2>
        <div className="mini-grid">{integrationChecklist.map((item) => <Card className="record-card" key={item.name}><h3>{item.name}</h3><p>{item.nextStep}</p></Card>)}</div>
      </section>
    </div>
  );
}
