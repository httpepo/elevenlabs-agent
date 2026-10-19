import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnvironment } from "../config/env.ts";
import type { LeadSessionCredentialVerifier } from "../../modules/conversation/ports/lead-session-credential-verifier.ts";

const COOKIE_NAME = "atlas_lead_session";
const SESSION_TTL_SECONDS = 2 * 60 * 60;

type LeadSessionPayload = {
  leadId: string;
  executionId: string;
  expiresAt: number;
};

export function issueLeadSessionCookie(input: { leadId: string; executionId: string }): string | null {
  const secret = getServerEnvironment().LEAD_SESSION_SECRET;
  if (!secret) return null;
  const payload: LeadSessionPayload = {
    leadId: input.leadId,
    executionId: input.executionId,
    expiresAt: Math.floor(Date.now() / 1_000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${COOKIE_NAME}=${encodedPayload}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function readLeadSessionCredential(request: { headers: Pick<Headers, "get"> }): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ") && authorization.length <= 2048) return authorization.slice(7);
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return cookie?.slice(COOKIE_NAME.length + 1) || null;
}

export class EnvironmentLeadSessionCredentialVerifier implements LeadSessionCredentialVerifier {
  async verify(input: { credential: string; leadId: string; executionId: string }): Promise<boolean> {
    const secret = getServerEnvironment().LEAD_SESSION_SECRET;
    if (!secret) return false;
    const [encodedPayload, encodedSignature] = input.credential.split(".");
    if (!encodedPayload || !encodedSignature) return false;
    if (!safeEqual(sign(encodedPayload, secret), encodedSignature)) return false;
    const payload = decodePayload(encodedPayload);
    return Boolean(
      payload && payload.leadId === input.leadId && payload.executionId === input.executionId &&
      payload.expiresAt > Math.floor(Date.now() / 1_000),
    );
  }
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodePayload(value: string): LeadSessionPayload | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isLeadSessionPayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isLeadSessionPayload(value: unknown): value is LeadSessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.leadId === "string" && typeof payload.executionId === "string" && typeof payload.expiresAt === "number";
}
