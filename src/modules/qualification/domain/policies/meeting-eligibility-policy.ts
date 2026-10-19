import type { SpicedDimension, InterestStatus } from "../spiced-qualification.ts";

export type MeetingEligibilityDecision = {
  eligible: boolean;
  explicitDecline: boolean;
  reason: "explicit_decline" | "interest_not_confirmed" | "operational_context_missing" | "interest_and_context_confirmed";
};

export class MeetingEligibilityPolicy {
  evaluate(input: {
    interestStatus: InterestStatus;
    situation: SpicedDimension;
    pain: SpicedDimension;
  }): MeetingEligibilityDecision {
    if (input.interestStatus === "declined") {
      return { eligible: false, explicitDecline: true, reason: "explicit_decline" };
    }
    if (input.interestStatus !== "interested") {
      return { eligible: false, explicitDecline: false, reason: "interest_not_confirmed" };
    }
    if (!hasOperationalContext(input.situation) && !hasOperationalContext(input.pain)) {
      return { eligible: false, explicitDecline: false, reason: "operational_context_missing" };
    }
    return { eligible: true, explicitDecline: false, reason: "interest_and_context_confirmed" };
  }
}

export function isMeetingEligible(input: Parameters<MeetingEligibilityPolicy["evaluate"]>[0]): boolean {
  return new MeetingEligibilityPolicy().evaluate(input).eligible;
}

function hasOperationalContext(dimension: SpicedDimension): boolean {
  return ["known", "partial"].includes(dimension.status) && Boolean(dimension.value?.trim());
}

