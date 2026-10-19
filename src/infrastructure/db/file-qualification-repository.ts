import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LeadProfileVersion } from "../../modules/qualification/domain/lead-profile-version.ts";
import type { SpicedQualification } from "../../modules/qualification/domain/spiced-qualification.ts";
import type { LeadProfileVersionRepository } from "../../modules/qualification/ports/lead-profile-version-repository.ts";
import type { QualificationRepository } from "../../modules/qualification/ports/qualification-repository.ts";
import type { QualificationToolExecution, QualificationToolExecutionRepository } from "../../modules/qualification/ports/qualification-tool-execution-repository.ts";
import { sanitizePayload } from "../../modules/audit/domain/sanitizer.ts";

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

export class FileQualificationRepository implements QualificationRepository, LeadProfileVersionRepository, QualificationToolExecutionRepository {
  private readonly pendingSaves = new Map<string, Promise<void>>();

  constructor(readonly directory = path.join(process.cwd(), ".data", "qualification")) {}

  async findByIdempotencyKey(idempotencyKey: string): Promise<SpicedQualification | null> {
    try {
      const index = JSON.parse(await readFile(this.indexPath(idempotencyKey), "utf8")) as { qualificationId: string };
      return this.read<SpicedQualification>("qualifications", index.qualificationId);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async getLatestByLead(leadId: string, executionId?: string): Promise<SpicedQualification | null> {
    const qualifications = await this.list<SpicedQualification>("qualifications");
    return qualifications.filter((item) => item.leadId === leadId && (!executionId || item.executionId === executionId)).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }

  async save(qualification: SpicedQualification, idempotencyKey: string): Promise<void> {
    const pendingSave = this.pendingSaves.get(idempotencyKey);
    if (pendingSave) {
      await pendingSave;
      return;
    }

    const saveOperation = this.persistQualification(qualification, idempotencyKey);
    this.pendingSaves.set(idempotencyKey, saveOperation);
    try {
      await saveOperation;
    } finally {
      if (this.pendingSaves.get(idempotencyKey) === saveOperation) this.pendingSaves.delete(idempotencyKey);
    }
  }

  private async persistQualification(qualification: SpicedQualification, idempotencyKey: string): Promise<void> {
    const existing = await this.findByIdempotencyKey(idempotencyKey);
    if (existing) return;
    await this.writeIfAbsent("qualifications", qualification.id, qualification);
    try {
      await this.writeIfAbsent("idempotency", this.indexKey(idempotencyKey), { qualificationId: qualification.id });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
  }

  async getLatest(leadId: string, executionId?: string): Promise<LeadProfileVersion | null> {
    const versions = await this.list<LeadProfileVersion>("profile-versions");
    return versions.filter((item) => item.leadId === leadId && (!executionId || item.executionId === executionId)).sort((left, right) => right.version - left.version)[0] ?? null;
  }

  async saveProfileVersion(version: LeadProfileVersion): Promise<void> {
    await this.writeIfAbsent("profile-versions", version.id, version);
  }

  async appendToolExecution(execution: QualificationToolExecution): Promise<void> {
    await this.writeIfAbsent("tool-executions", execution.id, {
      ...execution,
      input: sanitizePayload(execution.input),
      output: sanitizePayload(execution.output),
    });
  }

  private indexPath(idempotencyKey: string): string {
    return path.join(this.directory, "idempotency", `${this.indexKey(idempotencyKey)}.json`);
  }

  private indexKey(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private async writeIfAbsent(folder: string, id: string, value: unknown): Promise<void> {
    const directory = path.join(this.directory, folder);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, `${id}.json`), JSON.stringify(value, null, 2), { flag: "wx", mode: 0o600 });
  }

  private async read<T>(folder: string, id: string): Promise<T | null> {
    try { return JSON.parse(await readFile(path.join(this.directory, folder, `${id}.json`), "utf8")) as T; }
    catch (error) { if (isMissing(error)) return null; throw error; }
  }

  private async list<T>(folder: string): Promise<T[]> {
    try {
      const names = (await readdir(path.join(this.directory, folder))).filter((name) => name.endsWith(".json"));
      const values: Array<T | null> = await Promise.all(names.map((name) => this.read<T>(folder, name.slice(0, -5))));
      return values.filter((value): value is T => value !== null);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }
}

export const fileQualificationRepository = new FileQualificationRepository();

