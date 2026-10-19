import { randomUUID } from "node:crypto";
import type { LeadRepository } from "../../leads/ports/lead-repository.ts";
import type { ResearchRepository } from "../ports/research-repository.ts";
import type { ResearchQueue } from "../ports/research-queue.ts";

const ACTIVE_RUN_WINDOW_MS = 30_000;

export class StartResearchUseCase {
  private readonly leads: LeadRepository;
  private readonly research: ResearchRepository;
  private readonly queue: ResearchQueue;

  constructor(
    leads: LeadRepository,
    research: ResearchRepository,
    queue: ResearchQueue,
  ) {
    this.leads = leads;
    this.research = research;
    this.queue = queue;
  }

  async execute(input: { leadId: string }) {
    const lead = await this.leads.get(input.leadId);
    if (!lead) throw new Error("Visitante não encontrado.");

    const activeRun = await this.research.getActiveRun(lead.id, lead.executionId);
    if (activeRun && isRecent(activeRun.updatedAt)) return activeRun;

    return this.queue.enqueue({
      leadId: lead.id,
      executionId: lead.executionId,
      idempotencyKey: `research:${lead.executionId}:${randomUUID()}`,
    });
  }
}

function isRecent(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < ACTIVE_RUN_WINDOW_MS;
}
