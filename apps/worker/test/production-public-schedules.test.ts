import { describe, expect, it } from "vitest";
import { publicDataAdapters } from "@tymra/providers";
import { registrySourceSeedRecords } from "../../../packages/db/prisma/seed-sources";

import { assertFirstPublicGeoNetReferences, boundFirstPublicResults, firstPublicPriorJobAction, firstPublicReferenceRecordLimit, FIRST_PUBLIC_SCHEDULES, firstPublicSchedulePayload, isFirstPublicSchedule, isPreviousChristchurchPublicSchedule, isPreviousMbiePublicSchedule } from "../src/operations/production-public-schedules";

describe("first production public schedules", () => {
  it("accepts only the five exact bounded source schedules", () => {
    expect(FIRST_PUBLIC_SCHEDULES.map((schedule) => schedule.sourceId)).toEqual(["public_holidays_nz", "mbie", "rto_calendars", "geonet", "stats_nz"]);
    for (const schedule of FIRST_PUBLIC_SCHEDULES) {
      const candidate = { ...schedule, payload: firstPublicSchedulePayload(schedule.sourceId) };
      expect(isFirstPublicSchedule(candidate)).toBe(true);
      expect(isFirstPublicSchedule({ ...candidate, payload: { ...candidate.payload, limit: 5_000 } })).toBe(false);
      expect(isFirstPublicSchedule({ ...candidate, payload: { ...candidate.payload, from: "2026-01-01" } })).toBe(false);
      expect(isFirstPublicSchedule({ ...candidate, cronExpression: "every-1-hours" })).toBe(false);
    }
    expect(isFirstPublicSchedule({ key: "rbnz-fx-daily", jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "daily", payload: {} })).toBe(false);
  });

  it("recognises only the paused MBIE 20-record schedule for a controlled upgrade", () => {
    const current = FIRST_PUBLIC_SCHEDULES.find((schedule) => schedule.sourceId === "mbie")!;
    const previous = { ...current, enabled: false, payload: { ...firstPublicSchedulePayload("mbie"), limit: 20 } };
    expect(isPreviousMbiePublicSchedule(previous)).toBe(true);
    expect(isPreviousMbiePublicSchedule({ ...previous, enabled: true })).toBe(false);
    expect(isPreviousMbiePublicSchedule({ ...previous, payload: { ...previous.payload, from: "2026-01-01" } })).toBe(false);
  });

  it("upgrades only the paused ChristchurchNZ schedule to the incremental window budget", () => {
    const current = FIRST_PUBLIC_SCHEDULES.find((schedule) => schedule.sourceId === "rto_calendars")!;
    const previous = { ...current, enabled: false, payload: { ...firstPublicSchedulePayload("rto_calendars"), limit: 30 } };
    expect(isPreviousChristchurchPublicSchedule(previous)).toBe(true);
    expect(isPreviousChristchurchPublicSchedule({ ...previous, enabled: true })).toBe(false);
    expect(isPreviousChristchurchPublicSchedule({ ...previous, payload: { ...previous.payload, marketScope: "other" } })).toBe(false);
    expect(boundFirstPublicResults(Array.from({ length: 100 }, (_, index) => index), [], 1_000, "rto_calendars").events).toHaveLength(100);
    expect(() => boundFirstPublicResults(Array.from({ length: 1_001 }, (_, index) => index), [], 1_000, "rto_calendars")).toThrow("approved result budget");
  });

  it("caps combined business results independently of raw record count", () => {
    expect(boundFirstPublicResults(["event-1", "event-2"], ["signal-1", "signal-2"], 3)).toEqual({ events: ["event-1", "event-2"], signals: ["signal-1"] });
    expect(() => boundFirstPublicResults([], [], 31)).toThrow("limit is invalid");
  });

  it("reserves GeoNet capacity for both required feeds and rejects unknown endpoints", () => {
    expect(firstPublicReferenceRecordLimit("geonet", "https://api.geonet.org.nz/quake?MMI=3", 20)).toBe(4);
    expect(firstPublicReferenceRecordLimit("geonet", "https://api.geonet.org.nz/volcano/val", 20)).toBe(16);
    expect(() => firstPublicReferenceRecordLimit("geonet", "https://api.geonet.org.nz/other", 20)).toThrow("unapproved endpoint");
    expect(firstPublicReferenceRecordLimit("mbie", "https://teic.mbie.govt.nz", 20)).toBe(20);
    expect(() => assertFirstPublicGeoNetReferences(["https://api.geonet.org.nz/quake?MMI=3", "https://api.geonet.org.nz/volcano/val"])).not.toThrow();
    expect(() => assertFirstPublicGeoNetReferences(["https://api.geonet.org.nz/quake?MMI=3"])).toThrow("both approved feeds");
  });

  it("keeps the formal source registry aligned with all five deployed adapters", () => {
    const records = registrySourceSeedRecords();
    for (const schedule of FIRST_PUBLIC_SCHEDULES) {
      const record = records.find((candidate) => candidate.key === schedule.sourceId);
      expect(record?.adapterKey).toBe(publicDataAdapters[schedule.sourceId]?.metadata.adapterKey);
    }
  });

  it("waits for unfinished collection and pauses after any failed or cancelled Job", () => {
    expect(firstPublicPriorJobAction()).toBe("ENQUEUE");
    expect(firstPublicPriorJobAction("SUCCEEDED")).toBe("ENQUEUE");
    expect(firstPublicPriorJobAction("RUNNING")).toBe("WAIT");
    expect(firstPublicPriorJobAction("PENDING")).toBe("WAIT");
    for (const status of ["FAILED", "DEAD_LETTER", "CANCELLED"]) expect(firstPublicPriorJobAction(status)).toBe("PAUSE");
  });
});
