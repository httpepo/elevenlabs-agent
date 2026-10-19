import "server-only";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createToolExecution, type ToolExecution, type ToolExecutionInput } from "../../../modules/audit/domain/tool-execution.ts";
import type { AuditRepository } from "../../../modules/audit/ports/audit-repository.ts";
import type { ResearchToolExecution } from "../../../modules/research/ports/research-repository.ts";
import type { VoiceToolExecution } from "../../../modules/conversation/ports/voice-tool-execution-repository.ts";
import type { QualificationToolExecution } from "../../../modules/qualification/ports/qualification-tool-execution-repository.ts";
import type { CalendarToolExecution } from "../../../modules/scheduling/ports/calendar-tool-execution-repository.ts";

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export class FileAuditRepository implements AuditRepository {
  constructor(
    readonly directory = path.join(process.cwd(), ".data", "audit"),
    private readonly dataDirectory = path.join(process.cwd(), ".data"),
  ) {}

  async recordExecution(input: ToolExecutionInput): Promise<void> {
    const execution = createToolExecution(input);
    const executionsDirectory = path.join(this.directory, "tool-executions");
    await mkdir(executionsDirectory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(executionsDirectory, `${execution.id}.${cryptoRandomId()}.tmp`);
    try {
      await writeFile(temporaryPath, JSON.stringify(execution, null, 2), { flag: "wx", mode: 0o600 });
      await rename(temporaryPath, path.join(executionsDirectory, `${execution.id}.json`));
    } finally {
      await unlink(temporaryPath).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      });
    }
  }

  async listExecutionsByLeadId(leadId: string, executionId?: string): Promise<ToolExecution[]> {
    const [generic, research, conversation, qualification, scheduling] = await Promise.all([
      this.listDirectory("tool-executions", this.directory),
      this.listDirectory("research/tool-executions"),
      this.listDirectory("conversation/tool-executions"),
      this.listDirectory("qualification/tool-executions"),
      this.listDirectory("scheduling/tool-executions"),
    ]);
    const executions = [
      ...generic.map((value) => toGenericExecution(value)),
      ...research.map((value) => toResearchExecution(value as ResearchToolExecution)),
      ...conversation.map((value) => toVoiceExecution(value as VoiceToolExecution)),
      ...qualification.map((value) => toQualificationExecution(value as QualificationToolExecution)),
      ...scheduling.map((value) => toVoiceExecution(value as CalendarToolExecution)),
    ];
    const unique = new Map(executions.map((execution) => [execution.id, execution]));
    return [...unique.values()]
      .filter((execution) => execution.leadId === leadId && (!executionId || execution.executionId === executionId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  private async listDirectory(relativeDirectory: string, baseDirectory = this.dataDirectory): Promise<Record<string, unknown>[]> {
    const directory = path.join(baseDirectory, relativeDirectory);
    let names: string[];
    try {
      names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const values = await Promise.all(names.map(async (name) => {
      try {
        const value: unknown = JSON.parse(await readFile(path.join(directory, name), "utf8"));
        return isRecord(value) ? value : null;
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    }));
    return values.filter((value): value is Record<string, unknown> => value !== null);
  }
}

function toGenericExecution(value: Record<string, unknown>): ToolExecution {
  return createToolExecution({
    id: stringValue(value.id),
    leadId: stringValue(value.leadId),
    executionId: stringValue(value.executionId),
    researchRunId: nullableString(value.researchRunId),
    voiceSessionId: nullableString(value.voiceSessionId),
    provider: stringValue(value.provider),
    operation: stringValue(value.operation),
    status: statusValue(value.status),
    durationMs: numberValue(value.durationMs),
    input: value.input,
    output: value.output,
    createdAt: stringValue(value.createdAt),
  });
}

function toResearchExecution(value: ResearchToolExecution): ToolExecution {
  return createToolExecution({
    id: value.id,
    leadId: value.leadId,
    executionId: value.executionId,
    researchRunId: value.researchRunId,
    voiceSessionId: null,
    provider: value.provider,
    operation: value.operation,
    status: value.status,
    durationMs: value.durationMs,
    input: value.input,
    output: value.output,
    createdAt: value.createdAt,
  });
}

function toVoiceExecution(value: VoiceToolExecution | CalendarToolExecution): ToolExecution {
  return createToolExecution({
    id: value.id,
    leadId: value.leadId,
    executionId: value.executionId,
    researchRunId: null,
    voiceSessionId: value.voiceSessionId,
    provider: value.provider,
    operation: value.operation,
    status: value.status,
    durationMs: value.durationMs,
    input: value.input,
    output: value.output,
    createdAt: value.createdAt,
  });
}

function toQualificationExecution(value: QualificationToolExecution): ToolExecution {
  return createToolExecution({
    id: value.id,
    leadId: value.leadId,
    executionId: value.executionId,
    researchRunId: null,
    voiceSessionId: value.voiceSessionId,
    provider: value.provider,
    operation: value.operation,
    status: value.status,
    durationMs: value.durationMs,
    input: value.input,
    output: value.output,
    createdAt: value.createdAt,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "unknown";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function statusValue(value: unknown): ToolExecution["status"] {
  return value === "success" || value === "conflict" || value === "timeout" ? value : "failed";
}

function cryptoRandomId(): string {
  return randomUUID();
}

export const fileAuditRepository = new FileAuditRepository();
