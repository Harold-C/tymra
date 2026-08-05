import { describe, expect, it } from "vitest";

import type { PublicEvent } from "@tymra/providers";

import { enrichEventVenue } from "../src/collection/venue-reference";

const event: PublicEvent = {
  sourceId: "te_pae_events", externalId: "sample", title: "Sample Conference", category: "Conference", subcategory: null,
  sourceUrl: "https://www.tepae.co.nz/whats-on/sample", venueName: "Te Pae Christchurch Convention Centre",
  address: null, city: "Christchurch", region: "Canterbury", territorialAuthority: null, postcode: null,
  countryCode: "NZ", latitude: null, longitude: null, timezone: "Pacific/Auckland",
  startsAt: new Date("2026-09-01T09:00:00+12:00"), endsAt: new Date("2026-09-01T17:00:00+12:00"),
  status: "SCHEDULED", ticketStatus: null, impactStatus: "PENDING_EVIDENCE", impactScore: null,
  impactConfidence: null, impactEvidence: {}, sourceUpdatedAt: null, metadata: {}, fixture: false,
};

describe("trusted venue enrichment", () => {
  it("adds attributable location and capacity without claiming event attendance", () => {
    const enriched = enrichEventVenue(event);
    expect(enriched.event).toMatchObject({ address: "188 Oxford Terrace, Christchurch 8011", postcode: "8011", impactStatus: "PENDING_EVIDENCE" });
    expect(enriched.reference).toMatchObject({ key: "te-pae-christchurch", capacity: 3_600 });
    expect(enriched.event.impactEvidence.items).toEqual([expect.objectContaining({ evidenceType: "VENUE_CAPACITY", value: 3_600 })]);
  });

  it("does not infer a venue from a partial or unrelated name", () => {
    expect(enrichEventVenue({ ...event, venueName: "Te Pae Annex" }).reference).toBeNull();
    expect(enrichEventVenue({ ...event, venueName: null }).event.address).toBeNull();
  });
});
