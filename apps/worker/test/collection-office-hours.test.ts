import { describe, expect, it } from "vitest";
import { isCollectionScheduleJobType, nextCollectionOutsideOfficeHours } from "../src/operations/collection-office-hours";

describe("production collection office hours", () => {
  it("covers both production collection plan types without delaying unrelated jobs", () => {
    expect(isCollectionScheduleJobType("PUBLIC_DATA_COLLECTION")).toBe(true);
    expect(isCollectionScheduleJobType("EVENT_COLLECTION")).toBe(true);
    expect(isCollectionScheduleJobType("RETENTION_CLEANUP")).toBe(false);
  });

  it("defers a Monday morning due time to 17:00 NZ daylight time", () => {
    expect(nextCollectionOutsideOfficeHours(new Date("2026-09-27T21:45:00Z")).toISOString())
      .toBe("2026-09-28T04:00:00.000Z");
  });

  it("uses NZ standard time in winter", () => {
    expect(nextCollectionOutsideOfficeHours(new Date("2026-07-05T22:15:00Z")).toISOString())
      .toBe("2026-07-06T05:00:00.000Z");
  });

  it("allows early, evening, and weekend collection", () => {
    for (const value of ["2026-09-27T19:59:00Z", "2026-09-28T04:00:00Z", "2026-09-26T00:00:00Z"]) {
      const due = new Date(value);
      expect(nextCollectionOutsideOfficeHours(due)).toBe(due);
    }
  });
});
