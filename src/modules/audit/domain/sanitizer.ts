const sensitiveKeyNames = new Set([
  "access_token",
  "api_key",
  "authorization",
  "client_secret",
  "cookie",
  "credential",
  "key",
  "password",
  "private_key",
  "refresh_token",
  "secret",
  "session_token",
  "signature",
  "slot_offer_token",
  "token",
  "token_hash",
  "webhook_secret",
]);
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const queryCredentialPattern = /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|signature|password)=)[^&#\s]+/gi;
const inlineCredentialPattern = /((?:["']?\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|credential|signature|cookie|session[_-]?token|private[_-]?key|webhook[_-]?secret|token|key)\b["']?\s*[:=]\s*["']?))[^"'`,;&\s}]+/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2}\b/g;
const commonCredentialPattern = /\b(?:sk|pk|AIza|xox[baprs])[-_A-Za-z0-9]{12,}\b/g;
const redactedValue = "[REDACTED]";

export type SanitizedPayload = Readonly<Record<string, unknown>>;

export function sanitizePayload(value: unknown): SanitizedPayload {
  const sanitized = sanitizeValue(value, new WeakSet<object>(), 0);
  if (isRecord(sanitized)) return sanitized;
  return { value: sanitized };
}

export function sanitizeText(value: string): string {
  return value
    .replace(bearerPattern, `Bearer ${redactedValue}`)
    .replace(queryCredentialPattern, `$1${redactedValue}`)
    .replace(inlineCredentialPattern, `$1${redactedValue}`)
    .replace(jwtPattern, redactedValue)
    .replace(commonCredentialPattern, redactedValue);
}

function sanitizeValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return sanitizeText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, seen, depth + 1));
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      sanitized[key] = isSensitiveKey(key) ? redactedValue : sanitizeValue(item, seen, depth + 1);
    }
    return sanitized;
  } finally {
    seen.delete(value);
  }
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");

  if (sensitiveKeyNames.has(normalizedKey)) return true;
  return ["api_key", "key", "secret", "token", "password", "credential", "signature", "authorization", "private_key"]
    .some((sensitivePart) => normalizedKey.endsWith(`_${sensitivePart}`));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
