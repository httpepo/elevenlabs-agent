const sensitiveKeyPattern = /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|credential|signature|cookie|session[_-]?token|private[_-]?key|webhook[_-]?secret|slot[_-]?offer[_-]?token|token[_-]?hash|(?:^|[_-])key$)/i;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const queryCredentialPattern = /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|signature|password)=)[^&#\s]+/gi;
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
    .replace(commonCredentialPattern, redactedValue);
}

function sanitizeValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return sanitizeText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = sensitiveKeyPattern.test(key) ? redactedValue : sanitizeValue(item, seen, depth + 1);
  }
  return sanitized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
