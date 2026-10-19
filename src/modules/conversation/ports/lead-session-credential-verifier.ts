export interface LeadSessionCredentialVerifier {
  verify(input: { credential: string; leadId: string; executionId: string }): Promise<boolean>;
}
