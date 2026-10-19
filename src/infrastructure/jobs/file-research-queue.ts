import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EnqueueResearchInput, ResearchRun } from "../../modules/research/domain/research-run.ts";
import type { ResearchRepository } from "../../modules/research/ports/research-repository.ts";
import type { JobQueue, ResearchJob, ResearchQueue } from "../../modules/research/ports/research-queue.ts";

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

export class FileResearchQueue implements ResearchQueue, JobQueue {
  private readonly research: ResearchRepository;
  readonly directory: string;

  constructor(
    research: ResearchRepository,
    directory = path.join(process.cwd(), ".data", "research-jobs"),
  ) {
    this.research = research;
    this.directory = directory;
  }

  private jobPath(jobId: string): string { return path.join(this.directory, `${jobId}.json`); }

  async enqueue(input: EnqueueResearchInput): Promise<ResearchRun> {
    const existing = await this.research.findRunByIdempotencyKey(input.idempotencyKey);
    const run = existing ?? await this.research.createRun(input);
    const existingJob = (await this.listJobs()).find((job) => job.idempotencyKey === `research-job:${run.id}`);
    if (existingJob) return run;
    const job: ResearchJob = {
      id: randomUUID(), type: "start_research", leadId: input.leadId, researchRunId: run.id, executionId: input.executionId,
      idempotencyKey: `research-job:${run.id}`, status: "queued", attempts: 0, maxAttempts: 3,
      availableAt: new Date().toISOString(), lockedUntil: null, lastError: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      await writeFile(this.jobPath(job.id), JSON.stringify(job, null, 2), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
    return run;
  }

  async claim(workerId: string, leaseMs: number, researchRunId?: string): Promise<ResearchJob | null> {
    const jobs = await this.listJobs();
    const now = Date.now();
    const candidate = jobs
      .filter((job) => !researchRunId || job.researchRunId === researchRunId)
      .filter((job) => job.status === "queued" && new Date(job.availableAt).getTime() <= now || job.status === "running" && Boolean(job.lockedUntil) && new Date(job.lockedUntil as string).getTime() <= now)
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt))[0];
    if (!candidate) return null;
    const claimed: ResearchJob = {
      ...candidate,
      status: "running",
      attempts: candidate.attempts + 1,
      lockedUntil: new Date(now + leaseMs).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    await this.writeJob(claimed);
    void workerId;
    return claimed;
  }

  async complete(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error("Job de pesquisa não encontrado.");
    await this.writeJob({ ...job, status: "completed", lockedUntil: null, updatedAt: new Date().toISOString() });
  }

  async fail(jobId: string, errorMessage: string): Promise<{ retry: boolean; job: ResearchJob }> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error("Job de pesquisa não encontrado.");
    const run = await this.research.getRun(job.researchRunId);
    const retry = job.attempts < job.maxAttempts && run?.status === "queued";
    const next: ResearchJob = {
      ...job,
      status: retry ? "queued" : "failed",
      availableAt: new Date().toISOString(),
      lockedUntil: null,
      lastError: errorMessage.slice(0, 500),
      updatedAt: new Date().toISOString(),
    };
    await this.writeJob(next);
    if (!retry && run && ["queued", "running"].includes(run.status)) {
      await this.research.transitionRun({ runId: job.researchRunId, status: "failed", errorMessage: next.lastError });
    }
    return { retry, job: next };
  }

  private async listJobs(): Promise<ResearchJob[]> {
    try {
      const names = (await readdir(this.directory)).filter((name) => name.endsWith(".json"));
      const jobs = await Promise.all(names.map((name) => this.getJob(name.slice(0, -5))));
      return jobs.filter((job): job is ResearchJob => job !== null);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }

  private async getJob(jobId: string): Promise<ResearchJob | null> {
    try { return JSON.parse(await readFile(this.jobPath(jobId), "utf8")) as ResearchJob; }
    catch (error) { if (isMissing(error)) return null; throw error; }
  }

  private async writeJob(job: ResearchJob): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.jobPath(job.id)}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(job, null, 2), { flag: "wx", mode: 0o600 });
      await rename(temporary, this.jobPath(job.id));
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
}

export const researchQueue = { create: (research: ResearchRepository) => new FileResearchQueue(research) };
