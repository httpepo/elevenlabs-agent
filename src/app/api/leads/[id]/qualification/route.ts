import { deploymentAccess, qualificationRuntime } from "@/infrastructure/bootstrap";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!deploymentAccess.isEnabled()) return Response.json({ error: "Qualificação indisponível neste ambiente." }, { status: 503 });
  const { id } = await context.params;
  try {
    if (!await deploymentAccess.canAccessLead(request, id)) return Response.json({ error: "Acesso não autorizado a este atendimento." }, { status: 403 });
    const qualification = await qualificationRuntime.getSpicedQualification.execute({ leadId: id });
    if (!qualification) return Response.json({ error: "Qualificação ainda não disponível." }, { status: 404 });
    return Response.json(qualification);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar a qualificação.";
    return Response.json({ error: message }, { status: message === "Visitante não encontrado." ? 404 : 409 });
  }
}

