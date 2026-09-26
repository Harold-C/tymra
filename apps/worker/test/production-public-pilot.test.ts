import { describe, expect, it } from "vitest";

import { ARGUS_MARKET_PILOT_SOURCE_KEYS, isProductionPublicPilotSchedule, PUBLIC_PILOT_SOURCE_KEYS, publicPilotSchedulePayload } from "../src/operations/production-public-pilot";
import { isArgusPilotEvidencePath } from "../src/operations/production-argus-market-pilot";

describe("direct-public production pilot", () => {
  it("admits only registered direct public sources with exact weekly bounds", () => {
    expect(PUBLIC_PILOT_SOURCE_KEYS).toContain("linz");
    expect(PUBLIC_PILOT_SOURCE_KEYS).toEqual(expect.arrayContaining(["school_holidays_nz", "eventbrite_events", "humanitix_events"]));
    expect(PUBLIC_PILOT_SOURCE_KEYS).toContain("eventfinda");
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
    expect(ARGUS_MARKET_PILOT_SOURCE_KEYS).toHaveLength(28);
    expect(ARGUS_MARKET_PILOT_SOURCE_KEYS).toContain("fx_rates");
    expect(ARGUS_MARKET_PILOT_SOURCE_KEYS).not.toContain("eventfinda");
    expect(ARGUS_MARKET_PILOT_SOURCE_KEYS).toContain("ticketmaster");
    expect(PUBLIC_PILOT_SOURCE_KEYS).not.toContain("venue_eden_park");
    const browserPilot = { ...valid, key: "pilot-public-venue_eden_park-weekly", payload: publicPilotSchedulePayload("venue_eden_park") };
    expect(isProductionPublicPilotSchedule(browserPilot)).toBe(true);
    expect(isProductionPublicPilotSchedule({ ...browserPilot, payload: { ...browserPilot.payload, limit: 20 } })).toBe(false);
    expect(publicPilotSchedulePayload("school_sport_nz").marketScope).toBe("christchurch");
    expect(publicPilotSchedulePayload("dunedinnz_events").marketScope).toBe("dunedin");
    expect(isProductionPublicPilotSchedule({ ...browserPilot, payload: { ...browserPilot.payload, marketScope: "dunedin" } })).toBe(false);
    const regionalPilot = { ...browserPilot, key: "pilot-public-dunedinnz_events-weekly", payload: publicPilotSchedulePayload("dunedinnz_events") };
    expect(isProductionPublicPilotSchedule(regionalPilot)).toBe(true);
    expect(isProductionPublicPilotSchedule({ ...regionalPilot, payload: { ...regionalPilot.payload, marketScope: "new-zealand" } })).toBe(false);
  });
  it("accepts retained HTML, screenshot and download evidence without path traversal", () => {
    expect(isArgusPilotEvidencePath("trace-1/page.html")).toBe(true);
    expect(isArgusPilotEvidencePath("trace-1/screenshot.png")).toBe(true);
    expect(isArgusPilotEvidencePath("trace-1/downloads/calendar.pdf")).toBe(true);
    expect(isArgusPilotEvidencePath("trace-1/downloads/../other.pdf")).toBe(false);
    expect(isArgusPilotEvidencePath("../page.html")).toBe(false);
  });
});
