import type { ConversationArtifact } from "../domain/conversation-artifact.ts";

export interface ConversationArtifactRepository {
  appendArtifact(artifact: ConversationArtifact): Promise<void>;
  hasHash(voiceSessionId: string, type: ConversationArtifact["type"], contentHash: string): Promise<boolean>;
  listArtifactsByLead(leadId: string, executionId?: string): Promise<ConversationArtifact[]>;
}
