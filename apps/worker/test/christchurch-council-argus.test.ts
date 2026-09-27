import { describe, expect, it } from "vitest";
import { christchurchCouncilExtractionSchema, councilArgusRawRecords } from "../src/collection/christchurch-council-argus";

const base = "https://www.ccc.govt.nz/news-and-events/whats-on";
const next = `${base}?start_rank=16`;
const card = `<div class="event-card"><div class="card-event"><time class="card-pre-heading">11 to 13 November 2026</time><h4 class="card-title"><a href="/search-results/searchRedirect?url=https%3A%2F%2Fwww.ccc.govt.nz%2Fnews-and-events%2Fwhats-on%2Fevent%2Fthe-show">The Show</a></h4></div></div>`;
const page1 = `${card}<a class="next-prev-link" href="${next}">Next</a>`;
const range = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-30T23:59:59Z") };

function result(overrides: Record<string, unknown> = {}) {
  return christchurchCouncilExtractionSchema.parse({
    data_schema: "christchurch-council-events.collect_events",
    schema_version: "1.0.0",
    canonicalUrl: base,
    listingPages: [{ url: base, html: page1 }, { url: next, html: card }],
    pageCount: 2,
    cardCount: 2,
    truncated: false,
    ...overrides,
  });
}

describe("Christchurch Council Argus handoff", () => {
  it("preserves the original event identity and deduplicates repeated cards across pages", () => {
    const records = councilArgusRawRecords(result(), range, 2);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sourceId: "christchurch_council_events",
      externalId: "ccc-whats-on:the-show:2026-11-11",
      networkRequestCount: 2,
    });
  });

  it("rejects a broken page chain or changed card count", () => {
    expect(() => councilArgusRawRecords(result({ cardCount: 3 }), range, 2)).toThrow(/card count mismatch/u);
    expect(() => councilArgusRawRecords(result({ listingPages: [{ url: base, html: page1 }, { url: `${base}?start_rank=31`, html: card }] }), range, 2)).toThrow(/page chain/u);
  });
});
