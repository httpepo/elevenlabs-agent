import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { VoiceToolBinding, VoiceToolCredentialService } from "../../modules/conversation/ports/voice-tool-credential-service.ts";
import { EnvironmentError, getServerEnvironment } from "../config/env.ts";

const PURPOSE = "voice-calendar:v1";
const TTL_SECONDS = 15 * 60;

type VoiceToolClaims = VoiceToolBinding & {
  purpose: typeof PURPOSE;
  expiresAt: number;
};

export class HmacVoiceToolCredentialService implements VoiceToolCredentialService {
  issue(binding: VoiceToolBinding): string {
    const secret = getServerEnvironment().LEAD_SESSION_SECRET;
    if (!secret) throw new EnvironmentError(["LEAD_SESSION_SECRET"]);
    const claims: VoiceToolClaims = {
      ...binding,
      purpose: PURPOSE,
      expiresAt: Math.floor(Date.now() / 1_000) + TTL_SECONDS,
    };
    const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url");
    return `${encodedClaims}.${sign(encodedClaims, secret)}`;
  }

  verify(credential: string, binding: VoiceToolBinding): boolean {
    const secret = getServerEnvironment().LEAD_SESSION_SECRET;
    if (!secret || credential.length > 2_048) return false;
    const parts = credential.split(".");
    if (parts.length !== 2) return false;
    const [encodedClaims, signature] = parts;
    if (!encodedClaims || !signature || !safeEqual(sign(encodedClaims, secret), signature)) return false;
    const claims = decodeClaims(encodedClaims);
    return Boolean(claims && claims.leadId === binding.leadId &&
      claims.executionId === binding.executionId && claims.voiceSessionId === binding.voiceSessionId &&
      claims.expiresAt > Math.floor(Date.now() / 1_000));
  }
}

function sign(encodedClaims: string, secret: string): string {
  return createHmac("sha256", secret).update(`${PURPOSE}.${encodedClaims}`).digest("base64url");
}

function safeEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function decodeClaims(value: string): VoiceToolClaims | null {
  try {
    const claims: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof claims !== "object" || claims === null) return null;
    const data = claims as Record<string, unknown>;
    if (data.purpose !== PURPOSE || !Number.isSafeInteger(data.expiresAt) ||
      !["leadId", "executionId", "voiceSessionId"].every((key) => typeof data[key] === "string")) return null;
    return data as VoiceToolClaims;
  } catch {
    return null;
  }
}
