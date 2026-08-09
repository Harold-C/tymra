import { describe, expect, it } from "vitest";

import {
  addNzCalendarDays,
  addNzCalendarMonths,
  buildFormalThirtyDayDates,
  nzCalendarDayDifference,
  nzDateKey,
  nzDateTime,
  nzEndOfDay,
  nzStartOfDay,
} from "../src";

describe("New Zealand business dates", () => {
  it("uses the Auckland calendar date at the UTC/local midnight boundary", () => {
    expect(nzDateKey(new Date("2026-08-08T11:59:59Z"))).toBe("2026-08-08");
    expect(nzDateKey(new Date("2026-08-08T12:00:00Z"))).toBe("2026-08-09");
    const formalDates = buildFormalThirtyDayDates(new Date("2026-08-08T12:30:00Z"));
    expect(formalDates[0]).toMatchObject({ checkIn: "2026-08-10" });
    expect(formalDates.at(-1)?.checkIn).toBe("2026-09-08");
  });

  it("adds and compares calendar days without assuming every local day is 24 hours", () => {
    expect(addNzCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(nzCalendarDayDifference("2026-09-28", "2026-09-26")).toBe(2);
    expect(nzStartOfDay("2026-09-28").getTime() - nzStartOfDay("2026-09-27").getTime()).toBe(23 * 3_600_000);
    expect(nzStartOfDay("2026-04-06").getTime() - nzStartOfDay("2026-04-05").getTime()).toBe(25 * 3_600_000);
    expect(nzEndOfDay("2026-09-27").getTime()).toBe(nzStartOfDay("2026-09-28").getTime() - 1);
  });

  it("adds calendar months and clamps to the final local date", () => {
    expect(addNzCalendarMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(nzDateTime("2026-09-27T03:30:00").toISOString()).toBe("2026-09-26T14:30:00.000Z");
  });
});
