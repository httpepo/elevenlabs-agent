import { isLocalDemo } from "@/infrastructure/config/demo";
import { demoLeads } from "@/infrastructure/bootstrap";
import { ValidationError } from "@/modules/leads/application/lead-dto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isLocalDemo()) return Response.json({ error: "Cadastro indisponível neste ambiente." }, { status: 503 });
  let input: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 16_384) return Response.json({ error: "Formulário muito grande." }, { status: 413 });
    input = JSON.parse(text);
  } catch {
    return Response.json({ error: "Envie um formulário válido." }, { status: 400 });
  }
  try {
    const result = await demoLeads.create(input);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) return Response.json({ error: error.message, fields: error.fields }, { status: 422 });
    console.error("Falha ao persistir cadastro", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Não foi possível salvar seu cadastro. Tente novamente." }, { status: 500 });
  }
}
