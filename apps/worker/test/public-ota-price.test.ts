import { describe, expect, it } from "vitest";

import { publicOtaPrice } from "../src/services/worker-service";

describe("public OTA price return invariant", () => {
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
