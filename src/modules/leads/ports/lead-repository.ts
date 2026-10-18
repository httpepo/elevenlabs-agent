import type { LeadRecord } from "../domain/lead.ts";

/** Persistência da demonstração atual; sem dependência do adaptador em arquivo. */
export interface LeadRepository {
  save(lead: LeadRecord): Promise<void>;
  get(id: string): Promise<LeadRecord | null>;
  list(): Promise<LeadRecord[]>;
}
