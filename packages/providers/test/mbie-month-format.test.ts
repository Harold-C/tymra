import { describe, expect, it } from "vitest";
import { MbieAccommodationAdapter, parseMbieAccommodationTail, parseMbieMonth } from "../src/public/mbie-accommodation";

describe("MBIE published month formats", () => {
  it("reads current six-column range responses and retains the latest published month", async () => {
    const rows = parseMbieAccommodationTail([
      "s & boutique accommodation,Capacity utilisation rate,0.224",
      "May-26,RTO,Auckland RTO,Total,Occupancy rate,0.55",
      "Sep-26,RTO,Auckland RTO,Total,Occupancy rate,0.72",
      "Sep-26,RTO,Auckland RTO,Total,Total guest nights,617000",
      "Sep-26,RTO,Auckland RTO,Total,Quality indicator,High",
      ",,,,,",
    ].join("\n"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ period: "2026-09-01", measures: { "Occupancy rate": { value: 0.72, flag: null } } });
    const adapter = new MbieAccommodationAdapter();
    const signals = await adapter.normalise(rows.map(payload => ({ sourceId: "mbie", externalId: payload.id, payload, fetchedAt: new Date(), fixture: false })), { mode: "live", correlationId: "mbie-format-regression", locale: "en", currency: "NZD" });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ marketKey: "auckland", direction: "POSITIVE", confidence: 0.9 });
    expect(signals[0].startsAt.toISOString()).toBe("2026-08-31T12:00:00.000Z");
  });

  it("preserves historical numeric dates and rejects malformed dates rather than rolling months", () => {
    expect(parseMbieMonth("1/09/2026")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(parseMbieMonth("Sep-2026")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    for (const invalid of ["31/02/2026", "1/13/2026", "0/09/2026", "Foo-26", "Sep-1926", "Sep-26junk", "", undefined]) {
      expect(parseMbieMonth(invalid)).toBeNull();
    }
  });
});
