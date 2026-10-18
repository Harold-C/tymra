import { describe, expect, it } from "vitest";
import { parseSampleTrendFilter } from "./sample-trend-filter";

describe("sample quote filters", () => {
  it("defaults to 28 NZ dates, with public and one/two-night series kept separate", () => {
    expect(parseSampleTrendFilter({}, new Date("2026-10-18T00:00:00Z"))).toMatchObject({ success: true, data: {
      from: "2026-09-21", to: "2026-10-18", basis: "PUBLIC_TOTAL", nights: "ALL", stay: "ALL", lead: "ALL" } });
  });
  it("rejects invalid/oversized dates and repeated or unsupported filters", () => {
    for (const input of [{ from: "2026-02-30" }, { from: "2020-01-01" }, { from: "2026-10-19", to: "2026-10-18" },
      { basis: "RAW" }, { nights: "4" }, { comparison: "ANY_PRICE" }, { basis: ["PUBLIC_TOTAL", "MEMBER_REFERENCE"] }])
      expect(parseSampleTrendFilter(input, new Date("2026-10-18T00:00:00Z")).success).toBe(false);
  });
  it("accepts the approved separate three-night and flexible-date reference views", () => {
    expect(parseSampleTrendFilter({ nights: "3", comparison: "ROLLING" }, new Date("2026-10-19T00:00:00Z"))).toMatchObject({ success: true, data: { nights: "3", comparison: "ROLLING" } });
  });
});
