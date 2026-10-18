import "server-only";
import { createDemoLeadUseCases } from "../modules/leads/application/demo-leads.ts";
import { leadStore } from "./db/file-lead-repository.ts";

// Composition root: único ponto de ligação entre casos de uso e adaptadores.
// A seleção de um repositório Neon será adicionada junto com a implementação.
export const demoLeads = createDemoLeadUseCases(leadStore);
