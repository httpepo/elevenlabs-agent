import { createDemoLead } from "../domain/lead.ts";
import type { LeadRepository } from "../ports/lead-repository.ts";
import type { LeadDetails } from "./lead-dto.ts";

type DemoCreateLeadResponse = { id: string; mode: "demo" };

/** Organiza apenas o fluxo já existente; não dispara pesquisa, voz ou agenda. */
export function createDemoLeadUseCases(repository: LeadRepository) {
  return {
    async create(input: unknown): Promise<DemoCreateLeadResponse> {
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
