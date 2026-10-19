import { Badge } from "@/design-system/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/design-system/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/design-system/components/ui/table";
import type { LeadAuditView } from "@/modules/audit/application/audit-dto";

export function ToolTraceCard({ tools }: { tools: LeadAuditView["tools"] }) {
  return (
    <Card className="record-card">
      <CardHeader className="p-0 pb-6"><CardTitle>Rastro de ferramentas</CardTitle><CardDescription>Chamadas observáveis desta execução. Inputs e outputs foram sanitizados antes da persistência.</CardDescription></CardHeader>
      <CardContent className="p-0">
        {tools.length ? <Table aria-label="Rastro de execução de ferramentas"><TableHeader><TableRow><TableHead>Ferramenta</TableHead><TableHead>Estado</TableHead><TableHead>Duração</TableHead><TableHead>Início</TableHead><TableHead className="text-right">Payloads</TableHead></TableRow></TableHeader><TableBody>{tools.map((tool) => <TableRow key={tool.id}><TableCell><strong>{tool.provider}</strong><small className="mt-1 block text-xs text-muted-foreground">{tool.operation}</small></TableCell><TableCell><Badge variant={statusVariant(tool.status)}>{statusLabel(tool.status)}</Badge></TableCell><TableCell className="whitespace-nowrap text-xs">{tool.durationMs} ms</TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(tool.createdAt)}</TableCell><TableCell className="text-right"><details className="text-left"><summary className="cursor-pointer text-xs text-primary underline underline-offset-4">Ver payloads</summary><div className="mt-3 grid gap-3 sm:min-w-96"><Payload title="Input" value={tool.input} /><Payload title="Output" value={tool.output} /></div></details>{toolError(tool.output) ? <p role="alert" className="notice mt-3 mb-0 text-left">{toolError(tool.output)}</p> : null}</TableCell></TableRow>)}</TableBody></Table> : <p className="m-0 text-sm text-muted-foreground">Nenhuma ferramenta foi registrada nesta execução.</p>}
      </CardContent>
    </Card>
  );
}

function Payload({ title, value }: { title: string; value: Record<string, unknown> }) {
  return <div><p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p><pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 text-left text-xs text-foreground">{JSON.stringify(value, null, 2)}</pre></div>;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "success") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

function statusLabel(status: string): string {
  return { success: "Sucesso", failed: "Falha", conflict: "Conflito", timeout: "Timeout" }[status] ?? status;
}

function toolError(output: Record<string, unknown>): string | null {
  const error = output.error;
  if (typeof error === "string" && error.trim()) return error;
  if (isRecord(error) && typeof error.message === "string" && error.message.trim()) return error.message;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" });
}
