import { z } from "zod";

const text = z.string().nullable();
const date = z.string().transform(value => /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`).refine(value => Number.isFinite(Date.parse(value)));
const place = { city: text, region: text, authority: text, latitude: z.number().nullable(), longitude: z.number().nullable() };
const source = z.object({ name: z.string(), url: text });
export const marketDataSchema = z.object({
  version: z.literal(1), asOf: date,
  rates: z.array(z.object({
    id: z.string(), propertyId: z.string(), listingId: z.string(), unitId: z.string(), ...place,
    paymentTerms: text.optional(), profileKey: text.optional(),
    category: z.string(), amount: z.number().int(), observedAt: date, checkIn: date, checkOut: date,
    nights: z.number(), adults: z.number(), units: z.number(), childrenAges: z.array(z.number()),
    cancellationCategory: z.string(), mealPlan: text, rateFence: text, availability: z.string(), fees: z.string(),
    currency: z.string(), collector: z.string(), qualityFlags: z.array(z.string()), supersededAt: text,
    sourceUrl: z.string(), source: z.string(),
  })).max(20000),
  events: z.array(z.object({ id: z.string(), title: z.string(), category: text, venue: text, ...place,
    startsAt: date, endsAt: date, status: z.string(), observedAt: date, impactStatus: z.string(), sources: z.array(source),
  })).max(20000),
  signals: z.array(z.object({ id: z.string(), title: z.string(), type: z.string(), region: z.string(), marketKey: z.string(),
    startsAt: date, endsAt: date, status: z.string(), observedAt: date, sources: z.array(source),
  })).max(20000),
});
export type MarketData = z.infer<typeof marketDataSchema>;
export type MarketRate = MarketData["rates"][number];

export function safeMarketUrl(value: string | null): string | undefined {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
