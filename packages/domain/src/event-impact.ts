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
  policyVersion: z.enum(["event-impact-promotion-v1", "event-impact-promotion-v2"]),
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
  if (attendance && Number(attendance.value) >= 50_000) {
    return {
      status: "PROMOTED" as const,
      score: Math.min(0.99, 0.75 + Math.log10(Number(attendance.value) / 50_000 + 1) * 0.3),
      confidence: attendance.confidence,
      evidence: parsed.data,
    };
  }

  if (parsed.data.policyVersion === "event-impact-promotion-v2") {
    const officialScale = strongestCategoricalEvidence(parsed.data, "OFFICIAL_SCALE_LABEL", 0.8);
    const demand = strongestCategoricalEvidence(parsed.data, "CORROBORATING_DEMAND", 0.8);
    const independent = officialScale && demand && sourceDomain(officialScale.sourceUrl) !== sourceDomain(demand.sourceUrl);
    if (officialScale && demand && independent
      && ["HIGH", "MAJOR"].includes(String(officialScale.value))
      && ["HIGH", "MAJOR"].includes(String(demand.value))) {
      const score = officialScale.value === "MAJOR" && demand.value === "MAJOR" ? 0.9 : 0.78;
      return {
        status: "PROMOTED" as const,
        score,
        confidence: Math.min(officialScale.confidence, demand.confidence),
        evidence: parsed.data,
      };
    }
  }

  return { status: "PENDING_EVIDENCE" as const, score: null, confidence: null, evidence: parsed.data };
}

export function emptyEventImpactEvidence(validationIssues?: string[]): EventImpactEvidenceBundle {
  return {
    schemaVersion: "event-impact-evidence-v1",
    policyVersion: "event-impact-promotion-v2",
    items: [],
    ...(validationIssues?.length ? { validationIssues } : {}),
  };
}

export function mergeEventImpactEvidence(values: unknown[]): EventImpactEvidenceBundle {
  const bundles = values.flatMap((value) => {
    const parsed = eventImpactEvidenceBundleSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  const items = new Map<string, EventImpactEvidenceBundle["items"][number]>();
  for (const item of bundles.flatMap((bundle) => bundle.items)) {
    const key = evidenceKey(item);
    const existing = items.get(key);
    if (!existing || item.confidence > existing.confidence) items.set(key, item);
  }
  const issues = [...new Set(bundles.flatMap((bundle) => bundle.validationIssues ?? []))];
  return {
    schemaVersion: "event-impact-evidence-v1",
    policyVersion: "event-impact-promotion-v2",
    items: [...items.values()]
      .sort((left, right) => right.confidence - left.confidence || evidenceKey(left).localeCompare(evidenceKey(right)))
      .slice(0, 20),
    ...(issues.length ? { validationIssues: issues } : {}),
  };
}

function evidenceKey(item: EventImpactEvidenceBundle["items"][number]) {
  return [item.evidenceType, String(item.value), item.unit ?? "", item.sourceUrl].join("|");
}

function sourceDomain(sourceUrl: string) {
  const parts = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "").split(".");
  const nzSecondLevels = new Set(["ac", "co", "geek", "gen", "govt", "iwi", "kiwi", "maori", "mil", "net", "org", "school"]);
  const length = parts.at(-1) === "nz" && nzSecondLevels.has(parts.at(-2) ?? "") ? 3 : 2;
  return parts.slice(-length).join(".");
}

function strongestCategoricalEvidence(
  bundle: EventImpactEvidenceBundle,
  evidenceType: "OFFICIAL_SCALE_LABEL" | "CORROBORATING_DEMAND",
  minimumConfidence: number,
) {
  const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, MAJOR: 3 } as const;
  return bundle.items
    .filter((item) => item.evidenceType === evidenceType && typeof item.value === "string" && item.confidence >= minimumConfidence)
    .sort((left, right) => rank[right.value as keyof typeof rank] - rank[left.value as keyof typeof rank])[0];
}
