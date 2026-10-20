import { createHash, randomUUID } from "node:crypto";
import { createConversationArtifact } from "../domain/conversation-artifact.ts";
import type { ConversationArtifactRepository } from "../ports/conversation-artifact-repository.ts";

export class SaveConversationArtifacts {
  constructor(private readonly artifacts: ConversationArtifactRepository) {}

  async execute(session: { id: string; leadId: string; executionId: string }, input: {
    externalCallId: string; transcript: string | null; summary: string | null; occurredAt: string;
  }): Promise<void> {
    for (const type of ["transcript", "summary"] as const) {
      const content = input[type];
      if (!content) continue;
      const contentHash = createHash("sha256").update(content).digest("hex");
      if (await this.artifacts.hasHash(session.id, type, contentHash)) continue;
      await this.artifacts.appendArtifact(createConversationArtifact({
        id: randomUUID(), voiceSessionId: session.id, leadId: session.leadId, executionId: session.executionId,
        externalCallId: input.externalCallId, type, content, contentHash, occurredAt: input.occurredAt,
      }));
    }
  }
}
