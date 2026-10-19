import { deploymentAccess, researchRuntime } from "@/infrastructure/bootstrap";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!deploymentAccess.isEnabled()) return Response.json({ error: "Pesquisa indisponível neste ambiente." }, { status: 503 });
  const { id } = await context.params;
  try {
    if (!await deploymentAccess.canAccessLead(request, id)) return Response.json({ error: "Acesso não autorizado a este atendimento." }, { status: 403 });
    const run = await researchRuntime.startResearch.execute({ leadId: id });
    return Response.json({
      leadId: run.leadId,
      executionId: run.executionId,
      researchRunId: run.id,
      researchStatus: run.status,
    }, { status: run.status === "queued" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a pesquisa.";
    const notFound = message === "Visitante não encontrado.";
    return Response.json({ error: message }, { status: notFound ? 404 : 409 });
  }
}
