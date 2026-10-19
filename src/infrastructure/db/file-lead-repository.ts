import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { isLeadId, type LeadRecord, type LeadSubmissionRecord } from "../../modules/leads/domain/lead.ts";
import type { LeadCaptureRepository } from "../../modules/leads/ports/lead-repository.ts";

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

async function removeIfPresent(filePath: string): Promise<void> {
  await unlink(filePath).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
  });
}

// Adaptador local. Não usar arquivos locais como banco em hospedagem serverless.
export class FileLeadStore implements LeadCaptureRepository {
  readonly directory: string;
  constructor(directory = path.join(process.cwd(), ".data", "leads")) {
    this.directory = directory;
  }

  private get submissionsDirectory(): string {
    return path.join(path.dirname(this.directory), "lead-submissions");
  }

  private get idempotencyDirectory(): string {
    return path.join(this.submissionsDirectory, "idempotency");
  }

  private submissionPath(submissionId: string): string {
    return path.join(this.submissionsDirectory, `${submissionId}.json`);
  }

  private idempotencyPath(idempotencyKey: string): string {
    const digest = createHash("sha256").update(idempotencyKey).digest("hex");
    return path.join(this.idempotencyDirectory, `${digest}.json`);
  }

  private async writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temporary = path.join(path.dirname(filePath), `${path.basename(filePath)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(value, null, 2), { flag: "wx", mode: 0o600 });
      await rename(temporary, filePath);
    } finally {
      await removeIfPresent(temporary);
    }
  }

  async save(lead: LeadRecord): Promise<void> {
    if (!isLeadId(lead.id)) throw new Error("Identificador de visitante inválido.");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(this.directory, `${lead.id}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(lead, null, 2), { flag: "wx", mode: 0o600 });
      await rename(temporary, path.join(this.directory, `${lead.id}.json`));
    } finally {
      await unlink(temporary).catch((error: unknown) => { if (!isMissing(error)) throw error; });
    }
  }

  async get(id: string): Promise<LeadRecord | null> {
    if (!isLeadId(id)) return null;
    try {
      return JSON.parse(await readFile(path.join(this.directory, `${id}.json`), "utf8")) as LeadRecord;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async findSubmissionByIdempotencyKey(idempotencyKey: string): Promise<LeadSubmissionRecord | null> {
    try {
      const index = JSON.parse(await readFile(this.idempotencyPath(idempotencyKey), "utf8")) as { submissionId: string };
      return JSON.parse(await readFile(this.submissionPath(index.submissionId), "utf8")) as LeadSubmissionRecord;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async persistCapture(lead: LeadRecord, submission: LeadSubmissionRecord) {
    const existingSubmission = await this.findSubmissionByIdempotencyKey(submission.idempotencyKey);
    if (existingSubmission) return this.existingCapture(existingSubmission);

    await this.save(lead);
    try {
      await this.writeJsonAtomically(this.submissionPath(submission.id), submission);
      await mkdir(this.idempotencyDirectory, { recursive: true, mode: 0o700 });
      await writeFile(
        this.idempotencyPath(submission.idempotencyKey),
        JSON.stringify({ submissionId: submission.id }),
        { flag: "wx", mode: 0o600 },
      );
      return { lead, submission, created: true };
    } catch (error) {
      if (!isAlreadyExists(error)) {
        await removeIfPresent(path.join(this.directory, `${lead.id}.json`));
        await removeIfPresent(this.submissionPath(submission.id));
        throw error;
      }

      await removeIfPresent(path.join(this.directory, `${lead.id}.json`));
      await removeIfPresent(this.submissionPath(submission.id));
      const winner = await this.findSubmissionByIdempotencyKey(submission.idempotencyKey);
      if (!winner) throw new Error("Não foi possível recuperar a submissão idempotente.");
      return this.existingCapture(winner);
    }
  }

  private async existingCapture(submission: LeadSubmissionRecord) {
    const lead = await this.get(submission.leadId);
    if (!lead) throw new Error("Submissão idempotente aponta para cadastro inexistente.");
    return { lead, submission, created: false };
  }

  async list(): Promise<LeadRecord[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const leads = await Promise.all(names.filter((name) => name.endsWith(".json"))
      .map((name) => this.get(name.slice(0, -5))));
    return leads.filter((lead): lead is LeadRecord => lead !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export const leadStore = new FileLeadStore();
