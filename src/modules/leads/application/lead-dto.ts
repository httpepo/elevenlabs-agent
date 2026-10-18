// Tipos de entrada e view model da demonstração. Nenhum acesso à infraestrutura.
export type { FieldErrors, LeadForm, LeadRecord as LeadDetails } from "../domain/lead.ts";
export { spicedLabels, ValidationError } from "../domain/lead.ts";

export type CreateLeadResponse = { id: string; mode: "demo" };
