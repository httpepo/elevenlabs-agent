import { deploymentAccess } from "@/infrastructure/bootstrap";
import { demoLeads } from "@/infrastructure/bootstrap";
import { ResearchEnqueueError, ValidationError } from "@/modules/leads/application/lead-dto";
import { issueLeadSessionCookie } from "@/infrastructure/bootstrap";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!deploymentAccess.isEnabled()) return Response.json({ error: "Cadastro indisponível neste ambiente." }, { status: 503 });
  let input: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 16_384) return Response.json({ error: "Formulário muito grande." }, { status: 413 });
    input = JSON.parse(text);
  } catch {
    return Response.json({ error: "Envie um formulário válido." }, { status: 400 });
  }
  try {
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
      return Response.json({ error: "Chave de submissão inválida." }, { status: 400 });
    }
    const result = await demoLeads.create(input, idempotencyKey);
    const { reused, ...response } = result;
    const resultResponse = Response.json(response, { status: reused ? 200 : 201 });
    const sessionCookie = issueLeadSessionCookie({ leadId: result.id, executionId: result.executionId });
    if (sessionCookie) resultResponse.headers.append("Set-Cookie", sessionCookie);
    return resultResponse;
  } catch (error) {
    if (error instanceof ValidationError) return Response.json({ error: error.message, fields: error.fields }, { status: 400 });
    if (error instanceof ResearchEnqueueError) {
      return Response.json({
        error: error.message,
        id: error.capture.id,
        executionId: error.capture.executionId,
        researchRunId: null,
        researchStatus: "failed",
      }, { status: 503 });
    }
    console.error("Falha ao persistir cadastro", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Não foi possível salvar seu cadastro. Tente novamente." }, { status: 500 });
  }
}
