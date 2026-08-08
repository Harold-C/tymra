import { describe, expect, it } from "vitest";

import { canaryPlan, executeCanary, productionPreflight } from "../src/operations/release-safety";

describe("production release safety", () => {
  const source = { key: "eventfinda", enabled: true, status: "PILOT", operationalStatus: "HEALTHY" };

  it("fails closed while schedules are active or a source is unhealthy", () => {
    expect(productionPreflight({ schedulerRuntimeEnabled: false, enabledScheduleCount: 0, sources: [source] })).toEqual({ ready: true, failures: [], technicalValidation: false });
    expect(productionPreflight({ schedulerRuntimeEnabled: true, enabledScheduleCount: 1, sources: [{ ...source, operationalStatus: "DOWN" }] }).ready).toBe(false);
    expect(productionPreflight({ schedulerRuntimeEnabled: false, enabledScheduleCount: 0, requestedSourceKeys: ["eventfinda", "missing-source"], sources: [source] }).failures).toContain("missing-source: source does not exist");
    expect(productionPreflight({ schedulerRuntimeEnabled: false, enabledScheduleCount: 0, requestedSourceKeys: ["expedia"], sources: [{ ...source, key: "expedia" }] }).failures).toContain("expedia: OTA release evidence is missing");
  });

  it("allows development technical validation without release evidence but keeps scheduler guards", () => {
    const degradedExpedia = { ...source, key: "expedia", enabled: false, operationalStatus: "DEGRADED" };
    expect(productionPreflight({ schedulerRuntimeEnabled: false, enabledScheduleCount: 0, technicalValidation: true, requestedSourceKeys: ["expedia"], sources: [degradedExpedia] })).toEqual({ ready: true, failures: [], technicalValidation: true });
    expect(productionPreflight({ schedulerRuntimeEnabled: true, enabledScheduleCount: 1, technicalValidation: true, requestedSourceKeys: ["expedia"], sources: [degradedExpedia] }).ready).toBe(false);
  });

  it("rejects OTA sources outside the active six-source scope", () => {
    const inactive = { ...source, key: "wotif", enabled: false };
    expect(productionPreflight({ schedulerRuntimeEnabled: false, enabledScheduleCount: 0, requestedSourceKeys: ["wotif"], sources: [inactive] }).failures)
      .toContain("wotif: OTA source is outside the active six-source scope");
  });

  it("creates a deterministic bounded canary and rollback plan", () => {
    expect(canaryPlan(["ticketek_events", "eventfinda", "eventfinda"])).toMatchObject({
      mode: "READ_ONLY_BOUNDED", sources: ["eventfinda", "ticketek_events"], passes: 2,
    });
  });

  it("executes passes in order and stops at the first failed gate", async () => {
    const result = await executeCanary(["ticketmaster", "eventfinda"], async (sourceKey, pass) => ({
      sourceKey, pass, configurationUnchanged: true, schedulesUnchanged: true,
      parserFailures: sourceKey === "eventfinda" && pass === 2 ? 1 : 0,
      repeatRowGrowth: 0, remoteEvidenceRemaining: 0,
    }));
    expect(result.passed).toBe(false);
    expect(result.stoppedBy).toBe("parser_failure");
    expect(result.results.map(({ sourceKey, pass }) => `${sourceKey}:${pass}`)).toEqual(["eventfinda:1", "eventfinda:2"]);
  });

  it("attempts every requested pass during development technical validation", async () => {
    const result = await executeCanary(["ticketmaster", "eventfinda"], async (sourceKey, pass) => ({
      sourceKey, pass, configurationUnchanged: true, schedulesUnchanged: true,
      parserFailures: sourceKey === "eventfinda" && pass === 1 ? 1 : 0,
      repeatRowGrowth: 0, remoteEvidenceRemaining: 0,
    }), { technicalValidation: true });
    expect(result.passed).toBe(false);
    expect(result.mode).toBe("DEVELOPMENT_TECHNICAL_VALIDATION");
    expect(result.results.map(({ sourceKey, pass }) => `${sourceKey}:${pass}`)).toEqual(["eventfinda:1", "eventfinda:2", "ticketmaster:1", "ticketmaster:2"]);
    expect(result.conclusion).toContain("all requested development validation passes were attempted");
  });
});
