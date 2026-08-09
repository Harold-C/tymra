import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  normaliseSportySchoolSportEvents,
  normaliseTicketekEvents,
  normalisedEnd,
  parseAucklandDate,
  sportySchoolSportExtractionSchema,
  ticketekDetailExtractionSchema,
  ticketekListingExtractionSchema,
} from "../src/collection/school-sport-ticketek";

const range = { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-10-01T00:00:00Z") };

describe("School Sport and Ticketek Argus contracts", () => {
  it("uses New Zealand local boundaries across daylight-saving changes", () => {
    const startsAt = parseAucklandDate("2026-09-27")!;
    assert.equal(startsAt.toISOString(), "2026-09-26T12:00:00.000Z");
    assert.equal(normalisedEnd(startsAt, null, "DATE").toISOString(), "2026-09-27T10:59:59.999Z");
  });

  it("retains Sporty raw rows but promotes only explicitly located, non-administrative Canterbury occurrences", () => {
    const extraction = sportySchoolSportExtractionSchema.parse(sportyExtraction());
    const events = normaliseSportySchoolSportEvents(extraction, "school_sport_canterbury", range);

    assert.equal(extraction.occurrences.length, 3);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.externalId, "sporty:ssc:winter-tournament:2026-08-20");
    assert.equal(events[0]?.city, "Christchurch");
    assert.equal(events[0]?.metadata.sourceOrganisation, "School Sport Canterbury");
    assert.equal(events[0]?.impactStatus, "PENDING_EVIDENCE");
  });

  it("rejects Sporty count drift and cross-source organisation drift", () => {
    const countDrift = sportyExtraction();
    countDrift.totalOccurrences = 4;
    assert.equal(sportySchoolSportExtractionSchema.safeParse(countDrift).success, false);

    const parsed = sportySchoolSportExtractionSchema.parse(sportyExtraction());
    assert.throws(
      () => normaliseSportySchoolSportEvents(parsed, "school_sport_nz", range),
      /source organisation must be School Sport NZ/u,
    );
  });

  it("normalises Ticketek listing and detail occurrences without inventing missing location", () => {
    const listing = ticketekListingExtractionSchema.parse(ticketekListing());
    const listingEvents = normaliseTicketekEvents(listing, range);
    assert.equal(listingEvents.length, 1);
    assert.equal(listingEvents[0]?.externalId, "ticketek:SHOW26:PERF1");
    assert.equal(listingEvents[0]?.venueName, "Isaac Theatre Royal");
    assert.equal(listingEvents[0]?.ticketStatus, "AVAILABLE");

    const listingPayload = ticketekListing();
    const detail = ticketekDetailExtractionSchema.parse({
      data_schema: "ticketek-public.collect_detail",
      schema_version: "1.0.0",
      extractor: "ticketek",
      kind: "event_detail",
      title: "Example Show",
      canonicalUrl: listingPayload.series[0]!.canonicalUrl,
      series: listingPayload.series[0],
      occurrences: listingPayload.occurrences.slice(0, 1),
      quality: "complete",
      missingFields: [],
      warnings: [],
      fieldSources: { series: "fixture", occurrences: "fixture" },
    });
    assert.equal(normaliseTicketekEvents(detail, range)[0]?.metadata.seriesId, "ticketek:SHOW26");
  });

  it("rejects Ticketek occurrence references to an unknown series", () => {
    const payload = ticketekListing();
    payload.occurrences[0]!.seriesId = "ticketek:UNKNOWN";
    assert.equal(ticketekListingExtractionSchema.safeParse(payload).success, false);
  });
});

