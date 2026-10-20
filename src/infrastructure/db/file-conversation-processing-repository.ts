import "server-only";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ConversationProcessing } from "../../modules/conversation/domain/conversation-processing.ts";
import type { ConversationProcessingRepository } from "../../modules/conversation/ports/conversation-processing-repository.ts";

export class FileConversationProcessingRepository implements ConversationProcessingRepository {
  private readonly directory = path.join(process.cwd(), ".data", "conversation-processing");

  async ensure(voiceSessionId: string): Promise<ConversationProcessing> {
    const now = new Date().toISOString();
    const job: ConversationProcessing = { voiceSessionId, status: "queued", attempts: 0, requestedAt: now,
      updatedAt: now, availableAt: now, leaseUntil: null, leaseOwner: null, lastError: null };
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try { await writeFile(this.filename(voiceSessionId), JSON.stringify(job), { flag: "wx", mode: 0o600 }); }
    catch (error) { if (!isCode(error, "EEXIST")) throw error; }
    return (await this.get(voiceSessionId))!;
  }

  async get(id: string): Promise<ConversationProcessing | null> {
    try { return JSON.parse(await readFile(this.filename(id), "utf8")) as ConversationProcessing; }
    catch (error) { if (isCode(error, "ENOENT")) return null; throw error; }
  }

  async claim(id: string, owner: string, leaseMs: number): Promise<ConversationProcessing | null> {
    const job = await this.get(id);
    const now = Date.now();
    if (!job || ["completed", "failed"].includes(job.status) || Date.parse(job.availableAt) > now ||
      (job.status === "running" && Date.parse(job.leaseUntil!) > now)) return null;
    const next: ConversationProcessing = { ...job, status: "running", attempts: job.attempts + 1,
      leaseOwner: owner, leaseUntil: new Date(now + leaseMs).toISOString(), updatedAt: new Date(now).toISOString() };
    await this.write(next);
    return next;
  }

  async finish(input: Parameters<ConversationProcessingRepository["finish"]>[0]): Promise<void> {
    const job = await this.get(input.voiceSessionId);
    if (!job || job.leaseOwner !== input.owner) return;
    await this.write({ ...job, status: input.status, lastError: input.error, leaseOwner: null, leaseUntil: null,
      updatedAt: new Date().toISOString(), availableAt: new Date(Date.now() + input.delaySeconds * 1000).toISOString() });
  }

  async listPending(): Promise<string[]> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const jobs = await Promise.all((await readdir(this.directory)).filter((name) => name.endsWith(".json")).map((name) => this.get(name.slice(0, -5))));
    return jobs.filter((job) => job && ["queued", "running"].includes(job.status)).map((job) => job!.voiceSessionId);
  }

  private filename(id: string): string {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Identificador de job inválido.");
    return path.join(this.directory, `${id}.json`);
  }

  private async write(job: ConversationProcessing): Promise<void> {
    const temporary = `${this.filename(job.voiceSessionId)}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(job), { mode: 0o600 });
    await rename(temporary, this.filename(job.voiceSessionId));
  }
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
