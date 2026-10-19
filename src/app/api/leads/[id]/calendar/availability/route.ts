import { calendarRuntime, deploymentAccess } from "@/infrastructure/bootstrap";
import { CalendarToolInputError, parseAvailabilityToolInput } from "@/modules/scheduling/application/calendar-tool-input";
import { calendarErrorResponse } from "@/modules/scheduling/application/calendar-error-response";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    if (!await deploymentAccess.canAccessLead(request, id)) return Response.json({ error: "Acesso não autorizado a este atendimento." }, { status: 403 });
    const payload = await readJson(request);
    const input = parseAvailabilityToolInput(payload);
    const result = await calendarRuntime.getAvailability.execute({ leadId: id, ...input });
    return Response.json(result);
  } catch (error) {
    return calendarErrorResponse(error, "Não foi possível consultar a disponibilidade da agenda.");
  }
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > 16_384) throw new CalendarToolInputError("Payload da ferramenta muito grande.");
  try {
    return JSON.parse(text);
  } catch {
    throw new CalendarToolInputError("Envie um JSON válido para consultar a agenda.");
  }
}

