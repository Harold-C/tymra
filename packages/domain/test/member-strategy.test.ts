import { describe, expect, it } from "vitest";
import { memberReviewRange, memberStrategySchema, selectMemberComparables } from "../src/member-strategy";

describe("member strategy evidence limits", () => {
  it("clamps a review range without changing any observed price", () => {
    const strategy = memberStrategySchema.parse({ minimumPriceMinor: 10500, maximumPriceMinor: 11500, maximumAdjustmentPercent: 10 });
    expect(memberReviewRange(strategy, 10000, 12000, "HIGH")).toEqual({ lowMinor: 10800, highMinor: 11000 });
    expect(memberReviewRange(strategy, null, 12000, "HIGH")).toBeNull();
    expect(memberReviewRange(strategy, 10000, 12000, "LOW")).toBeNull();
    expect(memberReviewRange(strategy, 10000, 30000, "HIGH")).toBeNull();
  });
  it("rejects contradictory boundaries and pins", () => {
    expect(() => memberStrategySchema.parse({ minimumPriceMinor: 20000, maximumPriceMinor: 10000 })).toThrow();
    expect(() => memberStrategySchema.parse({ pinnedComparableUnitIds: ["a"], excludedComparableUnitIds: ["a"] })).toThrow();
  });
  it("never counts multiple OTA channels as three preferred comparables", () => {
    const candidates = ["a", "a", "a", "b", "c", "d"].map(sellableUnitId => ({ sellableUnitId }));
    expect(selectMemberComparables(candidates, memberStrategySchema.parse({ pinnedComparableUnitIds: ["a"] }))).toHaveLength(6);
    expect(selectMemberComparables(candidates, memberStrategySchema.parse({ pinnedComparableUnitIds: ["a", "b", "c"] })).map(item => item.sellableUnitId)).not.toContain("d");
    expect(selectMemberComparables(candidates, memberStrategySchema.parse({ excludedComparableUnitIds: ["a"] })).map(item => item.sellableUnitId)).toEqual(["b", "c", "d"]);
  });
});
