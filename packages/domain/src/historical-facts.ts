import { z } from "zod";

const signalPayload = z.object({ marketKey: z.string().min(1), type: z.string().min(1), title: z.string().min(1), region: z.string().min(1), direction: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]), confidence: z.number().min(0).max(1), metadata: z.record(z.unknown()).default({}) }).strict();
const metricPayload = z.object({ metric: z.string().min(1), region: z.string().min(1), value: z.number().finite(), unit: z.string().min(1), metadata: z.record(z.unknown()).default({}) }).strict();
export const historicalFactSchema = z.object({
  factKind: z.enum(["MARKET_SIGNAL", "PUBLIC_METRIC"]), externalId: z.string().min(1).max(500), observedAt: z.string().datetime(),
  startsAt: z.string().datetime(), endsAt: z.string().datetime(), evidenceRef: z.string().url(), payload: z.union([signalPayload, metricPayload]),
}).strict().superRefine((row, context) => {
  if (new Date(row.endsAt) < new Date(row.startsAt)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid period" });
  if (new Date(row.observedAt) > new Date()) context.addIssue({ code: z.ZodIssueCode.custom, message: "Observation is in the future" });
  if ((row.factKind === "MARKET_SIGNAL") !== ("type" in row.payload)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Fact payload does not match kind" });
});
export const historicalImportSchema = z.object({
  commandId: z.string().min(8).max(200), sourceKey: z.string().min(1).max(120), reason: z.string().trim().min(3).max(1000),
  evidenceReference: z.string().url(), rangeFrom: z.string().datetime(), rangeTo: z.string().datetime(),
  records: z.array(z.unknown()).min(1).max(5000),
}).strict();
export type HistoricalFact = z.infer<typeof historicalFactSchema>;
