import { z } from "zod";

export const SAMPLE_QUOTE_PACKAGE_VERSION = "booking-reference-packages-v1";
export const sampleReferencePackageSchema = z.object({
  unitExternalId: z.string().min(1), ratePlanExternalId: z.string().min(1), amountMinor: z.number().int().positive(),
  selector: z.string().min(1).max(200), mealPlan: z.string().max(200),
  cancellationPolicy: z.string().max(1000), paymentTerms: z.string().max(1000),
});
export type SampleReferencePackage = z.infer<typeof sampleReferencePackageSchema>;
export const samplePackageScopeSchema = z.object({ selectedPanel: z.literal("christchurch-selected-samples"), phase: z.literal("quote"),
  memberId: z.string(), manifestHash: z.string(), verifiedWire: z.object({ argusJobId: z.string(), resultSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    canonicalSha256: z.string().regex(/^[a-f0-9]{64}$/u), wireJson: z.string().optional(), wireCanonicalSha256: z.string().optional() }),
  evaluated: z.array(z.object({ referencePrice: z.object({ kind: z.string(), amountMinor: z.number(), ratePlanExternalId: z.string() }).optional() })) });
export const samplePackageTaskSchema = z.object({ memberId: z.string(), manifestHash: z.string(), checkIn: z.string().date(), unitExternalId: z.string() });
const contextSchema = z.object({ checkIn: z.string().date(), checkOut: z.string().date(), adults: z.literal(2),
  children: z.literal(0), units: z.literal(1), currency: z.literal("NZD") });
const rowSchema = z.object({ unitExternalId: z.string(), ratePlanId: z.string(), occupancy: z.literal(2),
  rateFence: z.literal("MEMBER_ONLY"), availableUnits: z.number().int().positive(),
  itemizedTotalPriceText: z.string(), sourceText: z.string().max(20000), feeInclusionText: z.string().max(20000),
  mealPlan: z.string().nullable(), cancellationPolicy: z.string().nullable(), paymentTerms: z.string().nullable() });
const snapshotSchema = z.object({ schema: z.literal("argus.booking-public-page@1.0.0"), kind: z.literal("detail"),
  canonicalUrl: z.string().url(), context: contextSchema, requested: contextSchema,
  rates: z.array(z.unknown()).max(500) });

/** Parse inert, retained evidence only. Never infer an offer from its price, order, or another room. */
export function bookingReferencePackages(html: string, expected: z.infer<typeof contextSchema> & { sourceUrl: string; unitExternalId: string }) {
  if (html.length > 8 * 1024 * 1024 || new TextEncoder().encode(html).length > 8 * 1024 * 1024) return [];
  const matches = [...html.matchAll(/<script type="application\/json" id="(?:argus-booking-page-snapshot|argus-structured-page-snapshot)">([\s\S]*?)<\/script>/gu)];
  if (matches.length !== 1) return [];
  let value: unknown; try { value = JSON.parse(matches[0][1]); } catch { return []; }
  const parsed = snapshotSchema.safeParse(value); if (!parsed.success) return [];
  const snapshot = parsed.data, url = new URL(snapshot.canonicalUrl), wanted = new URL(expected.sourceUrl);
  if (url.hostname !== "www.booking.com" || url.origin !== wanted.origin || url.pathname !== wanted.pathname) return [];
  for (const key of ["checkIn", "checkOut", "adults", "children", "units", "currency"] as const) {
    if (snapshot.context[key] !== expected[key] || snapshot.requested[key] !== expected[key]) return [];
  }
  const packages: SampleReferencePackage[] = [];
  for (const value of snapshot.rates) {
    const parsed = rowSchema.safeParse(value); if (!parsed.success) continue;
    const row = parsed.data; if (row.unitExternalId !== expected.unitExternalId) continue;
    const amount = /^NZD ([\d,]+)(?:\.(\d{1,2}))?$/u.exec(row.itemizedTotalPriceText.trim());
    if (!amount) continue;
    const amountMinor = Number(amount[1].replaceAll(",", "")) * 100 + Number((amount[2] ?? "").padEnd(2, "0"));
    // The source's policy-modal selector identifies the physical room and offer row, including meal variants.
    // Numeric suffixes are opaque: they are not interpreted as a breakfast, guest, or inventory code.
    const selectors = [...new Set([...row.sourceText.matchAll(/#policyModal_([\d_]+)\b/gu)].map(m => m[1]))];
    if (selectors.length !== 1 || !selectors[0].startsWith(`${row.unitExternalId}_${row.ratePlanId}_`)) continue;
    const mealPlan = row.mealPlan?.toUpperCase() === "BREAKFAST INCLUDED" ? "BREAKFAST_INCLUDED"
      : /\bbreakfast NZD [\d,]+(?:\.\d{1,2})?\b/iu.test(row.feeInclusionText) ? "BREAKFAST_EXTRA" : "UNKNOWN";
    packages.push({ unitExternalId: row.unitExternalId, ratePlanExternalId: row.ratePlanId, amountMinor,
      selector: selectors[0], mealPlan, cancellationPolicy: row.cancellationPolicy ?? "UNKNOWN", paymentTerms: row.paymentTerms ?? "UNKNOWN" });
  }
  // Contradictory snapshots cannot be resolved by selecting the first, cheapest or most expensive row.
  return packages.filter(p => packages.every(other => other.selector !== p.selector || JSON.stringify(other) === JSON.stringify(p)));
}
