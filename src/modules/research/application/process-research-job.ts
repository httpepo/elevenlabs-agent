import { randomUUID } from "node:crypto";
import type { JobQueue, StartResearchJob } from "../ports/research-queue.ts";
import type { ResearchRepository } from "../ports/research-repository.ts";
import { isTerminalResearchStatus } from "../domain/research-run.ts";
import type { RunResearchUseCase } from "./run-research-use-case.ts";

export class ProcessResearchJob {
  constructor(
    private readonly jobs: JobQueue,
    private readonly research: ResearchRepository,
    private readonly runResearch: RunResearchUseCase,
  ) {}

  async execute(input: StartResearchJob): Promise<void> {
    const run = await this.research.getRun(input.researchRunId);
    if (!run || run.leadId !== input.leadId || run.executionId !== input.executionId) {
      throw new Error("Mensagem da fila não corresponde à execução de pesquisa.");
    }
    const job = await this.jobs.claim(`queue:${randomUUID()}`, 180_000, run.id);
    if (!job) {
      if (isTerminalResearchStatus(run.status)) return;
      throw new Error("A pesquisa está reservada por outro executor; entrega deve ser retomada.");
    }
    try {
      if (run.status === "running") {
        throw new Error("A execução anterior foi interrompida. Solicite uma nova pesquisa.");
      }
      const result = await this.runResearch.execute({ leadId: job.leadId, researchRunId: job.researchRunId });
      if (result.status === "failed" || result.status === "cancelled") {
        await this.jobs.fail(job.id, result.errorMessage ?? "Pesquisa encerrada sem briefing disponível.");
        return;
      }
      if (!isTerminalResearchStatus(result.status)) throw new Error("Pesquisa ainda não possui resultado terminal.");
      await this.jobs.complete(job.id);
    } catch (error) {
      const result = await this.jobs.fail(job.id, "Falha ao executar a pesquisa em segundo plano. Consulte o rastro desta execução.");
      if (result.retry) throw error;
    }
  }
}
