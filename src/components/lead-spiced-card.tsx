import { Badge } from "@/design-system/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/design-system/components/ui/card";
import type { LeadAuditView } from "@/modules/audit/application/audit-dto";

export function LeadSpicedCard({ spiced }: { spiced: LeadAuditView["spiced"] }) {
  return (
    <Card className="record-card">
      <CardHeader className="p-0 pb-6">
        <CardTitle>Qualificação comercial · SPICED</CardTitle>
        <CardDescription>As cinco dimensões mostram o que foi dito, o que falta confirmar e a evidência usada.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 p-0">
        {spiced ? (
          <>
            <div className="flex flex-wrap gap-2"><Badge variant="outline">Qualificação: {spiced.qualificationStatus}</Badge><Badge variant="outline">Interesse: {spiced.interestStatus}</Badge></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {spiced.dimensions.map((dimension) => (
                <article key={dimension.key} className="rounded-lg border bg-background p-4">
                  <div className="flex items-start justify-between gap-2"><h3 className="m-0 text-sm">{dimension.label}</h3><Badge variant={statusVariant(dimension.status)}>{dimension.status}</Badge></div>
                  <p className="mt-4 mb-3 min-h-12 text-sm text-muted-foreground">{dimension.value ?? "Não informado"}</p>
                  {dimension.evidenceRefs.length ? (
                    <ul className="m-0 grid list-none gap-2 border-t pt-3 text-xs text-muted-foreground">
                      {dimension.evidenceRefs.map((reference) => <li key={`${reference.transcriptSegmentId}-${reference.startMs}`}><a className="text-link" href={`#transcript-${reference.transcriptSegmentId}`}>“{reference.excerpt}” · {formatDuration(reference.startMs)}</a></li>)}
                    </ul>
                  ) : <p className="m-0 border-t pt-3 text-xs text-muted-foreground">Sem evidência de transcrição.</p>}
                </article>
              ))}
            </div>
            {spiced.objections.length ? <section aria-labelledby="objections-title"><h3 id="objections-title">Objeções registradas</h3><ul className="m-0 grid gap-3 pl-5 text-sm">{spiced.objections.map((objection) => <li key={objection.id}><strong>{objection.originalStatement}</strong><span className="block text-muted-foreground">{objection.response}</span></li>)}</ul></section> : null}
          </>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">A qualificação SPICED ainda não foi extraída para esta execução.</p>
        )}
      </CardContent>
    </Card>
  );
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "known") return "default";
  if (status === "declined") return "destructive";
  if (["partial", "needs_confirmation"].includes(status)) return "secondary";
  return "outline";
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1_000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}
