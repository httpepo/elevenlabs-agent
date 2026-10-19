import { deploymentAccess, researchRuntime } from "@/infrastructure/bootstrap";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!deploymentAccess.isEnabled()) return Response.json({ error: "Status indisponível neste ambiente." }, { status: 503 });
  const { id } = await context.params;
  const executionId = new URL(request.url).searchParams.get("executionId") ?? undefined;
  try {
    if (!await deploymentAccess.canAccessLead(request, id, executionId)) return Response.json({ error: "Acesso não autorizado a este atendimento." }, { status: 403 });
    return Response.json(await researchRuntime.getResearchStatus.execute({ leadId: id, executionId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar o status.";
    const notFound = message === "Visitante não encontrado.";
    return Response.json({ error: message }, { status: notFound ? 404 : 409 });
  }
}
