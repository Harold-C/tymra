import { describe, expect, it } from "vitest";
import { adminGrantExpiry, adminGrantHistoryGrace, adminMembershipMonth, effectiveMembership, membershipHistoryCutoff } from "../src/admin-membership";
import { entitlementsForMembership } from "../src/membership";

const now = new Date("2026-10-11T12:00:00Z");
const base = { plan: "FREE" as const, status: "ACTIVE" as const, version: 2, billingVersion: "launch-2026", purchasedCapacity: null, periodSpotCheckLimit: null, currentPeriodStart: null, currentPeriodEnd: null, graceEndsAt: null, cancelAtPeriodEnd: false, pendingPlan: null, pendingCapacity: null, pendingChangeKind: null, historyGraceUntil: null, historyGraceCutoff: null };
const grant = { plan: "PORTFOLIO" as const, capacity: 100, expiresAt: null, revokedAt: null, version: 3, historyGraceUntil: null, historyGraceCutoff: null };

describe("administrator-granted membership", () => {
  it("grants 100 Portfolio objects permanently without inventing a financial subscription", () => {
    const effective = effectiveMembership({ ...base, adminGrant: grant }, now);
    expect(effective).toMatchObject({ plan: "PORTFOLIO", purchasedCapacity: 100, version: 5, entitlementSource: "ADMIN", billingVersion: "admin-grant-2026" });
    expect(entitlementsForMembership(effective)).toMatchObject({ activePricingUnitLimit: 100, monthlyPriceMinor: 0, rollingSpotCheckLimit: 1500, portfolioView: true });
    expect(base).toMatchObject({ plan: "FREE", currentPeriodStart: null, currentPeriodEnd: null });
    expect(effectiveMembership({ ...base, adminGrant: grant }, new Date("2040-10-01T00:00:00Z")).plan).toBe("PORTFOLIO");
  });
  it("uses New Zealand calendar months across DST and year boundaries", () => {
    expect(adminMembershipMonth(now)).toEqual({ start: new Date("2026-09-30T11:00:00Z"), end: new Date("2026-10-31T11:00:00Z") });
    expect(adminMembershipMonth(new Date("2026-12-31T12:00:00Z"))).toEqual({ start: new Date("2026-12-31T11:00:00Z"), end: new Date("2027-01-31T11:00:00Z") });
    expect(adminMembershipMonth(new Date("2027-04-12T00:00:00Z"))).toEqual({ start: new Date("2027-03-31T11:00:00Z"), end: new Date("2027-04-30T12:00:00Z") });
  });
  it("includes the selected NZ expiry day and rejects invalid or past dates", () => {
    expect(adminGrantExpiry("2026-10-12", now)).toEqual(new Date("2026-10-12T11:00:00Z"));
    expect(adminGrantExpiry(null, now)).toBeNull();
    for (const value of ["2026-02-30", "2026-10-10", "not-a-date"]) expect(() => adminGrantExpiry(value, now)).toThrow();
  });
  it("returns the base plan at expiry and after revocation while retaining old history for 30 days", () => {
    const expiresAt = new Date(now.getTime() + 1000);
    const expiring = { ...grant, expiresAt };
    expect(effectiveMembership({ ...base, adminGrant: expiring }, now).plan).toBe("PORTFOLIO");
    const expired = effectiveMembership({ ...base, adminGrant: expiring }, expiresAt);
    expect(expired).toMatchObject({ plan: "FREE", entitlementSource: "SUBSCRIPTION", version: 5 });
    expect(membershipHistoryCutoff(expired, expiresAt)).toEqual(new Date(expiresAt.getTime() - 730 * 86400000));
    expect(membershipHistoryCutoff(expired, new Date(expiresAt.getTime() + 31 * 86400000))).toEqual(new Date(expiresAt.getTime() + 86400000));
    expect(effectiveMembership({ ...base, adminGrant: { ...grant, revokedAt: now } }, now).plan).toBe("FREE");
  });
  it("keeps the previous-tier read grace after a manual downgrade", () => {
    const grace = adminGrantHistoryGrace(grant, now);
    const reduced = effectiveMembership({ ...base, adminGrant: { ...grant, plan: "HOST", capacity: 5, ...grace } }, now);
    expect(membershipHistoryCutoff(reduced, now)).toEqual(grace.historyGraceCutoff);
    expect(entitlementsForMembership(reduced).activePricingUnitLimit).toBe(5);
  });
});
