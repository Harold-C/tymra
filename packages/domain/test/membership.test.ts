import { describe, expect, it } from "vitest";

import { buildDailyPriceDates } from "../src/query";
import { membershipEntitlements, membershipIsServiceable, spotCheckAllowance, membershipMonthlyPrice, membershipCapacity, entitlementsForMembership, proratedQueryAllowance, cheaperMembershipOptions } from "../src/membership";

describe("membership entitlements", () => {
  it("preserves the approved scale and horizon differences", () => {
    expect(membershipEntitlements.FREE).toMatchObject({ activePricingUnitLimit: 1, dailyPriceCheckHorizonDays: 14, monitoringHorizonDays: 30 });
    expect(membershipEntitlements.HOST).toMatchObject({ activePricingUnitLimit: 1, dailyPriceCheckHorizonDays: 30, monitoringHorizonDays: 90 });
    expect(membershipEntitlements.PRO).toMatchObject({ activePricingUnitLimit: 20, dailyPriceCheckHorizonDays: 90, monitoringHorizonDays: 180 });
    expect(membershipEntitlements.PORTFOLIO).toMatchObject({ activePricingUnitLimit: 50, dailyPriceCheckHorizonDays: 180, monitoringHorizonDays: 365 });
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
    expect(membershipIsServiceable("ACTIVE", null, now, new Date("2026-08-10T00:00:00Z"))).toBe(false);
    expect(membershipIsServiceable("ACTIVE", null, now, new Date("2026-08-11T00:00:00Z"))).toBe(true);
  });

  it("builds an exact New Zealand daily window for every entitlement", () => {
    for (const plan of Object.values(membershipEntitlements)) {
      const dates = buildDailyPriceDates(new Date("2026-08-09T13:00:00Z"), plan.dailyPriceCheckHorizonDays);
      expect(dates).toHaveLength(plan.dailyPriceCheckHorizonDays);
      expect(new Set(dates.map((item) => item.checkIn)).size).toBe(plan.dailyPriceCheckHorizonDays);
    }
  });
});

describe("launch capacity tariff", () => {
  it.each([
    [1, 1900, 9900, 24900], [5, 2900, 9900, 24900], [20, 8900, 9900, 24900],
    [50, 20900, 24600, 24900], [80, 32900, 39300, 36900], [100, 40900, 49100, 44900],
    [150, 60900, 73600, 59900], [200, 80900, 98100, 74900],
  ])("prices %i monitored objects in integer cents", (capacity, host, pro, portfolio) => {
    expect(["HOST", "PRO", "PORTFOLIO"].map(plan => membershipMonthlyPrice(plan as "HOST" | "PRO" | "PORTFOLIO", capacity))).toEqual([host, pro, portfolio]);
  });
  it("normalises included capacity and rejects invalid or unquoted enterprise quantities", () => {
    expect(membershipCapacity("HOST", 2)).toBe(5);
    expect(membershipCapacity("PRO", 1)).toBe(20);
    for (const capacity of [0, -1, 1.5, 201, NaN, Infinity]) expect(() => membershipCapacity("HOST", capacity)).toThrow(RangeError);
  });
  it("has no downward price cliff or cheaper same-plan two-account split through 200", () => {
    for (const plan of ["HOST", "PRO", "PORTFOLIO"] as const) {
      for (let total = 2; total <= 200; total++) {
        expect(membershipMonthlyPrice(plan, total)).toBeGreaterThanOrEqual(membershipMonthlyPrice(plan, total - 1));
        for (let first = 1; first < total; first++) expect(membershipMonthlyPrice(plan, total)).toBeLessThanOrEqual(membershipMonthlyPrice(plan, first) + membershipMonthlyPrice(plan, total - first));
      }
    }
  });
  it("scales quota with purchased capacity and preserves legacy contracts", () => {
    expect(entitlementsForMembership({ plan: "HOST", purchasedCapacity: 5 })).toMatchObject({ monthlyPriceMinor: 2900, rollingSpotCheckLimit: 50 });
    expect(entitlementsForMembership({ plan: "PORTFOLIO", purchasedCapacity: 80 })).toMatchObject({ monthlyPriceMinor: 36900, rollingSpotCheckLimit: 1200, dailyApiRequestLimit: 0 });
    expect(entitlementsForMembership({ plan: "PRO", billingVersion: "legacy-2026" })).toMatchObject({ monthlyPriceMinor: 8900, activePricingUnitLimit: 5, rollingSpotCheckLimit: 60 });
    expect(cheaperMembershipOptions("PRO", 80)).toEqual([{ plan: "PORTFOLIO", capacity: 80, monthlyPriceMinor: 36900 }]);
  });
  it("adds only positive prorated quota and never resets existing usage", () => {
    const input = { currentLimit: 50, oldFullLimit: 50, newFullLimit: 240, periodStart: new Date("2026-10-01Z"), periodEnd: new Date("2026-10-31Z"), changedAt: new Date("2026-10-16Z") };
    expect(proratedQueryAllowance(input)).toBe(145);
    expect(proratedQueryAllowance({ ...input, currentLimit: 145, oldFullLimit: 240 })).toBe(145);
    expect(proratedQueryAllowance({ ...input, newFullLimit: 10 })).toBe(50);
  });
});
