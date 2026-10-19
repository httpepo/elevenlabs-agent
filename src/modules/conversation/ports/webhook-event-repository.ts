import type { WebhookEvent, WebhookEventStatus } from "../domain/call-webhook.ts";

export interface WebhookEventRepository {
  getByExternalEventId(externalEventId: string): Promise<WebhookEvent | null>;
  getByExternalCallAndType(externalCallId: string, eventType: string): Promise<WebhookEvent | null>;
  recordReceived(event: WebhookEvent): Promise<WebhookEvent>;
  updateStatus(input: {
    eventId: string;
    status: WebhookEventStatus;
    errorReason?: string | null;
    processedAt?: string | null;
  }): Promise<WebhookEvent>;
}
