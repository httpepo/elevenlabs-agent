import { z } from "zod";

export const dimensionStatusSchema = z.enum([
  "not_asked",
  "unknown",
  "partial",
  "known",
  "needs_confirmation",
  "declined",
]);

export const confidenceSchema = z.enum(["high", "medium", "low"]);
export const qualificationStatusSchema = z.enum(["not_assessed", "potential_fit", "qualified", "not_qualified"]);
export const interestStatusSchema = z.enum(["interested", "undecided", "declined"]);

export const evidenceRefSchema = z.object({
  transcriptSegmentId: z.string().trim().min(1).max(200),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  excerpt: z.string().trim().min(1).max(4_000),
}).strict().refine((reference) => reference.endMs >= reference.startMs, {
  message: "endMs deve ser maior ou igual a startMs.",
  path: ["endMs"],
});

export const spicedDimensionSchema = z.object({
  status: dimensionStatusSchema,
  value: z.string().trim().max(4_000).nullable(),
  confidence: confidenceSchema,
  evidenceRefs: z.array(evidenceRefSchema).max(20),
}).strict();

export const objectionExtractionSchema = z.object({
  originalStatement: z.string().trim().min(1).max(4_000),
  category: z.enum([
    "price_cost",
    "existing_erp",
    "non_decision_maker",
    "timing_no_time",
    "implementation_anxiety",
    "data_security",
    "human_interaction",
    "non_construction_sector",
  ]).nullable(),
  authorizedClaimIds: z.array(z.string().trim().min(1).max(120)).max(20),
  unansweredFollowUp: z.string().trim().max(2_000).nullable(),
}).strict();

export const profileCorrectionSchema = z.object({
  field: z.enum(["fullName", "company", "role", "phone", "email"]),
  originalValue: z.string().trim().max(500).nullable(),
  correctedValue: z.string().trim().min(1).max(500),
  evidenceRef: evidenceRefSchema,
}).strict();

export const spicedExtractionSchema = z.object({
  situation: spicedDimensionSchema,
  pain: spicedDimensionSchema,
  impact: spicedDimensionSchema,
  criticalEvent: spicedDimensionSchema,
  decision: spicedDimensionSchema,
  qualificationStatus: qualificationStatusSchema,
  interestStatus: interestStatusSchema,
  declineReason: z.string().trim().max(2_000).nullable(),
  objections: z.array(objectionExtractionSchema).max(30),
  profileCorrections: z.array(profileCorrectionSchema).max(20),
}).strict();

export type SpicedExtractionInput = z.infer<typeof spicedExtractionSchema>;

