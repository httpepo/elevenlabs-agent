import { conversationRuntime } from "@/infrastructure/bootstrap";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  return conversationRuntime.consumeProcessingMessage(request);
}
