import { describe, expect, it } from "vitest";
import { eventbriteArgusRawRecords, eventbriteExtractionSchema, eventbriteListingUrls } from "../src/collection/eventbrite-argus";

const base = eventbriteListingUrls[0];
const range = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z") };
const event = {
  "@type": "Event", name: "Community Expo",
  url: "https://www.eventbrite.co.nz/e/community-expo-tickets-123",
  startDate: "2026-11-20T10:00:00+13:00", endDate: "2026-11-20T16:00:00+13:00",
  location: { "@type": "Place", name: "Convention Centre", address: { streetAddress: "1 Main Street", addressLocality: "Christchurch", addressRegion: "Canterbury", addressCountry: "NZ" } },
};

function result(overrides: Record<string, unknown> = {}) {
  return eventbriteExtractionSchema.parse({
    data_schema: "eventbrite-public.collect_events", schema_version: "1.0.0", canonicalUrl: base,
    jsonLdPages: [{ url: base, blocks: [JSON.stringify(event)] }], pageCount: 1, requestCount: 2,
    truncated: false, ...overrides,
  });
}

describe("Eventbrite raw browser handoff", () => {
  it("preserves event identity, actual dates/location and pending promotion, accounting for the duplicate request", () => {
    const records = eventbriteArgusRawRecords(result(), base, range, 500);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sourceId: "eventbrite_events", networkRequestCount: 2, fixture: false,
      externalId: "eventbrite_events:community-expo-tickets-123:2026-11-19T21:00:00.000Z",
      payload: { kind: "event", event: { title: "Community Expo", city: "Christchurch", countryCode: "NZ", impactStatus: "PENDING_EVIDENCE" } },
    });
  });

  it("deduplicates occurrences across pages and applies the original bounded range and record cap", () => {
    const data = result({ jsonLdPages: [{ url: base, blocks: [JSON.stringify([event, { ...event, name: "Earlier", startDate: "2026-10-01T00:00:00+13:00", endDate: "2026-10-01T10:00:00+13:00" }])] }, { url: `${base}?page=2`, blocks: [JSON.stringify(event)] }], pageCount: 2, requestCount: 2 });
    const records = eventbriteArgusRawRecords(data, base, range, 1);
    expect(records).toHaveLength(1); expect(records[0]!.networkRequestCount).toBe(2);
  });

  it("rejects changed markets, routes, request counts, invalid JSON and oversized blocks", () => {
    expect(() => eventbriteArgusRawRecords(result(), eventbriteListingUrls[1], range, 500)).toThrow(/market changed/u);
    for (const overrides of [
      { pageCount: 2 }, { requestCount: 0 }, { requestCount: 3 },
      { canonicalUrl: "https://example.com/" },
      { jsonLdPages: [{ url: `${base}?page=3`, blocks: [JSON.stringify(event)] }] },
      { jsonLdPages: [{ url: base, blocks: ["not-json"] }] },
      { jsonLdPages: [{ url: base, blocks: [JSON.stringify("x".repeat(256 * 1024))] }] },
    ]) expect(() => result(overrides)).toThrow();
  });

  it("rejects an unsupported or out-of-range listing instead of claiming an empty successful run", () => {
    expect(() => eventbriteArgusRawRecords(result({ jsonLdPages: [{ url: base, blocks: ['{"@type":"WebSite"}'] }] }), base, range, 500)).toThrow(/no supported/u);
    expect(() => eventbriteArgusRawRecords(result(), base, { from: new Date("2027-01-01"), to: new Date("2027-02-01") }, 500)).toThrow(/requested range/u);
  });
});
