import { createHash } from "node:crypto";

import { z } from "zod";

import { addNzCalendarDays, nzDateKey, nzDayOfWeek } from "./nz-time";

export const querySignatureInputSchema = z.object({
  sourceId: z.string().min(1),
  listingId: z.string().min(1).optional(),
  marketScope: z.string().min(1).optional(),
  sellableUnitId: z.string().min(1).optional(),
  checkIn: z.coerce.date(),
  nights: z.number().int().positive(),
  adults: z.number().int().positive().default(2),
  childrenAges: z.array(z.number().int().min(0).max(17)).default([]),
  units: z.number().int().positive().default(1),
  unitConstraints: z.record(z.unknown()).default({}),
  mealPlan: z.string().default("ANY_PUBLIC"),
  cancellationPolicy: z.string().default("ANY_PUBLIC"),
  ratePlan: z.string().default("PUBLIC"),
  currency: z.literal("NZD").default("NZD"),
  taxAndFeePolicy: z.string().default("MANDATORY_INCLUDED"),
  collectionProfileId: z.string().min(1),
  publicRateContext: z.string().default("PUBLIC_ANONYMOUS"),
  querySemanticsVersion: z.string().default("v1"),
}).superRefine((value, context) => {
  if (!value.listingId && !value.marketScope) {
    context.addIssue({ code: "custom", path: ["listingId"], message: "listingId or marketScope is required" });
  }
});

export type QuerySignatureInput = z.infer<typeof querySignatureInputSchema>;

export type QuerySignature = {
  hash: string;
  canonical: string;
  payload: Omit<QuerySignatureInput, "checkIn" | "unitConstraints"> & {
    checkIn: string;
    unitConstraints: unknown;
  };
};

export function createQuerySignature(input: QuerySignatureInput): QuerySignature {
  const parsed = querySignatureInputSchema.parse(input);
  const payload = {
    ...parsed,
    checkIn: nzDateKey(parsed.checkIn),
    childrenAges: [...parsed.childrenAges].sort((a, b) => a - b),
    unitConstraints: sortObject(parsed.unitConstraints),
  };
  const canonical = stableStringify(payload);
  return {
    hash: createHash("sha256").update(canonical).digest("hex"),
    canonical,
    payload,
  };
}

export type QueryPlanDate = {
  checkIn: string;
  reason: "D7" | "D14" | "D30" | "D60" | "D90" | "WEEKDAY" | "WEEKEND" | "HOLIDAY" | "SCHOOL_HOLIDAY" | "EVENT";
};

export function buildNationalDateBasket(now: Date, specialDates: Array<{ date: Date; reason: QueryPlanDate["reason"] }> = []): QueryPlanDate[] {
  const dates = new Map<string, QueryPlanDate>();
  for (const [days, reason] of [[7, "D7"], [14, "D14"], [30, "D30"], [60, "D60"], [90, "D90"]] as const) {
    const date = addNzCalendarDays(now, days);
    dates.set(date, { checkIn: date, reason });
  }

  const weekday = nextDayOfWeek(now, 2);
  const weekend = nextDayOfWeek(now, 6);
  dates.set(weekday, { checkIn: weekday, reason: "WEEKDAY" });
  dates.set(weekend, { checkIn: weekend, reason: "WEEKEND" });
  for (const item of specialDates) dates.set(nzDateKey(item.date), { checkIn: nzDateKey(item.date), reason: item.reason });
  return [...dates.values()].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

export function buildFormalThirtyDayDates(now: Date): QueryPlanDate[] {
  const start = addNzCalendarDays(now, 1);
  return Array.from({ length: 30 }, (_, index) => {
    const date = addNzCalendarDays(start, index);
    const weekday = nzDayOfWeek(date);
    return { checkIn: date, reason: weekday === 0 || weekday === 6 ? "WEEKEND" : "WEEKDAY" };
  });
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortObject(item)]));
}

function nextDayOfWeek(value: Date, targetDay: number): string {
  const date = nzDateKey(value);
  const distance = (targetDay - nzDayOfWeek(date) + 7) % 7 || 7;
  return addNzCalendarDays(date, distance);
}
