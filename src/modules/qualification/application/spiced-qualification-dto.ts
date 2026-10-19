import { MeetingEligibilityPolicy } from "../domain/policies/meeting-eligibility-policy.ts";
import type { ObjectionRecord } from "../domain/objections/objection-record.ts";
import type { SpicedDimension, SpicedQualification } from "../domain/spiced-qualification.ts";

export type SpicedQualificationDTO = {
  id: string;
  leadId: string;
  executionId: string;
  voiceSessionId: string;
  externalCallId: string;
  qualificationStatus: SpicedQualification["qualificationStatus"];
  interestStatus: SpicedQualification["interestStatus"];
  declineReason: string | null;
  meetingEligibility: ReturnType<MeetingEligibilityPolicy["evaluate"]>;
  dimensions: Array<{
    key: "situation" | "pain" | "impact" | "critical_event" | "decision";
    label: string;
    status: SpicedDimension["status"];
    value: string | null;
    confidence: SpicedDimension["confidence"];
    evidenceRefs: SpicedDimension["evidenceRefs"];
  }>;
  objections: Array<{
    id: string;
    category: ObjectionRecord["category"];
    originalStatement: string;
    response: string;
    source: string;
    sourceVersion: string;
    status: ObjectionRecord["status"];
    unansweredFollowUp: string | null;
  }>;
  createdAt: string;
};

export function toSpicedQualificationDTO(qualification: SpicedQualification): SpicedQualificationDTO {
  const policy = new MeetingEligibilityPolicy();
  return {
    id: qualification.id,
    leadId: qualification.leadId,
    executionId: qualification.executionId,
    voiceSessionId: qualification.voiceSessionId,
    externalCallId: qualification.externalCallId,
    qualificationStatus: qualification.qualificationStatus,
    interestStatus: qualification.interestStatus,
    declineReason: qualification.declineReason,
    meetingEligibility: policy.evaluate({
      interestStatus: qualification.interestStatus,
      situation: qualification.situation,
      pain: qualification.pain,
    }),
    dimensions: [
      dimension("situation", "Situação", qualification.situation),
      dimension("pain", "Dor", qualification.pain),
      dimension("impact", "Impacto", qualification.impact),
      dimension("critical_event", "Evento crítico", qualification.criticalEvent),
      dimension("decision", "Decisão", qualification.decision),
    ],
    objections: qualification.objections.map((objection) => ({
      id: objection.id,
      category: objection.category,
      originalStatement: objection.originalStatement,
      response: objection.response,
      source: objection.source,
      sourceVersion: objection.sourceVersion,
      status: objection.status,
      unansweredFollowUp: objection.unansweredFollowUp,
    })),
    createdAt: qualification.createdAt,
  };
}

function dimension(
  key: SpicedQualificationDTO["dimensions"][number]["key"],
  label: string,
  value: SpicedDimension,
): SpicedQualificationDTO["dimensions"][number] {
  return { key, label, status: value.status, value: value.value, confidence: value.confidence, evidenceRefs: value.evidenceRefs };
}

