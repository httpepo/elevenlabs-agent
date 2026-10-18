/** Contrato inicial do briefing; será versionado junto com o fluxo de pesquisa. */
export type ResearchFact = {
  field: string;
  value: string;
  status: "public_source" | "hypothesis";
  sourceIds: string[];
};

export type ResearchResult = {
  summary: string;
  facts: ResearchFact[];
  gaps: string[];
  sources: { id: string; url: string; title: string; excerpt: string; consultedAt: string }[];
};
