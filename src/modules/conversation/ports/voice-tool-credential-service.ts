export type VoiceToolBinding = Readonly<{
  leadId: string;
  executionId: string;
  voiceSessionId: string;
}>;

export interface VoiceToolCredentialService {
  issue(binding: VoiceToolBinding): string;
  verify(credential: string, binding: VoiceToolBinding): boolean;
}
