export interface VoiceProvider {
  prepareSession(input: { participantName: string }): Promise<{
    conversationToken: string;
    agentId: string;
    externalCallId: string;
  }>;
}

export class VoiceProviderError extends Error {
  readonly kind: "configuration" | "unavailable" | "invalid_response" | "timeout";
  readonly providerStatus: number | null;

  constructor(
    message: string,
    kind: VoiceProviderError["kind"],
    providerStatus: number | null = null,
  ) {
    super(message);
    this.name = "VoiceProviderError";
    this.kind = kind;
    this.providerStatus = providerStatus;
  }
}
