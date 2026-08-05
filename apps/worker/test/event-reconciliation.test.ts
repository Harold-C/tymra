import { describe, expect, it } from "vitest";

import { buildEventReconciliationReport } from "../src/operations/event-reconciliation";

describe("cross-source event reconciliation", () => {
  it("separates exact shared occurrences, time conflicts and manual review", () => {
    const base = { title: "Test Match", venue: "Town Hall", city: "Christchurch", links: [] };
    const report = buildEventReconciliationReport([
      { ...base, occurrenceId: "shared", canonicalKey: "shared-key", startsAt: new Date("2026-08-10T08:00:00Z"), links: [
        { sourceKey: "eventfinda", sourceOccurrenceId: "ef-1", externalId: "1", matchMethod: "EXACT_IDENTITY_V1" },
        { sourceKey: "ticketmaster", sourceOccurrenceId: "tm-1", externalId: "2", matchMethod: "EXACT_IDENTITY_V1" },
      ] },
      { ...base, occurrenceId: "later", canonicalKey: "later-key", startsAt: new Date("2026-08-10T09:00:00Z"), links: [
        { sourceKey: "eventfinda", sourceOccurrenceId: "ef-2", externalId: "3", matchMethod: "MANUAL" },
      ] },
    ], ["eventfinda", "ticketmaster"]);
    expect(report.exactMatchCount).toBe(1);
    expect(report.conflictCount).toBe(2);
    expect(report.manualReviewCount).toBe(1);
  });
});
