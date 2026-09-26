import { describe, expect, it } from "vitest";

import { ARGUS_MARKET_PILOT_SOURCE_KEYS, isProductionPublicPilotSchedule, PUBLIC_PILOT_SOURCE_KEYS, publicPilotSchedulePayload } from "../src/operations/production-public-pilot";

describe("direct-public production pilot", () => {
  it("admits only registered direct public sources with exact weekly bounds", () => {
    expect(PUBLIC_PILOT_SOURCE_KEYS).toContain("linz");
    expect(PUBLIC_PILOT_SOURCE_KEYS).toEqual(expect.arrayContaining(["school_holidays_nz", "eventbrite_events", "humanitix_events"]));
    expect(PUBLIC_PILOT_SOURCE_KEYS).not.toContain("eventfinda");
    expect(PUBLIC_PILOT_SOURCE_KEYS).not.toContain("fx_rates");
    expect(PUBLIC_PILOT_SOURCE_KEYS).not.toContain("booking");
    const valid = {
      key: "pilot-public-linz-weekly", jobType: "PUBLIC_DATA_COLLECTION",
      queueName: "public-data-collection", cronExpression: "weekly",
      payload: publicPilotSchedulePayload("linz"),
    };
    expect(isProductionPublicPilotSchedule(valid)).toBe(true);
    expect(isProductionPublicPilotSchedule({ ...valid, payload: { ...valid.payload, limit: 5_000 } })).toBe(false);
    expect(isProductionPublicPilotSchedule({ ...valid, payload: { ...valid.payload, extra: true } })).toBe(false);
    expect(isProductionPublicPilotSchedule({ ...valid, cronExpression: "daily" })).toBe(false);
    expect(isProductionPublicPilotSchedule({ ...valid, key: "pilot-public-booking-weekly" })).toBe(false);
    expect(ARGUS_MARKET_PILOT_SOURCE_KEYS).toHaveLength(20);
    expect(PUBLIC_PILOT_SOURCE_KEYS).not.toContain("venue_eden_park");
    const browserPilot = { ...valid, key: "pilot-public-venue_eden_park-weekly", payload: publicPilotSchedulePayload("venue_eden_park") };
    expect(isProductionPublicPilotSchedule(browserPilot)).toBe(true);
    expect(isProductionPublicPilotSchedule({ ...browserPilot, payload: { ...browserPilot.payload, limit: 20 } })).toBe(false);
  });
});
