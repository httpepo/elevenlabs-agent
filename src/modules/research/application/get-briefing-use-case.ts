import type { LeadRepository } from "../../leads/ports/lead-repository.ts";
import type { ResearchRepository } from "../ports/research-repository.ts";
import { toResearchStatusView } from "./research-dto.ts";

export class GetBriefingUseCase {
  private readonly leads: LeadRepository;
  private readonly research: ResearchRepository;

  constructor(leads: LeadRepository, research: ResearchRepository) {
    this.leads = leads;
    this.research = research;
  }

  async execute(input: { leadId: string; executionId?: string }) {
    const lead = await this.leads.get(input.leadId);
    if (!lead) throw new Error("Visitante não encontrado.");
    if (input.executionId && input.executionId !== lead.executionId) {
      throw new Error("A execução informada não pertence a este visitante.");
    }
    return this.research.getLatestBriefing(lead.id, lead.executionId);
  }
}

export class GetResearchStatusUseCase {
  private readonly leads: LeadRepository;
  private readonly research: ResearchRepository;

  constructor(leads: LeadRepository, research: ResearchRepository) {
    this.leads = leads;
    this.research = research;
  }

  async execute(input: { leadId: string; executionId?: string }) {
    const lead = await this.leads.get(input.leadId);
    if (!lead) throw new Error("Visitante não encontrado.");
    if (input.executionId && input.executionId !== lead.executionId) {
      throw new Error("A execução informada não pertence a este visitante.");
    }
    const executionId = lead.executionId;
    const [run, briefing] = await Promise.all([
      this.research.getLatestRun(lead.id, executionId),
      this.research.getLatestBriefing(lead.id, executionId),
    ]);
    return toResearchStatusView(lead.id, executionId, run, briefing);
  }
}