function sportyExtraction() {
  const canonicalUrl = "https://www.sporty.co.nz/sscanterbury";
  const series = [
    sportySeries("sporty:ssc:winter-tournament", "Winter Tournament", canonicalUrl),
    sportySeries("sporty:ssc:entries-close", "Winter Tournament Entries Close", canonicalUrl),
    sportySeries("sporty:ssc:unlocated", "Unlocated Tournament", canonicalUrl),
  ];
  return {
    data_schema: "sporty-school-sport-public.collect_events",
    schema_version: "1.0.0",
    extractor: "sporty_school_sport",
    kind: "event_listing",
    title: "School Sport Canterbury",
    canonicalUrl,
    sourceOrganisation: "School Sport Canterbury",
    window: { startsOn: "2026-08-01", endsOn: "2026-09-30" },
    series,
    occurrences: [
      sportyOccurrence("sporty:ssc:winter-tournament", "sporty:ssc:winter-tournament:2026-08-20", "Winter Tournament", canonicalUrl, { venue: "Nga Puna Wai", locality: "Christchurch", region: "Canterbury", canterburyHosted: true }),
      sportyOccurrence("sporty:ssc:entries-close", "sporty:ssc:entries-close:2026-08-10", "Winter Tournament Entries Close", canonicalUrl, { venue: "Online", locality: "Christchurch", region: "Canterbury", canterburyHosted: true }),
      sportyOccurrence("sporty:ssc:unlocated", "sporty:ssc:unlocated:2026-08-25", "Unlocated Tournament", canonicalUrl, { venue: null, locality: null, region: null, canterburyHosted: null }),
    ],
    totalSeries: 3,
    totalOccurrences: 3,
    truncated: false,
    quality: "partial",
    missingFields: ["occurrences[2].venue"],
    warnings: [],
    fieldSources: { series: "fixture", occurrences: "fixture" },
  };
}

function sportySeries(seriesId: string, title: string, canonicalUrl: string) {
  return { seriesId, title, sport: "Athletics", genderGrade: "Secondary", sourceOrganisation: "School Sport Canterbury", canonicalUrl, sourceUpdated: null, imageUrl: null, description: null, fieldSources: { title: "fixture" } };
}

function sportyOccurrence(seriesId: string, occurrenceId: string, title: string, canonicalUrl: string, location: { venue: string | null; locality: string | null; region: string | null; canterburyHosted: boolean | null }) {
  return { seriesId, occurrenceId, title, sport: "Athletics", genderGrade: "Secondary", venue: location.venue, address: null, locality: location.locality, region: location.region, startsAt: "2026-08-20", endsAt: "2026-08-20", timePrecision: "DATE", timezone: "Pacific/Auckland", status: "SCHEDULED", canonicalUrl, sourceOrganisation: "School Sport Canterbury", sourceUpdated: null, imageUrl: null, description: null, canterburyHosted: location.canterburyHosted, fieldSources: { title: "fixture" } };
}

function ticketekListing() {
  const canonicalUrl = "https://premier.ticketek.co.nz/shows/show.aspx?sh=SHOW26";
  return {
    data_schema: "ticketek-public.collect_listing",
    schema_version: "1.0.0",
    extractor: "ticketek",
    kind: "event_listing",
    title: "What's On",
    canonicalUrl: "https://premier.ticketek.co.nz/shows/whatson.aspx?d=NDays&dn=30",
    currentPage: 1,
    series: [{ seriesId: "ticketek:SHOW26", title: "Example Show", category: "Theatre", imageUrl: null, canonicalUrl, status: "SCHEDULED", sourceUpdated: null, description: "A public event", fieldSources: { title: "fixture" } }],
    occurrences: [
      { occurrenceId: "ticketek:SHOW26:PERF1", seriesId: "ticketek:SHOW26", title: "Example Show", startsAt: "2026-08-20T19:30:00", endsAt: null, timePrecision: "DATETIME", timezone: "Pacific/Auckland", venue: "Isaac Theatre Royal", city: "Christchurch", region: "Canterbury", status: "SCHEDULED", ticketState: "AVAILABLE", canonicalUrl, fieldSources: { title: "fixture" } },
      { occurrenceId: "ticketek:SHOW26:unresolved", seriesId: "ticketek:SHOW26", title: "Example Show", startsAt: null, endsAt: null, timePrecision: "DATE", timezone: "Pacific/Auckland", venue: null, city: null, region: null, status: "UNKNOWN", ticketState: "UNKNOWN", canonicalUrl, fieldSources: { title: "fixture" } },
    ],
    totalSeries: 1,
    totalOccurrences: 2,
    truncated: false,
    quality: "partial",
    missingFields: ["occurrences[1].startsAt"],
    warnings: [],
    fieldSources: { series: "fixture", occurrences: "fixture" },
  };
}
