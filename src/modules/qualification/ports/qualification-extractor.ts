import type { LeadForm, OriginalLeadForm } from "../../leads/domain/lead.ts";
import type { TranscriptSegment } from "../domain/transcript.ts";
import type { SpicedExtractionInput } from "../domain/schemas/spiced-schema.ts";

export type QualificationExtractionInput = {
  lead: { original: OriginalLeadForm; normalized: LeadForm };
  transcriptSegments: readonly TranscriptSegment[];
};

export interface QualificationExtractor {
  extract(input: QualificationExtractionInput): Promise<SpicedExtractionInput>;
}

export class QualificationExtractionError extends Error {
  readonly kind: "configuration" | "timeout" | "failed" | "invalid_response";

  constructor(message: string, kind: QualificationExtractionError["kind"]) {
    super(message);
    this.name = "QualificationExtractionError";
    this.kind = kind;
  }
}

