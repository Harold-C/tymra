import { describe, expect, it } from "vitest";

import type { PublicEvent } from "@tymra/providers";

import {
  canonicalEventKey,
  canonicalEventOccurrenceKey,
  canonicalVenueKey,
  sourceEventIdentity,
} from "../src/event-canonicalisation";

const event: PublicEvent = {
  sourceId: "eventfinda",
  externalId: "922033:2026-08-16T06:00:00.000Z",
  title: "Matariki Concert",
  category: "Music",
  subcategory: null,
  sourceUrl: "https://www.eventfinda.co.nz/2026/matariki/auckland",
  venueName: "Auckland Town Hall",
  address: "301 Queen Street",
  city: "Auckland",
  region: "Auckland",
  territorialAuthority: "Auckland",
  postcode: "1010",
  countryCode: "NZ",
  latitude: -36.85295,
  longitude: 174.76349,
  timezone: "Pacific/Auckland",
  startsAt: new Date("2026-08-16T06:00:00.000Z"),
  endsAt: new Date("2026-08-16T08:00:00.000Z"),
  status: "SCHEDULED",
  ticketStatus: "ONSALE",
  impactStatus: "PENDING_EVIDENCE",
  impactScore: null,
  impactConfidence: null,
  impactEvidence: {},
  sourceUpdatedAt: null,
  metadata: { eventfindaEventId: "922033", seriesUrl: "https://www.eventfinda.co.nz/2026/matariki/auckland" },
  fixture: false,
};

describe("event canonicalisation", () => {
  it("separates source series identity from occurrence identity", () => {
    expect(sourceEventIdentity(event)).toEqual({ externalId: "922033", sourceUrl: event.sourceUrl });
    const laterOccurrence = { ...event, externalId: "922033:2026-08-17T06:00:00.000Z", startsAt: new Date("2026-08-17T06:00:00.000Z") };
    expect(canonicalEventKey(laterOccurrence)).toBe(canonicalEventKey(event));
    expect(canonicalEventOccurrenceKey(laterOccurrence)).not.toBe(canonicalEventOccurrenceKey(event));
  });

  it("matches harmless text and coordinate formatting differences exactly", () => {
    const equivalent = { ...event, sourceId: "ticketmaster", externalId: "tm-1", title: "  MATARIKI concert ", venueName: "Auckland-Town Hall" };
    expect(canonicalEventKey(equivalent)).toBe(canonicalEventKey(event));
    expect(canonicalEventOccurrenceKey(equivalent)).toBe(canonicalEventOccurrenceKey(event));
    expect(canonicalVenueKey({ ...equivalent, latitude: -36.852951, longitude: 174.763491 })).toBe(canonicalVenueKey(event));
  });

  it("does not invent a venue when no location evidence exists", () => {
    expect(canonicalVenueKey({ ...event, venueName: null, address: null, city: null, region: null, postcode: null, latitude: null, longitude: null })).toBeNull();
  });
});
