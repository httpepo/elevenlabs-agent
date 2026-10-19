import type { TranscriptEvidenceRef } from "../spiced-qualification.ts";
import { validateEvidenceRefs, type TranscriptSegment } from "../transcript.ts";

export type ObjectionEvidenceInput = {
  originalStatement: string;
  statementEvidenceRef: TranscriptEvidenceRef | null;
  responseEvidenceRefs: TranscriptEvidenceRef[];
};

export function validateObjectionEvidence(input: ObjectionEvidenceInput, segments: readonly TranscriptSegment[]) {
  const statement = input.statementEvidenceRef;
  const statementIndex = segments.findIndex((segment) => segment.id === statement?.transcriptSegmentId);
  const validStatement = statement && segments[statementIndex]?.role === "user"
    && statement.excerpt === input.originalStatement
    && validateEvidenceRefs([statement], segments).valid.length > 0;
  if (!validStatement) {
    return { statementEvidenceRef: null, responseEvidenceRefs: [], invalidCount: 1 + input.responseEvidenceRefs.length };
  }

  const responses = validateResponseEvidence(input.responseEvidenceRefs, segments, statementIndex);
  return { statementEvidenceRef: statement, responseEvidenceRefs: responses.valid, invalidCount: responses.invalidCount };
}

function validateResponseEvidence(references: TranscriptEvidenceRef[], segments: readonly TranscriptSegment[], statementIndex: number) {
  const evidence = validateEvidenceRefs(references, segments);
  const valid = evidence.valid.filter((reference) => {
    const index = segments.findIndex((segment) => segment.id === reference.transcriptSegmentId);
    return index > statementIndex && segments[index].role === "agent"
      && reference.startMs >= segments[statementIndex].startMs;
  });
  const unique = [...new Map(valid.map((reference) => [JSON.stringify(reference), reference])).values()];
  unique.sort((left, right) => segments.findIndex((segment) => segment.id === left.transcriptSegmentId)
    - segments.findIndex((segment) => segment.id === right.transcriptSegmentId) || left.startMs - right.startMs);
  return { valid: unique, invalidCount: evidence.invalidCount + evidence.valid.length - valid.length };
}
