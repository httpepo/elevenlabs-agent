export type SlotOfferTokenClaims = Readonly<{
  leadId: string;
  executionId: string;
  voiceSessionId: string;
  bookingIntentId: string;
  start: string;
  end: string;
  availabilityFrom: string;
  availabilityUntil: string;
  expiresAt: number;
}>;

export interface SlotOfferTokenService {
  issue(claims: SlotOfferTokenClaims): string;
  verify(token: string): SlotOfferTokenClaims | null;
  hash(token: string): string;
}
