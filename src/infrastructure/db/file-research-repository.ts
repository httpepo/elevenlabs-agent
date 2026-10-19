import "server-only";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createQueuedResearchRun, transitionResearchRun, type EnqueueResearchInput, type ResearchRun } from "../../modules/research/domain/research-run.ts";
import type { Briefing, ResearchSource } from "../../modules/research/domain/briefing.ts";
import type { ResearchRepository, ResearchToolExecution } from "../../modules/research/ports/research-repository.ts";
import { sanitizePayload } from "../../modules/audit/domain/sanitizer.ts";

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

export class FileResearchRepository implements ResearchRepository {
  readonly directory: string;

  constructor(directory = path.join(process.cwd(), ".data", "research")) {
    this.directory = directory;
  }

  private pathFor(folder: string, id: string): string {
    return path.join(this.directory, folder, `${id}.json`);
  }

  private idempotencyPath(key: string): string {
    return this.pathFor("idempotency", createHash("sha256").update(key).digest("hex"));
  }

  private async write(folder: string, id: string, value: unknown): Promise<void> {
    const directory = path.join(this.directory, folder);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(directory, `${id}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, JSON.stringify(value, null, 2), { flag: "wx", mode: 0o600 });
      await rename(temporaryPath, this.pathFor(folder, id));
    } finally { await unlink(temporaryPath).catch(() => undefined); }
  }

  private async read<T>(folder: string, id: string): Promise<T | null> {
    try { return JSON.parse(await readFile(this.pathFor(folder, id), "utf8")) as T; }
    catch (error) { if (isMissing(error)) return null; throw error; }
  }

  private async list<T>(folder: string): Promise<T[]> {
    try {
      const names = (await readdir(path.join(this.directory, folder))).filter((name) => name.endsWith(".json"));
      const values = await Promise.all(names.map((name) => this.read<T>(folder, name.slice(0, -5))));
      return values.filter((value) => value !== null) as T[];
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }

  async createRun(input: EnqueueResearchInput): Promise<ResearchRun> {
    const existing = await this.findRunByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;
    const run = createQueuedResearchRun(input);
    await mkdir(path.join(this.directory, "runs"), { recursive: true, mode: 0o700 });
    await mkdir(path.join(this.directory, "idempotency"), { recursive: true, mode: 0o700 });
    await writeFile(this.pathFor("runs", run.id), JSON.stringify(run, null, 2), { flag: "wx", mode: 0o600 });
    try {
      await writeFile(this.idempotencyPath(input.idempotencyKey), JSON.stringify({ runId: run.id }), { flag: "wx", mode: 0o600 });
      return run;
    } catch (error) {
      await unlink(this.pathFor("runs", run.id)).catch(() => undefined);
      if (!isAlreadyExists(error)) throw error;
      const winner = await this.findRunByIdempotencyKey(input.idempotencyKey);
      if (!winner) throw new Error("Não foi possível recuperar a execução de pesquisa idempotente.");
      return winner;
    }
  }

  getRun(id: string): Promise<ResearchRun | null> { return this.read<ResearchRun>("runs", id); }

  async findRunByIdempotencyKey(idempotencyKey: string): Promise<ResearchRun | null> {
    try {
      const index = JSON.parse(await readFile(this.idempotencyPath(idempotencyKey), "utf8")) as { runId: string };
      return await this.getRun(index.runId);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const runs = await this.list<ResearchRun>("runs");
    return runs.find((run) => run.idempotencyKey === idempotencyKey) ?? null;
  }

  async getLatestRun(leadId: string, executionId?: string): Promise<ResearchRun | null> {
    const runs = (await this.list<ResearchRun>("runs"))
      .filter((run) => run.leadId === leadId && (!executionId || run.executionId === executionId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return runs[0] ?? null;
  }

  async getActiveRun(leadId: string, executionId: string): Promise<ResearchRun | null> {
    const runs = (await this.list<ResearchRun>("runs"))
      .filter((run) => run.leadId === leadId && run.executionId === executionId && ["queued", "running"].includes(run.status))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return runs[0] ?? null;
  }

  async transitionRun(input: {
    runId: string;
    status: ResearchRun["status"];
    errorMessage?: string | null;
    executionTimeMs?: number | null;
  }): Promise<ResearchRun> {
    const current = await this.getRun(input.runId);
    if (!current) throw new Error("Execução de pesquisa não encontrada.");
    const next = transitionResearchRun(current, input.status, {
      errorMessage: input.errorMessage,
      executionTimeMs: input.executionTimeMs,
    });
    await this.write("runs", next.id, next);
    return next;
  }

  async saveSources(sources: ResearchSource[]): Promise<void> {
    await Promise.all(sources.map((source) => this.write("sources", source.id, source)));
  }

  async listSources(leadId: string, executionId?: string): Promise<ResearchSource[]> {
    const sources = await this.list<ResearchSource>("sources");
    return sources
      .filter((source) => source.leadId === leadId && (!executionId || source.executionId === executionId))
      .sort((left, right) => left.consultedAt.localeCompare(right.consultedAt));
  }

  async createBriefing(input: Omit<Briefing, "id" | "version" | "createdAt">): Promise<Briefing> {
    const previous = await this.getLatestBriefing(input.leadId, input.executionId);
    const briefing: Briefing = {
      ...input,
      id: randomUUID(),
      version: (previous?.version ?? 0) + 1,
      createdAt: new Date().toISOString(),
    };
    await this.write("briefings", briefing.id, briefing);
    return briefing;
  }

  async getLatestBriefing(leadId: string, executionId?: string): Promise<Briefing | null> {
    const briefings = (await this.list<Briefing>("briefings"))
      .filter((briefing) => briefing.leadId === leadId && (!executionId || briefing.executionId === executionId))
      .sort((left, right) => right.version - left.version || right.createdAt.localeCompare(left.createdAt));
    return briefings[0] ?? null;
  }

  async appendToolExecution(execution: ResearchToolExecution): Promise<void> {
    await this.write("tool-executions", execution.id, {
      ...execution,
      input: sanitizePayload(execution.input),
      output: sanitizePayload(execution.output),
    });
  }
}

export const fileResearchRepository = new FileResearchRepository();
