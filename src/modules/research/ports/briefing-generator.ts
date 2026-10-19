import type { BriefingGenerationInput, GeneratedBriefing } from "../domain/briefing.ts";

export interface BriefingGenerator {
  generate(input: BriefingGenerationInput): Promise<GeneratedBriefing>;
}

export class BriefingGenerationError extends Error {
  readonly kind: "configuration" | "timeout" | "failed";

  constructor(message: string, kind: BriefingGenerationError["kind"]) {
    super(message);
    this.name = "BriefingGenerationError";
    this.kind = kind;
  }
}
