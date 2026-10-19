import { researchRuntime } from "@/infrastructure/bootstrap";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  return researchRuntime.consumeResearchMessage(request);
}
