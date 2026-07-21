import { describe, expect, it } from "vitest";

import { eventfindaEvidenceTtlHours, eventfindaFailureBackoff, eventfindaPaginationNeedsProbe, eventfindaRefreshPolicy, normaliseEventfindaDetail, type EventfindaDetailExtraction } from "../src/eventfinda";

const detail: EventfindaDetailExtraction = {
  extractor: "eventfinda", kind: "event_detail", eventId: "922033", title: "Sample Event", canonicalUrl: "https://www.eventfinda.co.nz/2026/sample/auckland", category: "Theatre", description: "Description", imageUrls: ["https://cdn.eventfinda.co.nz/sample.jpg"],
  venue: { name: "Town Hall", address: { streetAddress: "1 Queen Street", addressLocality: "Auckland", addressRegion: "Auckland", postalCode: "1010", addressCountry: "New Zealand" }, latitude: -36.84, longitude: 174.76 },
  offers: [{ name: "Adult", price: "25.00", availability: "InStock" }], performers: [{ name: "The Group" }], restrictions: "All Ages", phoneSales: "0800 BUY TIX", websites: [{ label: "Official", url: "https://example.org" }], listedBy: [], tour: [],
  occurrences: [{ name: "Sample Event", description: "Description", sourceUrl: "https://www.eventfinda.co.nz/2026/sample/auckland", startDate: "2026-08-16T18:00:00+12:00", endDate: "2026-08-16T20:00:00+12:00", previousStartDate: null, eventStatus: "EventScheduled", attendanceMode: "OfflineEventAttendanceMode", imageUrls: [], location: null, offers: [], performers: [], organizer: null }],
};

describe("Eventfinda normalisation", () => {
  it("produces one stable source occurrence per event time with rich metadata", () => {
    const events = normaliseEventfindaDetail(detail, { sponsored: true });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ externalId: "922033:2026-08-16T06:00:00.000Z", title: "Sample Event", city: "Auckland", countryCode: "NZ", ticketStatus: "ONSALE", status: "SCHEDULED", fixture: false });
    expect(events[0].metadata).toMatchObject({ description: "Description", restrictions: "All Ages", extractionVersion: "eventfinda-jsonld-v1" });
  });

  it("uses tiered refresh intervals and exponential failure backoff", () => {
    const now = new Date("2026-08-15T00:00:00Z");
    const events = normaliseEventfindaDetail(detail);
    expect(eventfindaRefreshPolicy(events, now)).toMatchObject({ active: true, priority: 10, nextFetchAt: new Date("2026-08-15T03:00:00Z") });
    expect(eventfindaFailureBackoff(1, true, now)).toEqual(new Date("2026-08-15T02:00:00Z"));
    expect(eventfindaFailureBackoff(5, true, now)).toEqual(new Date("2026-08-16T00:00:00Z"));
    const ongoing = [{ ...events[0], startsAt: new Date("2026-08-14T00:00:00Z"), endsAt: new Date("2026-08-16T00:00:00Z") }];
    expect(eventfindaRefreshPolicy(ongoing, now)).toMatchObject({ active: true, priority: 10, nextFetchAt: new Date("2026-08-15T03:00:00Z") });
  });

  it("retains failed and manual-required browser evidence for the failure TTL", () => {
    expect(eventfindaEvidenceTtlHours("success", 72, 168)).toBe(72);
    expect(eventfindaEvidenceTtlHours("failed", 72, 168)).toBe(168);
    expect(eventfindaEvidenceTtlHours("manual_required", 72, 168)).toBe(168);
  });

  it("probes page two when a full first page loses its pagination controls", () => {
    const listing = { extractor: "eventfinda" as const, kind: "listing" as const, title: "Events", canonicalUrl: "https://www.eventfinda.co.nz/whatson/events/new-zealand", currentPage: 1, totalPages: 1, nextUrl: null, events: Array.from({ length: 18 }, (_, index) => ({ eventId: `${index}`, title: `Event ${index}`, sourceUrl: `https://www.eventfinda.co.nz/2026/event-${index}/auckland`, startsAt: null, venueName: null, location: null, category: null, imageUrl: null, sponsored: false, ticketAction: null })) };
    expect(eventfindaPaginationNeedsProbe(listing)).toBe(true);
    expect(eventfindaPaginationNeedsProbe({ ...listing, events: listing.events.slice(0, 17) })).toBe(false);
    expect(eventfindaPaginationNeedsProbe({ ...listing, totalPages: 187 })).toBe(false);
  });

  it("normalises Eventfinda placeholders without inventing business facts", () => {
    const placeholderDetail: EventfindaDetailExtraction = {
      ...detail,
      category: null,
      venue: { ...detail.venue!, address: { streetAddress: "134 Oxford Terrace", addressLocality: "Christchurch", addressCountry: "New Zealand" } },
      offers: [{ name: "Choose What You Pay", price: "20.00", url: "https://www.eventfinda.co.nz/tickets" }],
      performers: [],
      occurrences: [{ ...detail.occurrences[0], sourceUrl: "https://www.eventfinda.co.nz/2026/sample/christchurch", startDate: "2026-08-16T18:00:00+12:00", endDate: "2026-08-16T23:59:59+12:00", eventStatus: null, performers: [] }],
    };
    const [event] = normaliseEventfindaDetail(placeholderDetail, { category: "Theatre", ticketAction: "Buy Tickets" });
    expect(event).toMatchObject({ city: "Christchurch", region: "Canterbury", category: "Theatre", status: "SCHEDULED", ticketStatus: "ONSALE" });
    expect(event.endsAt).toEqual(event.startsAt);
    expect(event.metadata).toMatchObject({ endTimeMissing: true, performers: [] });
  });
});
