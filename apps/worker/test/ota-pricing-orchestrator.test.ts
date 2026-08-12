import { describe, expect, it } from "vitest";

import { comparableDiscoveryRunIsTerminal } from "../src/services/ota-pricing-orchestrator";

describe("OTA comparable discovery orchestration", () => {
  it("does not recreate completed source runs when a durable Argus job resumes", () => {
    for (const status of ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"]) {
      expect(comparableDiscoveryRunIsTerminal(status)).toBe(true);
    }
    expect(comparableDiscoveryRunIsTerminal("RUNNING")).toBe(false);
    expect(comparableDiscoveryRunIsTerminal("PENDING")).toBe(false);
  });
});
