import type { ConversationArtifactType } from "./conversation-artifact.ts";

export type VerifiedCallWebhook = {
  eventId: string;
  eventType: string;
  externalCallId: string;
  transcript: string | null;
  summary: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type WebhookEventStatus = "received" | "processed" | "ignored" | "failed";

export type WebhookEvent = {
  id: string;
  externalEventId: string;
  externalCallId: string | null;
  eventType: string;
  status: WebhookEventStatus;
  payload: Record<string, unknown>;
  errorReason: string | null;
  receivedAt: string;
  processedAt: string | null;
};

export function artifactTypesForWebhook(webhook: VerifiedCallWebhook): ConversationArtifactType[] {
  return [webhook.transcript ? "transcript" : null, webhook.summary ? "summary" : null].filter(
    (type): type is ConversationArtifactType => type !== null,
  );
}
