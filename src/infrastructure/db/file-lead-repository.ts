import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { isLeadId, type LeadRecord } from "../../modules/leads/domain/lead.ts";
import type { LeadRepository } from "../../modules/leads/ports/lead-repository.ts";

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

// Adaptador local. Não usar arquivos locais como banco em hospedagem serverless.
export class FileLeadStore implements LeadRepository {
  readonly directory: string;
  constructor(directory = path.join(process.cwd(), ".data", "leads")) {
    this.directory = directory;
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
