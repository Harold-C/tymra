import { describe, expect, it } from "vitest";

import { isProductionProgressSchedule, isSuccessfulProgressTrial, progressSchedulePayload } from "../src/operations/production-progress-schedules";

describe("bounded progressive event schedules", () => {
  it("accepts only the exact approved daily payload", () => {
    const approved = {
      key: "progress-eventfinda-daily", jobType: "EVENT_COLLECTION", queueName: "event-collection",
      cronExpression: "daily", payload: progressSchedulePayload("eventfinda"),
    };
    expect(isProductionProgressSchedule(approved)).toBe(true);
    expect(isProductionProgressSchedule({ ...approved, payload: { ...approved.payload, maxPages: 50 } })).toBe(false);
    expect(isProductionProgressSchedule({ ...approved, cronExpression: "every-3-hours" })).toBe(false);
    expect(isProductionProgressSchedule({ ...approved, payload: { ...approved.payload, productionCanary: false } })).toBe(false);
    expect(isProductionProgressSchedule({ ...approved, key: "progress-ticketmaster-daily" })).toBe(false);
  });

  it("requires a complete bounded trial before increasing frequency", () => {
    const eventfindaScope = { phase: "full", maxPages: 3, maxDetails: 1, maxRecords: 500, requests: 4, failureCount: 0 };
    expect(isSuccessfulProgressTrial("eventfinda", { status: "SUCCEEDED", scope: eventfindaScope })).toBe(true);
    expect(isSuccessfulProgressTrial("eventfinda", { status: "PARTIAL", scope: eventfindaScope })).toBe(false);
    expect(isSuccessfulProgressTrial("eventfinda", { status: "SUCCEEDED", scope: { ...eventfindaScope, maxDetails: 3 } })).toBe(false);
    const ticketmasterScope = { requestedPhase: "full", phase: "full", limits: { maxPages: 3, maxDetails: 2, maxRecords: 100 }, counters: { requests: 7, failures: 0 } };
    expect(isSuccessfulProgressTrial("ticketmaster", { status: "SUCCEEDED", scope: ticketmasterScope })).toBe(true);
    expect(isSuccessfulProgressTrial("ticketmaster", { status: "SUCCEEDED", scope: { ...ticketmasterScope, counters: { requests: 21, failures: 0 } } })).toBe(false);
  });
});
