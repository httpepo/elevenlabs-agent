import type { ResearchSearchResult } from "../domain/briefing.ts";

export type ResearchProviderInput = {
  queries: string[];
  timeoutMs: number;
};

export interface ResearchProvider {
  search(input: ResearchProviderInput): Promise<ResearchSearchResult[]>;
}

export class ResearchProviderError extends Error {
  readonly kind: "configuration" | "timeout" | "failed";

  constructor(message: string, kind: ResearchProviderError["kind"]) {
    super(message);
    this.name = "ResearchProviderError";
    this.kind = kind;
  }
}
