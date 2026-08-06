import { describe, expect, it } from "vitest";

import {
  buildFormalThirtyDayDates,
  buildNationalDateBasket,
  calculateAvailabilityCompression,
  calculatePriceDistribution,
  collapseDuplicateListings,
  createQuerySignature,
  evaluateBlockingQualityGates,
  negativeCacheTtlSeconds,
  type ComparableRate,
} from "../src";

const baseQuery = {
  sourceId: "booking",
  listingId: "listing-1",
  sellableUnitId: "unit-1",
  checkIn: new Date("2026-08-01T12:00:00Z"),
  nights: 1,
  adults: 2,
  childrenAges: [7, 2],
  units: 1,
  unitConstraints: { bedrooms: 1, accessible: false },
  mealPlan: "ANY_PUBLIC",
  cancellationPolicy: "ANY_PUBLIC",
  ratePlan: "PUBLIC",
  currency: "NZD" as const,
  taxAndFeePolicy: "MANDATORY_INCLUDED",
  collectionProfileId: "profile-v1",
  publicRateContext: "PUBLIC_ANONYMOUS",
  querySemanticsVersion: "v1",
};

describe("Worker baseline domain contracts", () => {
  it("creates a stable QuerySignature independent of object and child-age order", () => {
    const first = createQuerySignature(baseQuery);
    const second = createQuerySignature({ ...baseQuery, childrenAges: [2, 7], unitConstraints: { accessible: false, bedrooms: 1 } });
    expect(first.hash).toBe(second.hash);
    expect(first.payload.checkIn).toBe("2026-08-01");
  });

  it("builds deterministic preview and formal date baskets", () => {
    const now = new Date("2026-07-18T08:00:00Z");
    expect(buildNationalDateBasket(now).length).toBeGreaterThanOrEqual(5);
    const formal = buildFormalThirtyDayDates(now);
    expect(formal).toHaveLength(30);
    expect(formal[0].checkIn).toBe("2026-07-19");
    expect(new Set(formal.map((item) => item.checkIn)).size).toBe(30);
  });

  it("deduplicates OTA listings by SellableUnit before distribution and compression", () => {
    const now = new Date("2026-07-18T00:00:00Z");
    const rates: ComparableRate[] = [
      { sellableUnitId: "u1", listingId: "a", amountMinor: 20_000, availabilityStatus: "AVAILABLE", comparabilityScore: 0.8, collectedAt: now, feeComplete: true },
      { sellableUnitId: "u1", listingId: "b", amountMinor: 99_000, availabilityStatus: "AVAILABLE", comparabilityScore: 0.5, collectedAt: now, feeComplete: true },
      { sellableUnitId: "u2", listingId: "c", amountMinor: 24_000, availabilityStatus: "MINIMUM_STAY_RESTRICTION", comparabilityScore: 0.9, collectedAt: now, feeComplete: true },
      { sellableUnitId: "u3", listingId: "d", amountMinor: null, availabilityStatus: "SOURCE_FAILURE", comparabilityScore: 0.9, collectedAt: now, feeComplete: false },
    ];
    expect(collapseDuplicateListings(rates)).toHaveLength(3);
    expect(calculatePriceDistribution(rates)).toMatchObject({ count: 1, weightedMedianMinor: 20_000 });
    expect(calculateAvailabilityCompression(rates)).toMatchObject({ eligible: 3, available: 1, restricted: 1, sourceFailure: 1, compression: 0.5 });
  });

  it("blocks publication on fee, coherence and competitor failures", () => {
    const flags = evaluateBlockingQualityGates({ targetRatePresent: true, unitConfirmed: true, feesKnown: false, comparable: false, sourceAvailable: true, severeConflict: false, freshnessExpired: false, snapshotCoherent: false, competitorCount: 2 });
    expect(flags).toEqual(expect.arrayContaining(["FEES_UNKNOWN", "COMPARABILITY_FAILURE", "SNAPSHOT_INCOHERENT", "COMPETITOR_COUNT_BELOW_3"]));
    expect(negativeCacheTtlSeconds("SOLD_OUT")).toBe(1_800);
    expect(negativeCacheTtlSeconds("BLOCKED")).toBe(86_400);
  });
});
