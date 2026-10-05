import { describe, expect, it, vi } from "vitest";
import { decodeQueenstownPassengerMatrix, queenstownPassengerQueries, queenstownAirportMonthlyAdapters } from "../src/queenstown-airport-monthly-adapter";
import { publicDataAdapters } from "../src";

describe("current Queenstown Airport PBIR report", () => {
  it("binds all three fields and preserves domestic and international filters", () => {
    const projection = (role: string, entity: string, property: string) => ({ projections: [{ queryRef: `${entity}.${property}`, field: { [role]: { Expression: { SourceRef: { Entity: entity } }, Property: property } } }] });
    const visual = (type?: string) => ({ content: { visual: { visualType: "pivotTable", query: { queryState: {
      Rows: projection("Column", "_Date", "Short Month"), Columns: projection("Column", "_Date", "Calendar Year"), Values: projection("Measure", "Metrics: Aero", "Pax"),
    } } }, filterConfig: { filters: type ? [{ filter: { From: [{ Name: "a", Entity: "_ScheduledUnitType", Type: 0 }], Where: [{ Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: "a" } }, Property: "Type" } }], Values: [[{ Literal: { Value: `'${type}'` } }]] } } }] } }] : [] } } });
    const model = { models: [{ id: 123 }], exploration: { sections: [], explorationContent: { explorationDocument: JSON.stringify({ pages: { pages: [{ content: { displayName: "Pax Numbers" }, visualContainers: [visual("D"), visual("I"), visual()] }] } }) } } };
    const queries = queenstownPassengerQueries(model);
    expect(queries.modelId).toBe(123);
    const command = (queries.domestic as any).Commands[0].SemanticQueryDataShapeCommand;
    expect(command.Binding.Primary.Groupings[0].Projections).toEqual([0, 2]);
    expect(command.Query.Select.map((s: any) => s.Name)).toEqual(["_Date.Short Month", "_Date.Calendar Year", "Metrics: Aero.Pax"]);
    expect(command.Query.From).toContainEqual({ Name: "s2", Entity: "_ScheduledUnitType", Type: 0 });
    expect(JSON.stringify(queries.domestic)).toContain("'D'");
    expect(JSON.stringify(queries.international)).toContain("'I'");
    expect(JSON.stringify(queries.total)).not.toContain("_ScheduledUnitType");
    expect(() => queenstownPassengerQueries({ models: [{ id: 123 }], exploration: {} })).toThrow("supported monthly passenger queries");
  });

  it("reads descriptor-selected groups, month names, and missing future values", () => {
    const payload = { results: [{ result: { data: { descriptor: { Expressions: {
      Primary: { Groupings: [{ Keys: [{ Source: { Property: "Short Month" } }], Member: "DM0" }] },
      Secondary: { Groupings: [{ Keys: [{ Source: { Property: "Calendar Year" } }], Member: "DM1" }] },
    } }, dsr: { DS: [{ SH: [{ DM1: [{ G1: 2025 }, { G1: 2026 }] }], PH: [{ DM0: [{ G0: 0, X: [{ M0: 100 }, { M0: 110 }] }, { G0: 1, X: [{ M0: 90 }] }] }], ValueDicts: { D0: ["February", "January", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] } }] } } } }] };
    expect([...decodeQueenstownPassengerMatrix(payload)]).toEqual([["2025-1", 100], ["2026-1", 110], ["2025-0", 90]]);
  });

  it.each([["queenstownnz_events", 1], ["southlandnz_events", 1], ["wellington_airport_monthly", 1], ["queenstown_airport_monthly", 5]])("rejects an insufficient %s budget before requesting a page", async (source, maxRequests) => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    try {
      const adapter = source === "queenstown_airport_monthly" ? queenstownAirportMonthlyAdapters[source] : publicDataAdapters[source];
      const [reference] = await adapter.discover({ mode: "live", correlationId: "bounded-test", currency: "NZD", locale: "en" });
      await expect(adapter.fetch(reference!, { mode: "live", correlationId: "bounded-test", currency: "NZD", locale: "en", collectionLimits: { maxRequests: Number(maxRequests), maxBytes: 5_000_000, maxRecords: 2, timeoutMs: 30_000 } })).rejects.toMatchObject({ code: "REQUEST_BUDGET_EXHAUSTED", retryable: false });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
