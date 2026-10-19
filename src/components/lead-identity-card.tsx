import { Badge } from "@/design-system/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/design-system/components/ui/card";
import type { LeadAuditView } from "@/modules/audit/application/audit-dto";

const fieldLabels: Record<keyof LeadAuditView["identity"]["original"], string> = {
  fullName: "Nome",
  email: "E-mail",
  phone: "Telefone",
  company: "Empresa",
  website: "Site",
  employeeCount: "Funcionários",
};

const correctionLabels: Record<string, string> = {
  fullName: "Nome",
  company: "Empresa",
  role: "Cargo",
  phone: "Telefone",
  email: "E-mail",
};

export function LeadIdentityCard({ identity }: { identity: LeadAuditView["identity"] }) {
  return (
    <Card className="record-card">
      <CardHeader className="p-0 pb-6">
        <CardTitle>Identidade e preservação</CardTitle>
        <CardDescription>O formulário original permanece imutável; confirmações e correções têm histórico próprio.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 p-0 lg:grid-cols-2">
        <IdentityColumn title="Formulário original" badge="imutável" fields={identity.original} />
        <section aria-labelledby="confirmed-identity-title" className="rounded-lg border border-primary/30 bg-background p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 id="confirmed-identity-title" className="m-0 text-base font-semibold">Confirmado ou corrigido na conversa</h3>
            <Badge variant={identity.corrections.length ? "default" : "outline"}>
              {identity.corrections.length ? `${identity.corrections.length} alteração(ões)` : "Sem alterações"}
            </Badge>
          </div>
          <dl className="mb-6 grid gap-3 border-b pb-5">
            {(Object.keys(fieldLabels) as Array<keyof typeof fieldLabels>).map((field) => (
              <div key={field} className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
                <dt className="text-xs text-muted-foreground">{fieldLabels[field]}</dt>
                <dd className="m-0 break-words whitespace-pre-wrap text-sm">{identity.normalized[field] || "(vazio)"}</dd>
              </div>
            ))}
          </dl>
          {identity.corrections.length ? (
            <ul className="m-0 grid list-none gap-4 p-0">
              {identity.corrections.map((correction) => (
                <li key={`${correction.field}-${correction.evidenceRef.transcriptSegmentId}`} className="border-t pt-4 first:border-0 first:pt-0">
                  <p className="mb-1 text-xs text-muted-foreground">{correctionLabels[correction.field] ?? correction.field}</p>
                  <p className="mb-2 text-sm font-medium">{correction.correctedValue}</p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Valor anterior: {correction.originalValue || "não informado"}
                  </p>
                  <a className="text-link text-xs" href={`#transcript-${correction.evidenceRef.transcriptSegmentId}`}>
                    Ver evidência em {formatDuration(correction.evidenceRef.startMs)}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">Nenhuma correção ou confirmação cadastral foi registrada nesta execução.</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function IdentityColumn({ title, badge, fields }: { title: string; badge: string; fields: LeadAuditView["identity"]["original"] }) {
  return (
    <section aria-labelledby="original-identity-title" className="rounded-lg border bg-background p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 id="original-identity-title" className="m-0 text-base font-semibold">{title}</h3>
        <Badge variant="outline">{badge}</Badge>
      </div>
      <dl className="m-0 grid gap-3">
        {(Object.keys(fieldLabels) as Array<keyof typeof fieldLabels>).map((field) => (
          <div key={field} className="grid gap-1 border-t pt-3 first:border-0 first:pt-0 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-xs text-muted-foreground">{fieldLabels[field]}</dt>
            <dd className="m-0 break-words whitespace-pre-wrap text-sm">{fields[field] || "(vazio)"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1_000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}
