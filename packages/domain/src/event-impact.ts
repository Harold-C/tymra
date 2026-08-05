import { z } from "zod";

export const eventImpactEvidenceTypeSchema = z.enum([
  "EXPECTED_ATTENDANCE",
  "ACTUAL_ATTENDANCE",
  "VENUE_CAPACITY",
  "OFFICIAL_SCALE_LABEL",
  "CORROBORATING_DEMAND",
]);

export const eventImpactEvidenceItemSchema = z.object({
  evidenceType: eventImpactEvidenceTypeSchema,
  value: z.union([z.number().finite().nonnegative(), z.enum(["LOW", "MEDIUM", "HIGH", "MAJOR"])]),
  unit: z.string().min(1).max(32).optional(),
  sourceUrl: z.string().url().max(1_000),
  observedAt: z.string().datetime(),
  sourcePublishedAt: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (typeof value.value === "number" && !value.unit) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["unit"], message: "Numeric impact evidence requires a unit" });
  }
});

export const eventImpactEvidenceBundleSchema = z.object({
  schemaVersion: z.literal("event-impact-evidence-v1"),
  policyVersion: z.literal("event-impact-promotion-v1"),
  items: z.array(eventImpactEvidenceItemSchema).max(20),
  validationIssues: z.array(z.string().max(200)).max(20).optional(),
}).strict();

export type EventImpactEvidenceBundle = z.infer<typeof eventImpactEvidenceBundleSchema>;

export function evaluateEventImpactEvidence(value: unknown) {
  const parsed = eventImpactEvidenceBundleSchema.safeParse(value);
  if (!parsed.success) {
    return {
      status: "PENDING_EVIDENCE" as const,
      score: null,
      confidence: null,
      evidence: emptyEventImpactEvidence(["INVALID_OR_LEGACY_EVIDENCE_SHAPE"]),
    };
  }

  const attendance = parsed.data.items
    .filter((item) => (item.evidenceType === "EXPECTED_ATTENDANCE" || item.evidenceType === "ACTUAL_ATTENDANCE")
      && typeof item.value === "number" && item.unit === "people" && item.confidence >= 0.7)
    .sort((left, right) => Number(right.value) - Number(left.value))[0];
  if (!attendance || Number(attendance.value) < 50_000) {
    return { status: "PENDING_EVIDENCE" as const, score: null, confidence: null, evidence: parsed.data };
  }

  return {
    status: "PROMOTED" as const,
    score: Math.min(0.99, 0.75 + Math.log10(Number(attendance.value) / 50_000 + 1) * 0.3),
    confidence: attendance.confidence,
    evidence: parsed.data,
  };
}

export function emptyEventImpactEvidence(validationIssues?: string[]): EventImpactEvidenceBundle {
  return {
    schemaVersion: "event-impact-evidence-v1",
    policyVersion: "event-impact-promotion-v1",
    items: [],
    ...(validationIssues?.length ? { validationIssues } : {}),
  };
}
