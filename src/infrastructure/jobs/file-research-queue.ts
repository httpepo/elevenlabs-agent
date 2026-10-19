import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
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

const enqueueLocks = new Map<string, Promise<void>>();

async function withEnqueueLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = enqueueLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  enqueueLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (enqueueLocks.get(key) === current) enqueueLocks.delete(key);
  }
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

  private claimLockPath(jobId: string): string { return path.join(this.directory, `${jobId}.claim`); }

  async enqueue(input: EnqueueResearchInput): Promise<ResearchRun> {
    return withEnqueueLock(`${input.leadId}:${input.executionId}`, async () => {
      const active = await this.research.getActiveRun(input.leadId, input.executionId);
      if (active && isRecent(active.updatedAt)) return active;

      const existing = await this.research.findRunByIdempotencyKey(input.idempotencyKey);
      const run = existing ?? await this.research.createRun(input);
      const existingJob = (await this.listJobs()).find((job) => job.idempotencyKey === `research-job:${run.id}`);
      if (existingJob) return run;
      const now = new Date().toISOString();
      const job: ResearchJob = {
        id: stableJobId(run.id), type: "start_research", leadId: input.leadId, researchRunId: run.id, executionId: input.executionId,
        idempotencyKey: `research-job:${run.id}`, status: "queued", attempts: 0, maxAttempts: 3,
        availableAt: now, lockedUntil: null, lastError: null, createdAt: now, updatedAt: now,
      };
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      try {
        await writeFile(this.jobPath(job.id), JSON.stringify(job, null, 2), { flag: "wx", mode: 0o600 });
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
      }
      return run;
    });
  }

  async claim(workerId: string, leaseMs: number, researchRunId?: string): Promise<ResearchJob | null> {
    const jobs = await this.listJobs();
    const now = Date.now();
    const candidates = jobs
      .filter((job) => !researchRunId || job.researchRunId === researchRunId)
      .filter((job) => (
        job.status === "queued" && new Date(job.availableAt).getTime() <= now
      ) || (
        job.status === "running" && Boolean(job.lockedUntil) && new Date(job.lockedUntil as string).getTime() <= now
      ))
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt));
    for (const candidate of candidates) {
      if (!await this.acquireClaimLock(candidate.id, workerId, leaseMs)) continue;
      try {
        const current = await this.getJob(candidate.id);
        const currentTime = Date.now();
        if (!current || !isClaimable(current, researchRunId, currentTime)) continue;
        const claimed: ResearchJob = {
          ...current,
          status: "running",
          attempts: current.attempts + 1,
          lockedUntil: new Date(currentTime + leaseMs).toISOString(),
          updatedAt: new Date(currentTime).toISOString(),
        };
        await this.writeJob(claimed);
        return claimed;
      } finally {
        await unlink(this.claimLockPath(candidate.id)).catch(() => undefined);
      }
    }
    return null;
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

  private async acquireClaimLock(jobId: string, workerId: string, leaseMs: number): Promise<boolean> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lockPath = this.claimLockPath(jobId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await writeFile(lockPath, JSON.stringify({ workerId, claimedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
        return true;
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        if (attempt === 0 && await isStaleLock(lockPath, leaseMs)) {
          await unlink(lockPath).catch(() => undefined);
          continue;
        }
        return false;
      }
    }
    return false;
  }
}

function isRecent(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < 30_000;
}

export const researchQueue = { create: (research: ResearchRepository) => new FileResearchQueue(research) };

function isClaimable(job: ResearchJob, researchRunId: string | undefined, now: number): boolean {
  if (researchRunId && job.researchRunId !== researchRunId) return false;
  return (job.status === "queued" && new Date(job.availableAt).getTime() <= now) ||
    (job.status === "running" && Boolean(job.lockedUntil) && new Date(job.lockedUntil as string).getTime() <= now);
}

async function isStaleLock(lockPath: string, leaseMs: number): Promise<boolean> {
  try {
    const details = await stat(lockPath);
    return Date.now() - details.mtimeMs > Math.max(leaseMs, 60_000);
  } catch (error) {
    if (isMissing(error)) return true;
    throw error;
  }
}

function stableJobId(researchRunId: string): string {
  const hexadecimal = createHash("sha256").update(`research-job:${researchRunId}`).digest("hex").slice(0, 32);
  const variant = ((Number.parseInt(hexadecimal.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-4${hexadecimal.slice(13, 16)}-${variant}${hexadecimal.slice(18, 20)}-${hexadecimal.slice(20)}`;
}
