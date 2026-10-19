import { randomUUID } from "node:crypto";
import {
  createDemoLead,
  createLeadSubmission,
  linkResearchRun,
  markResearchEnqueueFailed,
} from "../domain/lead.ts";
import type { LeadCaptureRepository, PersistedLeadCapture } from "../ports/lead-repository.ts";
import type { ResearchQueue } from "../../research/ports/research-queue.ts";
import type { CreateLeadResponse } from "./lead-dto.ts";
import { ResearchEnqueueError } from "./lead-dto.ts";

export type CreateLeadResult = CreateLeadResponse & { reused: boolean };

export function createLeadUseCases(repository: LeadCaptureRepository, researchQueue: ResearchQueue) {
  return {
    async create(input: unknown, requestedIdempotencyKey?: string): Promise<CreateLeadResult> {
      const idempotencyKey = requestedIdempotencyKey?.trim() || randomUUID();
      const existingSubmission = await repository.findSubmissionByIdempotencyKey(idempotencyKey);

      if (existingSubmission) {
        const existingLead = await repository.get(existingSubmission.leadId);
        if (!existingLead) throw new Error("Submissão idempotente aponta para cadastro inexistente.");
        return completeCapture(repository, researchQueue, {
          lead: existingLead,
          submission: existingSubmission,
          created: false,
        });
      }

      const lead = createDemoLead(input);
      const submission = createLeadSubmission(lead, idempotencyKey);
      const capture = await repository.persistCapture(lead, submission);
      return completeCapture(repository, researchQueue, capture);
    },
    get(id: string) {
      return repository.get(id);
    },
    list() {
      return repository.list();
    },
  };
}

async function completeCapture(
  repository: LeadCaptureRepository,
  researchQueue: ResearchQueue,
  capture: PersistedLeadCapture,
): Promise<CreateLeadResult> {
  try {
    const researchRun = await researchQueue.enqueue({
      leadId: capture.lead.id,
      executionId: capture.lead.executionId,
      idempotencyKey: capture.submission.idempotencyKey,
    });
    const currentLead = await repository.get(capture.lead.id) ?? capture.lead;
    if (currentLead.research.runId !== researchRun.id) {
      await repository.save(linkResearchRun(currentLead, researchRun.id));
    }
    return {
      id: capture.lead.id,
      executionId: capture.lead.executionId,
      researchRunId: researchRun.id,
      researchStatus: "queued",
      reused: !capture.created,
    };
  } catch (error) {
    const currentLead = await repository.get(capture.lead.id) ?? capture.lead;
    await repository.save(markResearchEnqueueFailed(currentLead));
    if (error instanceof ResearchEnqueueError) throw error;
    throw new ResearchEnqueueError({ id: capture.lead.id, executionId: capture.lead.executionId });
  }
}
