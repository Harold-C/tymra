import { addNzCalendarDays, nzDateKey, sampleTrendFilterSchema } from "@tymra/domain";

export function parseSampleTrendFilter(params: Record<string, string | string[] | undefined>, now = new Date()) {
  const today = nzDateKey(now);
  return sampleTrendFilterSchema.safeParse({ from: params.from ?? addNzCalendarDays(today, -27), to: params.to ?? today,
    basis: params.basis ?? "PUBLIC_TOTAL", nights: params.nights ?? "ALL", stay: params.stay ?? "ALL",
    category: params.category ?? "ALL", lead: params.lead ?? "ALL", ...(params.comparison ? { comparison: params.comparison } : {}) });
}
