import { describe, expect, it } from "vitest";

import { canaryPlan, productionPreflight } from "../src/operations/release-safety";

describe("production release safety", () => {
  const source = { key: "eventfinda", enabled: true, status: "APPROVED", operationalStatus: "HEALTHY", rightsAllowStorage: true, rightsAllowDerivedAnalysis: true };

  it("fails closed while schedules are active or rights are incomplete", () => {
    expect(productionPreflight({ schedulerRuntimeEnabled: false, enabledScheduleCount: 0, sources: [source] })).toEqual({ ready: true, failures: [] });
    expect(productionPreflight({ schedulerRuntimeEnabled: true, enabledScheduleCount: 1, sources: [{ ...source, rightsAllowStorage: false }] }).ready).toBe(false);
    expect(productionPreflight({ schedulerRuntimeEnabled: false, enabledScheduleCount: 0, requestedSourceKeys: ["eventfinda", "missing-source"], sources: [source] }).failures).toContain("missing-source: source does not exist");
  });

  it("creates a deterministic bounded canary and rollback plan", () => {
    expect(canaryPlan(["ticketek_events", "eventfinda", "eventfinda"])).toMatchObject({
      mode: "READ_ONLY_BOUNDED", sources: ["eventfinda", "ticketek_events"], passes: 2,
    });
  });
});
