import { describe, expect, it } from "vitest";
import { classifySchedule, publicScheduleFailureKeys, sourceMeetsSchedulePolicy } from "../src/operations/schedule-policy";
import { FIRST_PUBLIC_SCHEDULES, firstPublicSchedulePayload } from "../src/operations/production-public-schedules";
import { PUBLIC_PILOT_SOURCE_KEYS, ARGUS_MARKET_PILOT_SOURCE_KEYS, publicPilotSchedulePayload } from "../src/operations/production-public-pilot";
import { PROGRESS_SCHEDULES, progressSchedulePayload } from "../src/operations/production-progress-schedules";
import { rollingLincolnSchedulePayload, ROLLING_LINCOLN_SCHEDULE_KEY } from "../src/operations/rolling-lincoln-schedule";

const schedules = [
  ...FIRST_PUBLIC_SCHEDULES.map((spec) => ({ ...spec, payload: firstPublicSchedulePayload(spec.sourceId) })),
  ...[...PUBLIC_PILOT_SOURCE_KEYS, ...ARGUS_MARKET_PILOT_SOURCE_KEYS].map((sourceId) => ({
    key: `pilot-public-${sourceId}-weekly`, jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "weekly", payload: publicPilotSchedulePayload(sourceId),
  })),
  ...PROGRESS_SCHEDULES.map((spec) => ({ key: spec.key, jobType: "EVENT_COLLECTION", queueName: "event-collection", cronExpression: "daily", payload: progressSchedulePayload(spec.sourceId) })),
  { key: ROLLING_LINCOLN_SCHEDULE_KEY, jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "weekly", payload: rollingLincolnSchedulePayload() },
];

describe("approved schedule policy", () => {
  it.each(schedules)("retains the approved bounds for $key", (schedule) => {
    expect(classifySchedule(schedule)?.sourceId).toBe(schedule.payload.sourceId);
    for (const changed of [
      { ...schedule, key: "unapproved" },
      { ...schedule, queueName: "other-queue" },
      { ...schedule, jobType: "RATE_COLLECTION" },
      { ...schedule, cronExpression: "every-1-minutes" },
      { ...schedule, payload: { ...schedule.payload, limit: schedule.payload.limit + 1 } },
      { ...schedule, payload: { ...schedule.payload, extraFlag: true } },
      { ...schedule, payload: { ...schedule.payload, sourceId: "another-source" } },
    ]) expect(classifySchedule(changed)).toBeNull();
  });

  it("requires the source-specific production approval and environment", () => {
    const policy = classifySchedule(schedules.find((schedule) => schedule.key === "pilot-public-eventfinda-weekly")!)!;
    const source = { key: "eventfinda", providerType: "PUBLIC", sourceType: "EVENT", enabled: true, isDemo: false, environments: ["PRODUCTION"], concurrencyLimit: 1, dailyBudget: 10, accessMethod: "ARGUS", metadata: { boundedProductionCanary: true } };
    expect(sourceMeetsSchedulePolicy(policy, source)).toBe(true);
    expect(sourceMeetsSchedulePolicy(policy, { ...source, metadata: { rollingLincolnApproved: true } })).toBe(false);
    expect(sourceMeetsSchedulePolicy(policy, { ...source, environments: ["DEVELOPMENT"] })).toBe(false);
    expect(sourceMeetsSchedulePolicy(policy, { ...source, key: "ticketmaster" })).toBe(false);
    expect(sourceMeetsSchedulePolicy(policy, { ...source, isDemo: true })).toBe(false);
  });

  it("pauses the daily progression and its former weekly pilot after failure", () => {
    const job = { type: "EVENT_COLLECTION", queueName: "event-collection", payload: progressSchedulePayload("eventfinda") };
    expect(publicScheduleFailureKeys(job)).toEqual(["pilot-public-eventfinda-weekly", "progress-eventfinda-daily"]);
    expect(publicScheduleFailureKeys({ ...job, payload: { ...job.payload, maxPages: 100 } })).toEqual([]);
    expect(publicScheduleFailureKeys({ ...job, queueName: "unapproved" })).toEqual([]);
  });
});
