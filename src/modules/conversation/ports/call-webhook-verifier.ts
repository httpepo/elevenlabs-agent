import type { VerifiedCallWebhook } from "../domain/call-webhook.ts";

export interface CallWebhookVerifier {
  verify(input: { rawBody: string; signature: string | null }): VerifiedCallWebhook;
}

export class WebhookVerificationError extends Error {
  constructor(message = "Assinatura do webhook inválida.") {
    super(message);
    this.name = "WebhookVerificationError";
  }
}
