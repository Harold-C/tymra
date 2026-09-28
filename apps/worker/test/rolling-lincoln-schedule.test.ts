import { describe, expect, it } from "vitest";

import { isRollingLincolnSchedule, ROLLING_LINCOLN_SCHEDULE_KEY, rollingLincolnSchedulePayload } from "../src/operations/rolling-lincoln-schedule";

describe("rolling Lincoln weekly schedule", () => {
  it("accepts only the exact bounded production payload", () => {
    const approved = {
      key: ROLLING_LINCOLN_SCHEDULE_KEY, jobType: "PUBLIC_DATA_COLLECTION",
      queueName: "public-data-collection", cronExpression: "weekly", payload: rollingLincolnSchedulePayload(),
    };
    expect(isRollingLincolnSchedule(approved)).toBe(true);
    expect(isRollingLincolnSchedule({ ...approved, payload: { ...approved.payload, limit: 500 } })).toBe(false);
    expect(isRollingLincolnSchedule({ ...approved, payload: { ...approved.payload, from: "2026-01-01" } })).toBe(false);
    expect(isRollingLincolnSchedule({ ...approved, cronExpression: "daily" })).toBe(false);
  });
});
