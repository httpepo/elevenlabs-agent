import { Badge } from "@/design-system/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/design-system/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/design-system/components/ui/table";
import type { LeadAuditView } from "@/modules/audit/application/audit-dto";

export function LeadBriefingSourcesCard({ research }: { research: LeadAuditView["research"] }) {
  const briefing = research.briefing;
  return (
    <Card className="record-card">
      <CardHeader className="p-0 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Briefing e fontes verificáveis</CardTitle>
            <CardDescription>Snapshot usado para preparar a conversa, separado por nível de evidência.</CardDescription>
          </div>
          <Badge variant={research.status === "failed" ? "destructive" : research.status === "partial" ? "secondary" : "outline"}>
            Pesquisa: {research.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-7 p-0">
        <section aria-labelledby="briefing-summary-title">
          <h3 id="briefing-summary-title" className="mt-0">Resumo executivo</h3>
          <p className="mb-0 text-sm text-muted-foreground">{briefing?.summary ?? "O briefing desta execução ainda não está disponível."}</p>
        </section>
        <div className="grid gap-6 md:grid-cols-3">
          <EvidenceList title="Fatos verificados" items={briefing?.facts.map((fact) => `${fact.field}: ${fact.value}`) ?? []} empty="Nenhum fato verificado." />
          <EvidenceList title="Hipóteses" items={briefing?.hypotheses.map((hypothesis) => `${hypothesis.field}: ${hypothesis.value} (${hypothesis.confidence})`) ?? []} empty="Nenhuma hipótese registrada." />
          <EvidenceList title="Lacunas" items={briefing?.gaps.map((gap) => gap.prompt) ?? []} empty="Nenhuma lacuna registrada." />
        </div>
        <section aria-labelledby="research-sources-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 id="research-sources-title" className="m-0">Fontes consultadas</h3>
            <Badge variant="outline">{research.sources.length} fonte(s)</Badge>
          </div>
          {research.sources.length ? (
            <Table aria-label="Fontes públicas da pesquisa">
              <TableHeader><TableRow><TableHead>Fonte</TableHead><TableHead>Tipo</TableHead><TableHead>Trecho</TableHead><TableHead>Consultada em</TableHead></TableRow></TableHeader>
              <TableBody>{research.sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="min-w-52"><a className="text-link font-medium" href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}<span aria-hidden="true"> ↗</span></a><small className="mt-1 block break-all text-xs text-muted-foreground">{source.url}</small></TableCell>
                  <TableCell><Badge variant="outline">{source.sourceType === "search_result" ? "Resultado de busca" : source.sourceType}</Badge></TableCell>
                  <TableCell className="min-w-64 text-xs text-muted-foreground">{source.excerpt || "Sem trecho extraído."}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(source.consultedAt)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          ) : (
            <p className="mb-0 text-sm text-muted-foreground">Nenhuma fonte pública foi registrada nesta execução.</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function EvidenceList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="rounded-lg border bg-background p-4" aria-label={title}>
      <h3 className="mt-0 text-sm">{title}</h3>
      {items.length ? <ul className="m-0 grid list-disc gap-2 pl-5 text-sm text-muted-foreground">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="m-0 text-xs text-muted-foreground">{empty}</p>}
    </section>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
