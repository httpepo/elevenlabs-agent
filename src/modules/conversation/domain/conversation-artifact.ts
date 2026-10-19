export type ConversationArtifactType = "transcript" | "summary" | "failure";

export type ConversationArtifact = {
  id: string;
  voiceSessionId: string;
  leadId: string;
  executionId: string;
  externalCallId: string;
  type: ConversationArtifactType;
  content: string;
  contentHash: string;
  occurredAt: string;
  createdAt: string;
};

export function createConversationArtifact(input: Omit<ConversationArtifact, "createdAt"> & { createdAt?: string }): ConversationArtifact {
  if (!input.content.trim()) throw new Error("Artefato de conversa vazio.");
  if (!input.contentHash.trim()) throw new Error("Artefato de conversa sem hash.");
  return { ...input, createdAt: input.createdAt ?? new Date().toISOString() };
}
