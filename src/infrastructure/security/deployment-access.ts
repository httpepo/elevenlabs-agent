import "server-only";
import type { LeadRepository } from "../../modules/leads/ports/lead-repository.ts";
import { getServerEnvironment } from "../config/env.ts";
import { isLocalDemo } from "../config/demo.ts";
import { EnvironmentLeadSessionCredentialVerifier, readLeadSessionCredential } from "./lead-session.ts";
import { isPanelAuthorized } from "./panel-access.ts";

type RequestCredentials = { headers: Pick<Headers, "get"> };

export class DeploymentAccess {
  private readonly sessions = new EnvironmentLeadSessionCredentialVerifier();

  constructor(private readonly leads: LeadRepository) {}

  isEnabled(): boolean {
    if (isLocalDemo()) return true;
    const environment = getServerEnvironment();
    return environment.APP_MODE === "live" && Boolean(environment.DATABASE_URL) &&
      (environment.LEAD_SESSION_SECRET?.length ?? 0) >= 32;
  }

  async canAccessLead(request: RequestCredentials, leadId: string, executionId?: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    if (isLocalDemo()) return true;
    const credential = readLeadSessionCredential(request);
    if (!credential) return false;
    const lead = await this.leads.get(leadId);
    if (!lead || executionId && executionId !== lead.executionId) return false;
    return this.sessions.verify({ credential, leadId, executionId: lead.executionId });
  }

  canAccessPanel(request: RequestCredentials): boolean {
    return this.isEnabled() && isPanelAuthorized(request.headers.get("authorization"));
  }
}
