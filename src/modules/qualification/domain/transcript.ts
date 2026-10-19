import type { TranscriptEvidenceRef } from "./spiced-qualification.ts";

export type TranscriptSegment = {
  id: string;
  role: "agent" | "user" | "unknown";
  text: string;
  startMs: number;
  endMs: number;
};

export function parseTranscript(rawTranscript: string): TranscriptSegment[] {
  const parsed = parseJson(rawTranscript);
  if (Array.isArray(parsed)) {
    return withInferredEndTimes(parsed.flatMap((segment, index) => toSegment(segment, index)));
  }
  if (typeof rawTranscript === "string" && rawTranscript.trim()) {
    return [{ id: "segment-1", role: "unknown", text: rawTranscript.trim(), startMs: 0, endMs: 0 }];
  }
  return [];
}

export function validateEvidenceRefs(
  references: readonly TranscriptEvidenceRef[],
  segments: readonly TranscriptSegment[],
): { valid: TranscriptEvidenceRef[]; invalidCount: number } {
  const segmentMap = new Map(segments.map((segment) => [segment.id, segment]));
  const valid: TranscriptEvidenceRef[] = [];
  let invalidCount = 0;
  for (const reference of references) {
    const segment = segmentMap.get(reference.transcriptSegmentId);
    if (!segment || reference.startMs < segment.startMs || reference.endMs > segment.endMs || !segment.text.includes(reference.excerpt)) {
      invalidCount += 1;
      continue;
    }
    valid.push(reference);
  }
  return { valid, invalidCount };
}

function toSegment(value: unknown, index: number): TranscriptSegment[] {
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  const text = stringValue(item.message) ?? stringValue(item.text) ?? stringValue(item.content);
  if (!text) return [];
  const startMs = timeInMilliseconds(item, ["startMs", "start_ms", "start_time", "time_in_call_secs"]);
  const endMs = timeInMilliseconds(item, ["endMs", "end_ms", "end_time"]);
  const normalizedEndMs = endMs >= startMs ? endMs : startMs;
  return [{
    id: stringValue(item.transcriptSegmentId) ?? stringValue(item.segment_id) ?? stringValue(item.id) ?? `segment-${index + 1}`,
    role: toRole(item.role),
    text,
    startMs,
    endMs: normalizedEndMs,
  }];
}

function timeInMilliseconds(item: Record<string, unknown>, fields: string[]): number {
  for (const field of fields) {
    const value = item[field];
    const isSeconds = field === "start_time" || field === "end_time" || field === "time_in_call_secs";
    if (typeof value === "number" && Number.isFinite(value)) return normalizeTimestamp(isSeconds, value);
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      const parsed = Number(value);
      return normalizeTimestamp(isSeconds, parsed);
    }
  }
  return 0;
}

function normalizeTimestamp(isSeconds: boolean, value: number): number {
  return Math.max(0, Math.round(isSeconds ? value * 1_000 : value));
}

function withInferredEndTimes(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.map((segment, index) => {
    if (segment.endMs > segment.startMs) return segment;
    const nextSegment = segments[index + 1];
    const inferredEndMs = nextSegment && nextSegment.startMs >= segment.startMs
      ? nextSegment.startMs
      : segment.startMs;
    return { ...segment, endMs: inferredEndMs };
  });
}

function toRole(value: unknown): TranscriptSegment["role"] {
  if (value === "agent" || value === "assistant") return "agent";
  if (value === "user" || value === "customer") return "user";
  return "unknown";
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

