import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnvironment } from "../config/env.ts";
import { WebhookVerificationError, type CallWebhookVerifier } from "../../modules/conversation/ports/call-webhook-verifier.ts";
import type { VerifiedCallWebhook } from "../../modules/conversation/domain/call-webhook.ts";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 30 * 60;

export class ElevenLabsWebhookVerifier implements CallWebhookVerifier {
  verify(input: { rawBody: string; signature: string | null }): VerifiedCallWebhook {
    const secret = getServerEnvironment().ELEVENLABS_WEBHOOK_SECRET;
    if (!secret || !input.signature || Buffer.byteLength(input.rawBody, "utf8") > MAX_BODY_BYTES) throw new WebhookVerificationError();
    const signature = parseSignature(input.signature);
    if (!signature || Math.abs(Date.now() / 1_000 - signature.timestamp) > MAX_CLOCK_SKEW_SECONDS || !safeEqual(signature.digest, digest(signature.timestamp, input.rawBody, secret))) {
      throw new WebhookVerificationError();
    }
    const payload = parsePayload(input.rawBody);
    const data = asRecord(payload.data);
    const externalCallId = stringValue(data.conversation_id);
    if (!externalCallId) throw new WebhookVerificationError("Webhook sem identificador de conversa.");
    return {
      eventId: stringValue(payload.event_id) || createHash("sha256").update(input.rawBody).digest("hex"),
      eventType: stringValue(payload.type) || "unknown",
      externalCallId,
      transcript: serializeTranscript(data.transcript),
      summary: extractSummary(data.analysis),
      occurredAt: timestampToIso(payload.event_timestamp),
      payload,
    };
  }
}

function parseSignature(value: string): { timestamp: number; digest: string } | null {
  const parts = Object.fromEntries(value.split(",").map((part) => part.trim().split("=", 2))) as Record<string, string>;
  const timestamp = Number(parts.t);
  return Number.isFinite(timestamp) && parts.v0 ? { timestamp, digest: parts.v0 } : null;
}

function digest(timestamp: number, body: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parsePayload(rawBody: string): Record<string, unknown> {
  try {
    const payload: unknown = JSON.parse(rawBody);
    if (!isRecord(payload)) throw new Error();
    return payload;
  } catch {
    throw new WebhookVerificationError("Webhook com JSON inválido.");
  }
}

function serializeTranscript(value: unknown): string | null {
  return Array.isArray(value) && value.length ? JSON.stringify(value).slice(0, 200_000) : null;
}

function extractSummary(value: unknown): string | null {
  const analysis = asRecord(value);
  const summary = stringValue(analysis.transcript_summary) || stringValue(analysis.summary);
  return summary?.slice(0, 20_000) || null;
}

function timestampToIso(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1_000).toISOString();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
