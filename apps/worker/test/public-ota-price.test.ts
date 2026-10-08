import { describe, expect, it } from "vitest";

import { publicOtaPrice } from "../src/services/ota-price";
import { otaRateExtractionSchema } from "@tymra/providers/ota-argus-contracts";

describe("public OTA price return invariant", () => {
  it.each(["REFERENCE_ONLY", "MEMBER_ONLY", "MOBILE_ONLY", "APP_ONLY", "PROMOTION", "COUPON", "CASHBACK", "NEW_USER", "COINS", "PACKAGE", "UNKNOWN"])("does not promote a %s amount into a public price", (rateFence) => {
    expect(publicOtaPrice({ rateFence, basePriceMinor: 27500, mandatoryFeesMinor: 0, taxesMinor: 0, totalPriceMinor: 27500 }, 1)).toBeNull();
  });
  it.each(["PUBLIC", "PUBLIC_SIGNED_OUT", "PUBLIC_ANONYMOUS"])("keeps the existing %s public-price contract", (rateFence) => {
    expect(publicOtaPrice({ rateFence, basePriceMinor: 24000, mandatoryFeesMinor: 0, taxesMinor: 0, totalPriceMinor: 24000 }, 1)).toMatchObject({ amountMinor: 24000, feeCompleteness: "COMPLETE" });
  });
  it("preserves bounded reference evidence in the receiving contract and refuses an available/priced reference-only result", () => {
    const base = { sourceListingId: "listing", unitExternalId: "room", checkIn: "2026-10-14", checkOut: "2026-10-15", currency: "NZD",
      basePriceMinor: null, mandatoryFeesMinor: null, taxesMinor: null, optionalFeesMinor: null, totalPriceMinor: null,
      availabilityStatus: "UNKNOWN", restrictionReason: "Only reference prices displayed", minimumStay: null,
      mealPlan: "UNKNOWN", cancellationPolicy: "UNKNOWN", paymentTerms: "UNKNOWN", rateFence: "REFERENCE_ONLY",
      sourceUrl: "https://www.booking.com/hotel/nz/example.html", collectedAt: "2026-10-07T00:00:00.000Z", qualityFlags: ["REFERENCE_PRICES_ONLY"], fieldSources: {},
      referencePrices: [{ kind: "ORIGINAL", amountMinor: 27500, ratePlanExternalId: "member", sourceText: "Original price NZD 275" }] };
    expect(otaRateExtractionSchema.parse(base).referencePrices).toEqual(base.referencePrices);
    for (const changed of [{ availabilityStatus: "AVAILABLE" }, { totalPriceMinor: 27500 }, { nightlyPriceMinor: 27500 }, { referencePrices: [] }, { referencePrices: [{ ...base.referencePrices[0], amountMinor: -1 }] }]) {
      expect(otaRateExtractionSchema.safeParse({ ...base, ...changed }).success).toBe(false);
    }
  });
  it("accepts a source-evidenced complete bundled total without treating unknown components as itemized", () => {
    const rate = { basePriceMinor: null, mandatoryFeesMinor: null, taxesMinor: null, totalPriceMinor: 24200, priceStatus: "BUNDLED" as const, totalIncludesMandatoryFees: true, fieldSources: { totalIncludesMandatoryFees: "Total includes all taxes and fees" } };
    expect(publicOtaPrice(rate, 2)).toMatchObject({ amountMinor: 24200, feeCompleteness: "COMPLETE", basis: "STAY_TOTAL" });
    expect(publicOtaPrice({ ...rate, fieldSources: {} }, 2)?.feeCompleteness).toBe("UNKNOWN");
    expect(publicOtaPrice({ ...rate, totalIncludesMandatoryFees: false }, 2)?.feeCompleteness).toBe("UNKNOWN");
    expect(publicOtaPrice({ ...rate, totalIncludesMandatoryFees: false, priceStatus: "ITEMIZED" }, 2)?.feeCompleteness).toBe("UNKNOWN");
    const base = { ...rate, sourceListingId: "listing", unitExternalId: "room", checkIn: "2026-10-07", checkOut: "2026-10-09", currency: "NZD", optionalFeesMinor: null, availabilityStatus: "AVAILABLE", restrictionReason: null, minimumStay: null, mealPlan: "ROOM_ONLY", cancellationPolicy: "STANDARD", paymentTerms: "PAY_NOW", rateFence: "PUBLIC", sourceUrl: "https://www.booking.com/hotel/nz/example.html", collectedAt: "2026-09-30T00:00:00.000Z", qualityFlags: [] };
    expect(otaRateExtractionSchema.safeParse(base).success).toBe(true);
    expect(otaRateExtractionSchema.safeParse({ ...base, fieldSources: {} }).success).toBe(false);
    expect(otaRateExtractionSchema.safeParse({ ...base, totalPriceMinor: null }).success).toBe(false);
  });
  it("returns a bundled stay total without inventing fee components", () => {
    expect(publicOtaPrice({
      basePriceMinor: null,
      mandatoryFeesMinor: null,
      taxesMinor: null,
      totalPriceMinor: 24_200,
      priceStatus: "BUNDLED",
    }, 2)).toMatchObject({ amountMinor: 24_200, basis: "STAY_TOTAL", feeCompleteness: "UNKNOWN", effectiveNightlyMinor: 12_100 });
  });

  it("returns a nightly-only partial price without multiplying it into a total", () => {
    expect(publicOtaPrice({
      basePriceMinor: null,
      mandatoryFeesMinor: null,
      taxesMinor: null,
      totalPriceMinor: null,
      nightlyPriceMinor: 26_900,
      priceStatus: "PARTIAL",
    }, 3)).toMatchObject({ amountMinor: 26_900, basis: "NIGHTLY", feeCompleteness: "PARTIAL", effectiveNightlyMinor: 26_900 });
  });

  it("returns null only when the source publishes no amount", () => {
    expect(publicOtaPrice({ basePriceMinor: null, mandatoryFeesMinor: null, taxesMinor: null, totalPriceMinor: null, priceStatus: "UNAVAILABLE" }, 1)).toBeNull();
  });
});
