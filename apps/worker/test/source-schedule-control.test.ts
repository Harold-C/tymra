import { describe, expect, it } from "vitest";

import { sourceSchedulingBlockers } from "../src/services/worker-service";
import { automaticSchedulingAllowed } from "../src/operations/source-access";

const readySource = {
  providerType: "PUBLIC",
  enabled: true,
  operationalStatus: "HEALTHY",
};

describe("source schedule control", () => {
  it("never permits automatic scheduling in development", () => {
    expect(automaticSchedulingAllowed("development", true)).toBe(false);
    expect(automaticSchedulingAllowed("development", false)).toBe(false);
    expect(automaticSchedulingAllowed("test", true)).toBe(true);
    expect(automaticSchedulingAllowed("production", true)).toBe(true);
  });

  it("allows only an enabled, healthy public source", () => {
    expect(sourceSchedulingBlockers(readySource, true)).toEqual([]);
    expect(sourceSchedulingBlockers({
      ...readySource,
      enabled: false,
      operationalStatus: "DEGRADED",
    }, true)).toEqual([
      "source is not enabled",
      "source is not operationally available",
    ]);
  });

  it("rejects non-public sources and missing adapters", () => {
    expect(sourceSchedulingBlockers({ ...readySource, providerType: "OTA" }, false)).toEqual([
      "source is not a public-data source",
      "no public adapter is registered",
    ]);
  });

  it("requires healthy sources in every environment", () => {
    const pending = {
      ...readySource,
      operationalStatus: "DEGRADED",
    };
    expect(sourceSchedulingBlockers(pending, true, "development")).toContain("source is not operationally available");
    expect(sourceSchedulingBlockers(pending, true, "production")).toContain("source is not operationally available");
    expect(sourceSchedulingBlockers({ ...pending, operationalStatus: "DOWN" }, true, "development"))
      .toContain("source is not operationally available");
  });
});
