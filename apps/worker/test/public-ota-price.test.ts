import { describe, expect, it } from "vitest";

import { publicOtaPrice } from "../src/services/worker-service";
import { otaRateExtractionSchema } from "@tymra/providers";

describe("public OTA price return invariant", () => {
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
