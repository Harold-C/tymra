import { describe, expect, it } from "vitest";
import { eligiblePanelIds, fixedPanelCoverage, freezeMarketPanel, planChristchurchPilot, type FixedMarketMember } from "../src/fixed-market-panel";
import { unverifiedSampleLabels } from "../src/market-sample-labels";
const member = (id: string): FixedMarketMember => {
  const proof = { sourceRef: "fixture:verified", observedAt: "2026-10-14T00:00:00Z", methodVersion: "fixture-v1" };
  const labels = unverifiedSampleLabels("Hotel", proof.sourceRef, proof.observedAt);
  labels.geography = { regionId: "region", regionName: "Canterbury", authorityId: "city", authorityName: "Christchurch City", localityId: "suburb", localityName: "Fixture suburb", latitude: -43.5, longitude: 172.6, boundaryVersion: "fixture-v1", assignmentMethod: "POINT_IN_POLYGON", ...proof };
  labels.capacityGuests = { value: 2, unit: "guests", ...proof };
  labels.unitKind = { value: "PRIVATE_ROOM", rawValue: "fixture private room", ...proof };
  return { propertyId: id, unitId: `unit-${id}`, listingId: `listing-${id}`, source: "booking", category: "Hotel", market: "Christchurch City", profileKey: "nz-desktop-anonymous-v1", termsKey: "terms-v1", identityReviewed: true, labels };
};
describe("fixed Christchurch panel and disabled four-week plan", () => {
  it("supports a separate two-night plan without changing query counts or defaulting existing plans to two nights", () => {
    const panel = freezeMarketPanel([member("a")], "2026-10-15", undefined, 1);
    const one = planChristchurchPilot(panel, "2026-10-19");
    const two = planChristchurchPilot(panel, "2026-10-19", 2);
    expect(one.query.nights).toBe(1); expect(two.query.nights).toBe(2);
    expect(two.budget.plannedRateQueries).toBe(one.budget.plannedRateQueries);
    expect(two.days[0].stayDates[0].checkOut).toBe("2026-10-22");
    expect(two.cohortId).not.toBe(one.cohortId);
    expect(two.executionEnabled).toBe(false);
    expect(() => planChristchurchPilot(panel, "2026-10-19", 3 as 2)).toThrow();
  });
  it("never silently replaces, adds, removes or repins frozen members", () => {
    const panel = freezeMarketPanel([member("a"), member("b")], "2026-10-14");
    expect(freezeMarketPanel([{ ...member("a"), listingId: "new-platform" }, member("c")], "2026-10-20", panel)).toEqual(panel);
    const coverage = fixedPanelCoverage(panel, [{ ...member("a"), profileKey: "different-context" }, member("b"), member("c")]);
    expect(coverage).toEqual({ expected: 2, matched: 1, missingPropertyIds: ["a"], shortfall: 38 });
  });
  it("rejects duplicate properties instead of counting their rooms twice", () => {
    expect(() => freezeMarketPanel([member("a"), { ...member("a"), unitId: "second-room" }], "2026-10-14")).toThrow();
  });
  it("requires reviewed geographic labels and records boundary drift as a gap", () => {
    expect(() => freezeMarketPanel([{ ...member("a"), labels: { ...member("a").labels, geography: null } }], "2026-10-14")).toThrow();
    const frozen = freezeMarketPanel([member("a")], "2026-10-14");
    const changed = member("a"); changed.labels.geography!.boundaryVersion = "new-boundary";
    expect(fixedPanelCoverage(frozen, [changed]).matched).toBe(0);
  });
  it("protects anchors against ranking changes, outages and rotating takeover", () => {
    const active = [{ sellableUnitId: "a", membershipType: "ANCHOR" as const }, { sellableUnitId: "b", membershipType: "ROTATING" as const }];
    expect(eligiblePanelIds("ANCHOR", ["c", "b", "a"], active)).toEqual(["a"]);
    expect(eligiblePanelIds("ANCHOR", ["c", "b"], active)).toEqual([]);
    expect(eligiblePanelIds("ROTATING", ["a", "b", "c"], active)).toEqual(["b", "c"]);
  });
  it("plans 28 NZ calendar days, locks stay dates and deduplicates overlapping baskets", () => {
    const plan = planChristchurchPilot(freezeMarketPanel([member("a")], "2026-10-14"), "2026-10-19");
    expect(plan.days).toHaveLength(28); expect(plan.proposedEnd).toBe("2026-11-15");
    expect(plan.lockedStayDates).toEqual(["2026-11-09", "2026-11-15"]);
    expect(plan.days[0].stayDates.some(date => date.checkIn === "2026-11-09")).toBe(true);
    expect(plan.days[1].stayDates.some(date => date.checkIn === "2026-11-09")).toBe(true);
    expect(plan.days[27].stayDates.every(date => date.checkIn > plan.days[27].observedOn)).toBe(true);
    for (const day of plan.days) {
      expect(new Set(day.stayDates.map(date => date.checkIn)).size).toBe(day.stayDates.length);
      expect(day.maximumCaptureExecutions).toBeLessThanOrEqual(plan.budget.dailyHardCeiling);
    }
    expect(plan.executionEnabled).toBe(false); expect(plan.budget.moneyBudgetNZD).toBeNull();
    expect(plan.activationBlockers).toContain("FIXED_PANEL_SHORTFALL_39");
    expect(plan.days[0].plannedRateQueries).toBeGreaterThan(plan.days[0].pinnedMemberQueries);
  });
  it("rejects invalid dates and never implicitly enables a full panel", () => {
    const panel = freezeMarketPanel(Array.from({ length: 40 }, (_, i) => member(String(i))), "2026-10-14");
    expect(() => planChristchurchPilot(panel, "2026-02-30")).toThrow();
    expect(planChristchurchPilot(panel, "2026-10-19").activationBlockers).toContain("PRODUCTION_AUTHORIZATION_REQUIRED");
  });
  it("accepts an evidence-led size while retaining budget blockers and frozen capacity", () => {
    const members = Array.from({ length: 60 }, (_, i) => member(String(i)));
    const panel = freezeMarketPanel(members, "2026-10-14", undefined, 60);
    const plan = planChristchurchPilot(panel, "2026-10-19");
    expect(plan.budget.capacityProperties).toBe(60);
    expect(plan.budget.preflightCaptureReserve).toBe(144);
    expect(plan.activationBlockers).toContain("DAILY_CAPACITY_EXCEEDS_UNAPPROVED_BUDGET");
    expect(plan.executionEnabled).toBe(false);
    expect(freezeMarketPanel([], "2026-10-20", panel, 80).targetSize).toBe(60);
    expect(() => freezeMarketPanel(members, "2026-10-14", undefined, 59)).toThrow();
  });
});
