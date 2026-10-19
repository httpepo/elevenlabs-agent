import type { LeadRepository } from "../../../leads/ports/lead-repository.ts";
import { toSpicedQualificationDTO, type SpicedQualificationDTO } from "../spiced-qualification-dto.ts";
import type { QualificationRepository } from "../../ports/qualification-repository.ts";

export class GetSpicedQualificationUseCase {
  constructor(
    private readonly leads: LeadRepository,
    private readonly qualifications: QualificationRepository,
  ) {}

  async execute(input: { leadId: string }): Promise<SpicedQualificationDTO | null> {
    if (!(await this.leads.get(input.leadId))) throw new Error("Visitante não encontrado.");
    const qualification = await this.qualifications.getLatestByLead(input.leadId);
    return qualification ? toSpicedQualificationDTO(qualification) : null;
  }
}

