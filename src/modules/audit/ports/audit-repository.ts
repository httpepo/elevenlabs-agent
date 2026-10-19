import type { ToolExecution, ToolExecutionInput } from "../domain/tool-execution.ts";

export interface AuditRepository {
  recordExecution(input: ToolExecutionInput): Promise<void>;
  listExecutionsByLeadId(leadId: string, executionId?: string): Promise<ToolExecution[]>;
}
