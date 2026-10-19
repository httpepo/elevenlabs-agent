import { calendarRuntime, deploymentAccess } from "@/infrastructure/bootstrap";
import { CalendarToolInputError, parseBookingToolInput } from "@/modules/scheduling/application/calendar-tool-input";
import { calendarErrorResponse } from "@/modules/scheduling/application/calendar-error-response";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 16_384) throw new CalendarToolInputError("Payload da ferramenta muito grande.");
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new CalendarToolInputError("Envie um JSON válido para reservar a reunião.");
    }
    const input = parseBookingToolInput(payload);
    if (!await deploymentAccess.canAccessCalendar(request, id, input.voiceSessionId)) return Response.json({ error: "Acesso não autorizado a este atendimento." }, { status: 403 });
    const result = await calendarRuntime.bookMeeting.execute({ leadId: id, ...input });
    return Response.json(result);
  } catch (error) {
    return calendarErrorResponse(error, "Não foi possível processar a reserva da agenda.");
  }
}
