import { describe, expect, it } from "vitest";

import { buildDailyPriceDates } from "../src/query";
import { membershipEntitlements, membershipIsServiceable, spotCheckAllowance } from "../src/membership";

describe("membership entitlements", () => {
  it("preserves the approved scale and horizon differences", () => {
    expect(membershipEntitlements.FREE).toMatchObject({ activePricingUnitLimit: 1, dailyPriceCheckHorizonDays: 14, monitoringHorizonDays: 30 });
    expect(membershipEntitlements.HOST).toMatchObject({ activePricingUnitLimit: 1, dailyPriceCheckHorizonDays: 30, monitoringHorizonDays: 90 });
    expect(membershipEntitlements.PRO).toMatchObject({ activePricingUnitLimit: 5, dailyPriceCheckHorizonDays: 90, monitoringHorizonDays: 180 });
    expect(membershipEntitlements.PORTFOLIO).toMatchObject({ activePricingUnitLimit: 20, dailyPriceCheckHorizonDays: 180, monitoringHorizonDays: 365 });
  });

  it("gives Free one lifetime initial report plus one rolling spot check", () => {
    expect(spotCheckAllowance({ plan: "FREE", initialReportConsumed: false, rollingSpotChecks: 0 })).toEqual({ allowed: true, usageType: "INITIAL_REPORT", remainingAfter: 1 });
    expect(spotCheckAllowance({ plan: "FREE", initialReportConsumed: true, rollingSpotChecks: 0 })).toEqual({ allowed: true, usageType: "SPOT_CHECK", remainingAfter: 0 });
    expect(spotCheckAllowance({ plan: "FREE", initialReportConsumed: true, rollingSpotChecks: 1 })).toEqual({ allowed: false, usageType: null, remainingAfter: 0 });
  });

  it("allows only active or in-grace memberships to collect", () => {
    const now = new Date("2026-08-10T00:00:00Z");
    expect(membershipIsServiceable("ACTIVE", null, now)).toBe(true);
    expect(membershipIsServiceable("PAST_DUE", new Date("2026-08-11T00:00:00Z"), now)).toBe(true);
    expect(membershipIsServiceable("PAST_DUE", new Date("2026-08-09T00:00:00Z"), now)).toBe(false);
    expect(membershipIsServiceable("CANCELLED", null, now)).toBe(false);
  });

  it("builds an exact New Zealand daily window for every entitlement", () => {
    for (const plan of Object.values(membershipEntitlements)) {
      const dates = buildDailyPriceDates(new Date("2026-08-09T13:00:00Z"), plan.dailyPriceCheckHorizonDays);
      expect(dates).toHaveLength(plan.dailyPriceCheckHorizonDays);
      expect(new Set(dates.map((item) => item.checkIn)).size).toBe(plan.dailyPriceCheckHorizonDays);
    }
  });
});
