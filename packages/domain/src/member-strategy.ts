import { z } from "zod";

export const memberStrategySchema = z.object({
  minimumPriceMinor: z.number().int().min(0).max(100000000).nullable().default(null),
  maximumPriceMinor: z.number().int().min(1).max(100000000).nullable().default(null),
  maximumAdjustmentPercent: z.number().min(1).max(100).default(25),
  minimumConfidence: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  alertThresholdPercent: z.number().min(1).max(100).default(15),
  emailAlerts: z.boolean().default(true),
  excludedComparableUnitIds: z.array(z.string().min(1)).max(50).default([]),
  pinnedComparableUnitIds: z.array(z.string().min(1)).max(50).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.minimumPriceMinor !== null && value.maximumPriceMinor !== null && value.minimumPriceMinor > value.maximumPriceMinor) ctx.addIssue({ code: "custom", path: ["maximumPriceMinor"], message: "Maximum price must be at least the minimum price." });
  if (value.excludedComparableUnitIds.some(id => value.pinnedComparableUnitIds.includes(id))) ctx.addIssue({ code: "custom", path: ["pinnedComparableUnitIds"], message: "A comparable cannot be pinned and excluded." });
});
export type MemberStrategy = z.infer<typeof memberStrategySchema>;
export const confidenceRank = { INSUFFICIENT: -1, LOW: 0, MEDIUM: 1, HIGH: 2 } as const;

export function selectMemberComparables<T extends { sellableUnitId: string }>(candidates: T[], strategy: MemberStrategy): T[] {
  const eligible = candidates.filter(item => !strategy.excludedComparableUnitIds.includes(item.sellableUnitId));
  const preferred = eligible.filter(item => strategy.pinnedComparableUnitIds.includes(item.sellableUnitId));
  return new Set(preferred.map(item => item.sellableUnitId)).size >= 3 ? preferred : eligible;
}

export function memberReviewRange(strategy: MemberStrategy, targetMinor: number | null, marketMinor: number | null, confidence: keyof typeof confidenceRank) {
  if (!targetMinor || !marketMinor || confidenceRank[confidence] < confidenceRank[strategy.minimumConfidence]) return null;
  const low = Math.max(strategy.minimumPriceMinor ?? 0, Math.round(targetMinor * (1 - strategy.maximumAdjustmentPercent / 100)), Math.round(marketMinor * 0.9));
  const high = Math.min(strategy.maximumPriceMinor ?? Number.MAX_SAFE_INTEGER, Math.round(targetMinor * (1 + strategy.maximumAdjustmentPercent / 100)), Math.round(marketMinor * 1.1));
  return low <= high ? { lowMinor: low, highMinor: high } : null;
}
