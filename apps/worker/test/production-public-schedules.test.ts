import { describe, expect, it } from "vitest";

import { boundFirstPublicResults, FIRST_PUBLIC_SCHEDULES, firstPublicSchedulePayload, isFirstPublicSchedule } from "../src/operations/production-public-schedules";

describe("first production public schedules", () => {
  it("accepts only the three exact bounded source schedules", () => {
    expect(FIRST_PUBLIC_SCHEDULES.map((schedule) => schedule.sourceId)).toEqual(["public_holidays_nz", "mbie", "rto_calendars"]);
    for (const schedule of FIRST_PUBLIC_SCHEDULES) {
      const candidate = { ...schedule, payload: firstPublicSchedulePayload(schedule.sourceId) };
      expect(isFirstPublicSchedule(candidate)).toBe(true);
      expect(isFirstPublicSchedule({ ...candidate, payload: { ...candidate.payload, limit: 5_000 } })).toBe(false);
      expect(isFirstPublicSchedule({ ...candidate, payload: { ...candidate.payload, from: "2026-01-01" } })).toBe(false);
      expect(isFirstPublicSchedule({ ...candidate, cronExpression: "every-1-hours" })).toBe(false);
    }
    expect(isFirstPublicSchedule({ key: "rbnz-fx-daily", jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "daily", payload: {} })).toBe(false);
  });

  it("caps combined business results independently of raw record count", () => {
    expect(boundFirstPublicResults(["event-1", "event-2"], ["signal-1", "signal-2"], 3)).toEqual({ events: ["event-1", "event-2"], signals: ["signal-1"] });
    expect(() => boundFirstPublicResults([], [], 31)).toThrow("limit is invalid");
  });
});
