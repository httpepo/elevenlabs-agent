import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { EnvironmentError, getServerEnvironment } from "../config/env.ts";
import type { SlotOfferTokenClaims, SlotOfferTokenService } from "../../modules/scheduling/ports/slot-offer-token.ts";

export class HmacSlotOfferTokenService implements SlotOfferTokenService {
  issue(claims: SlotOfferTokenClaims): string {
    const encodedClaims = encodeClaims(claims);
    return `${encodedClaims}.${sign(encodedClaims)}`;
  }

  verify(token: string): SlotOfferTokenClaims | null {
    const [encodedClaims, signature] = token.split(".");
    if (!encodedClaims || !signature || !safeEqual(sign(encodedClaims), signature)) return null;
    const claims = decodeClaims(encodedClaims);
    if (!claims || claims.expiresAt <= Math.floor(Date.now() / 1_000)) return null;
    return claims;
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}

function sign(value: string): string {
  const secret = getServerEnvironment().LEAD_SESSION_SECRET;
  if (!secret) throw new EnvironmentError(["LEAD_SESSION_SECRET"]);
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeClaims(claims: SlotOfferTokenClaims): string {
  return Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
}

function decodeClaims(value: string): SlotOfferTokenClaims | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isClaims(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isClaims(value: unknown): value is SlotOfferTokenClaims {
  if (typeof value !== "object" || value === null) return false;
  const claims = value as Record<string, unknown>;
  return ["leadId", "executionId", "voiceSessionId", "bookingIntentId", "start", "end", "availabilityFrom", "availabilityUntil"]
    .every((key) => typeof claims[key] === "string") && typeof claims.expiresAt === "number";
}

function safeEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export const slotOfferTokenService = new HmacSlotOfferTokenService();
