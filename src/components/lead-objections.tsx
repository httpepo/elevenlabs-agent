import { Badge } from "@/design-system/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/design-system/components/ui/card";
import type { SpicedQualificationDTO } from "@/modules/qualification/application/spiced-qualification-dto";

type Objection = SpicedQualificationDTO["objections"][number];
type EvidenceReference = NonNullable<Objection["statementEvidenceRef"]>;

export function LeadObjections({ objections }: { objections: Objection[] }) {
  if (!objections.length) return null;
  return (
    <section aria-labelledby="objections-title">
      <h3 id="objections-title">Objeções registradas</h3>
      <p className="text-sm text-muted-foreground">A orientação do mapa não comprova o que foi dito. Os trechos abaixo mostram a fala identificada na transcrição, não uma avaliação de que a objeção foi resolvida.</p>
      <ul className="m-0 grid list-none gap-4 p-0">
        {objections.map((objection) => <li key={objection.id}><ObjectionCard objection={objection} /></li>)}
      </ul>
    </section>
  );
}

function ObjectionCard({ objection }: { objection: Objection }) {
  return (
    <Card className="min-w-0 break-words" aria-labelledby={`objection-${objection.id}`}>
      <CardHeader className="gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 id={`objection-${objection.id}`} className="m-0 text-sm">{objection.categoryLabel}</h4>
          <Badge variant="outline">{objection.actualResponse ? "Com evidência de resposta" : "Sem resposta identificada"}</Badge>
        </div>
        <p className="m-0 text-sm">Visitante: “{objection.originalStatement}”</p>
        {objection.statementEvidenceRef ? <EvidenceLink reference={objection.statementEvidenceRef} label="Ver objeção na transcrição" /> : null}
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-2">
        <ActualResponse response={objection.actualResponse} />
        <ExpectedResponse objection={objection} />
        {objection.unansweredFollowUp ? <p className="m-0 border-t pt-3 text-sm text-muted-foreground sm:col-span-2">Ponto registrado para o especialista: {objection.unansweredFollowUp}</p> : null}
      </CardContent>
    </Card>
  );
}

function ActualResponse({ response }: { response: Objection["actualResponse"] }) {
  return (
    <section>
      <h5 className="m-0 text-sm font-medium">Resposta do Anderson · transcrição</h5>
      {response ? (
        <ul className="m-0 mt-3 grid list-none gap-3 p-0 text-sm">
          {response.evidenceRefs.map((reference) => (
            <li key={JSON.stringify(reference)}>
              <blockquote className="m-0 whitespace-pre-wrap">“{reference.excerpt}”</blockquote>
              <EvidenceLink reference={reference} label="Ver resposta na transcrição" />
            </li>
          ))}
        </ul>
      ) : <p className="mb-0 mt-3 text-sm text-muted-foreground">Resposta não identificada com evidência. Consulte a transcrição. Registros antigos não possuem essa extração.</p>}
    </section>
  );
}

function ExpectedResponse({ objection }: { objection: Objection }) {
  return (
    <section>
      <h5 className="m-0 text-sm font-medium">Orientação prevista no mapa</h5>
      <p className="mb-0 mt-3 text-sm text-muted-foreground">{objection.expectedResponse}</p>
      <p className="mb-0 mt-3 break-words text-xs text-muted-foreground">Fonte: {objection.source} · versão {objection.sourceVersion}</p>
    </section>
  );
}

function EvidenceLink({ reference, label }: { reference: EvidenceReference; label: string }) {
  const seconds = Math.floor(reference.startMs / 1_000);
  const timestamp = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <a className="text-link rounded-sm text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={`#transcript-${reference.transcriptSegmentId}`}>{label} · {timestamp}</a>;
}
