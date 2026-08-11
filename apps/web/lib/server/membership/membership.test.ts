import { describe, expect, it } from "vitest";

import { membershipHistoryCutoff } from "./membership";

describe("membership history access", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");

  it("keeps the plan history visible during the 30-day cancellation read-only period", () => {
    const cutoff = membershipHistoryCutoff({ plan: "HOST", status: "CANCELLED", currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z") }, now);
    expect(cutoff.toISOString()).toBe("2026-02-08T00:00:00.000Z");
  });

  it("hides membership history after cancellation access expires", () => {
    const cutoff = membershipHistoryCutoff({ plan: "PORTFOLIO", status: "CANCELLED", currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z") }, now);
    expect(cutoff.getTime()).toBeGreaterThan(now.getTime());
  });

  it("uses the persisted cancellation update time when no billing period end exists", () => {
    const cutoff = membershipHistoryCutoff({ plan: "FREE", status: "CANCELLED", currentPeriodEnd: null, updatedAt: new Date("2026-06-01T00:00:00.000Z") }, now);
    expect(cutoff.getTime()).toBeGreaterThan(now.getTime());
  });
});
