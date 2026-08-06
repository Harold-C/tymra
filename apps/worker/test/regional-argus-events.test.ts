import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  normaliseRegionalArgusEvents,
  regionalArgusEventExtractionSchema,
} from "../src/collection/regional-argus-events";

describe("regional Argus event contracts", () => {
  it("validates and normalises Dunedin events without promoting impact", () => {
    const extraction = regionalArgusEventExtractionSchema.parse(payload("https://www.dunedinnz.com/visit/dunedin-events/upcoming-events/example"));
    const events = normaliseRegionalArgusEvents(
      extraction,
      "dunedinnz_events",
      { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z") },
    );
    assert.equal(events.length, 1);
    assert.equal(events[0]?.city, "Dunedin");
    assert.equal(events[0]?.region, "Otago");
    assert.equal(events[0]?.impactStatus, "PENDING_EVIDENCE");
  });

  it("rejects count drift and non-Dunedin payloads", () => {
    const countDrift = payload("https://www.dunedinnz.com/visit/dunedin-events/upcoming-events/example");
    countDrift.totalEvents = 2;
    assert.equal(regionalArgusEventExtractionSchema.safeParse(countDrift).success, false);
    assert.equal(regionalArgusEventExtractionSchema.safeParse({ ...payload("https://www.dunedinnz.com/visit/dunedin-events/upcoming-events/example"), market: "Rotorua" }).success, false);
  });
});

function payload(canonicalUrl: string) {
  return {
    data_schema: "regional-events-public.collect_events",
    schema_version: "1.0.0",
    extractor: "regional_events",
    kind: "event_listing",
    title: "Dunedin events",
    canonicalUrl: canonicalUrl.replace(/\/example$/u, ""),
    market: "Dunedin",
    events: [{
      eventId: "dunedin:example:2026-08-20",
      title: "Regional Festival",
      canonicalUrl,
      startsAt: "2026-08-20",
      endsAt: "2026-08-20",
      timePrecision: "DATE",
      venue: null,
      address: null,
      city: null,
      region: null,
      category: "Festival",
      description: null,
      status: "SCHEDULED",
      fieldSources: { title: "event card", startsAt: "event card" },
    }],
    totalEvents: 1,
    truncated: false,
    quality: "partial",
    missingFields: ["events[0].venue"],
    warnings: [],
    fieldSources: { events: "listing page" },
  };
}
