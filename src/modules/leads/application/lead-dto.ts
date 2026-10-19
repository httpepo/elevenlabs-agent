// Tipos de entrada e view model. Nenhum acesso à infraestrutura.
export type { FieldErrors, LeadForm, LeadRecord as LeadDetails } from "../domain/lead.ts";
export { spicedLabels, ValidationError } from "../domain/lead.ts";

export type CreateLeadResponse = {
  id: string;
  executionId: string;
  researchRunId: string;
  researchStatus: "queued";
};

export class ResearchEnqueueError extends Error {
  readonly capture: { id: string; executionId: string };

  constructor(capture: { id: string; executionId: string }) {
    super("Cadastro salvo, mas a pesquisa não pôde ser enfileirada.");
    this.name = "ResearchEnqueueError";
    this.capture = capture;
  }
}
