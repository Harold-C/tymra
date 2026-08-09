import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { deriveOtaMarketSignals, type OtaSignalObservation } from "../src/collection/ota-market-signals";

describe("OTA time-series market signals", () => {
  it("emits price, availability and restriction signals only from matched multi-provider samples", () => {
    const asOf = new Date("2026-08-09T00:00:00Z");
    const pairs = [
      pair("booking", "one", 20_000, 22_000, "AVAILABLE", "AVAILABLE", false, true),
      pair("booking", "two", 21_000, 23_000, "AVAILABLE", "SOLD_OUT", false, true),
      pair("airbnb", "three", 22_000, 24_000, "AVAILABLE", "MINIMUM_STAY_RESTRICTION", false, true),
      pair("airbnb", "four", 23_000, 25_000, "AVAILABLE", "AVAILABLE", false, false),
      pair("booking", "five", 24_000, 26_000, "AVAILABLE", "AVAILABLE", false, false),
    ].flatMap((factory) => factory(asOf));
    const signals = deriveOtaMarketSignals(pairs, asOf);
    assert.deepEqual(signals.map((signal) => signal.type), ["AVAILABILITY_TIGHTENING", "PRICE_RISING", "RESTRICTION_INCREASING"]);
    assert.ok(signals.every((signal) => (signal.evidence.metrics as { matchedListingCount: number }).matchedListingCount === 5));
  });

  it("fails closed for one provider or fewer than three matched listings", () => {
    const asOf = new Date("2026-08-09T00:00:00Z");
    const observations = [pair("booking", "one", 20_000, 25_000), pair("booking", "two", 20_000, 25_000)].flatMap((factory) => factory(asOf));
    assert.deepEqual(deriveOtaMarketSignals(observations, asOf), []);
  });
});

function pair(providerKey: string, listingId: string, baselinePrice: number, currentPrice: number, baselineAvailability = "AVAILABLE", currentAvailability = "AVAILABLE", baselineRestricted = false, currentRestricted = false) {
  return (asOf: Date): OtaSignalObservation[] => [
    observation(providerKey, listingId, baselinePrice, baselineAvailability, baselineRestricted, new Date(asOf.getTime() - 48 * 3_600_000)),
    observation(providerKey, listingId, currentPrice, currentAvailability, currentRestricted, new Date(asOf.getTime() - 2 * 3_600_000)),
  ];
}

function observation(providerKey: string, listingId: string, price: number, availabilityStatus: string, restricted: boolean, collectedAt: Date): OtaSignalObservation {
  return { id: `${providerKey}:${listingId}:${collectedAt.toISOString()}`, marketKey: "christchurch", region: "Canterbury", providerKey, listingId, checkIn: new Date("2026-08-14T00:00:00Z"), checkOut: new Date("2026-08-15T00:00:00Z"), adults: 2, units: 1, collectedAt, effectiveNightlyTotalMinor: price, availabilityStatus, minimumStay: restricted ? 2 : null, restrictionReason: restricted ? "minimum stay" : null, feeCompleteness: "COMPLETE" };
}
