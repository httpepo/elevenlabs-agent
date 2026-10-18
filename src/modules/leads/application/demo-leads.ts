import { createDemoLead } from "../domain/lead.ts";
import type { LeadRepository } from "../ports/lead-repository.ts";
import type { CreateLeadResponse, LeadDetails } from "./lead-dto.ts";

/** Organiza apenas o fluxo já existente; não dispara pesquisa, voz ou agenda. */
export function createDemoLeadUseCases(repository: LeadRepository) {
  return {
    async create(input: unknown): Promise<CreateLeadResponse> {
      const lead = createDemoLead(input);
      await repository.save(lead);
      return { id: lead.id, mode: lead.mode };
    },
    get(id: string): Promise<LeadDetails | null> {
      return repository.get(id);
    },
    list(): Promise<LeadDetails[]> {
      return repository.list();
    },
  };
}
