import { describe, expect, it } from "vitest";

import {
  canonicalTicketmasterUrl,
  groupTicketmasterListingEvents,
  isTicketmasterDetailUrl,
  normaliseTicketmasterEvent,
  normaliseTicketmasterEvents,
  ticketmasterChallengeTransition,
  ticketmasterCircuitStatus,
  ticketmasterCircuitSuccessMetadata,
  ticketmasterFailureBackoff,
  ticketmasterListingCoverage,
  ticketmasterRefreshPolicy,
  ticketmasterRequestDelayMs,
  ticketmasterUrlHash,
  TICKETMASTER_LISTING_URLS,
} from "../src/collection/ticketmaster";

describe("Ticketmaster normalisation", () => {
  it("normalises a public NZ event and preserves source metadata", () => {
    const event = normaliseTicketmasterEvent({ eventId: "240064959CF424FB", title: "Sample", sourceUrl: "https://www.ticketmaster.co.nz/sample/event/240064959CF424FB", category: "MusicEvent", startsAt: "2026-07-21T19:30:00", endsAt: "2026-07-21", eventStatus: "EventScheduled", venue: { name: "Town Hall", address: { streetAddress: "301 Queen Street", addressLocality: "Auckland", addressRegion: "NZ", postalCode: "1010", addressCountry: "NZ" }, latitude: -36.85, longitude: 174.76 }, offers: [{ availability: "InStock" }] });
    expect(event).toMatchObject({ externalId: "240064959CF424FB", city: "Auckland", region: "Auckland", status: "SCHEDULED", ticketStatus: "ONSALE", startsAt: new Date("2026-07-21T07:30:00.000Z"), endsAt: new Date("2026-07-21T07:30:00.000Z"), metadata: { canonicalisationNote: "missing-exact-end-collapsed-to-start" } });
  });

  it("rejects missing identity and foreign URLs", () => {
    expect(normaliseTicketmasterEvent({ eventId: "", title: "Missing", sourceUrl: "https://www.ticketmaster.co.nz/", startsAt: "2026-07-21" })).toBeNull();
    expect(normaliseTicketmasterEvent({ eventId: "1", title: "Foreign", sourceUrl: "https://example.com/event/1", startsAt: "2026-07-21" })).toBeNull();
  });

  it("uses a bounded nationwide city roster and request delay", () => {
    expect(TICKETMASTER_LISTING_URLS).toEqual([
      "https://www.ticketmaster.co.nz/discover/auckland",
      "https://www.ticketmaster.co.nz/discover/wellington",
      "https://www.ticketmaster.co.nz/discover/christchurch",
      "https://www.ticketmaster.co.nz/discover/hamilton",
      "https://www.ticketmaster.co.nz/discover/rotorua",
    ]);
    expect(ticketmasterRequestDelayMs(5_000, 4_000, () => 0.5)).toBe(7_000);
  });

  it("canonicalises only approved detail URLs and hashes them stably", () => {
    const canonical = "https://www.ticketmaster.co.nz/sample/event/240064959CF424FB";
    expect(isTicketmasterDetailUrl(`${canonical}?brand=x#tickets`)).toBe(true);
    expect(isTicketmasterDetailUrl("https://example.com/sample/event/240064959CF424FB")).toBe(false);
    expect(canonicalTicketmasterUrl(`${canonical}?brand=x#tickets`)).toBe(canonical);
    expect(ticketmasterUrlHash(`${canonical}?brand=x`)).toBe(ticketmasterUrlHash(canonical));
  });

  it("groups repeated listing observations by detail URL and keeps each date", () => {
    const base = { eventId: "series", title: "Tour", sourceUrl: "https://www.ticketmaster.co.nz/tour/event/series", category: "MusicEvent", eventStatus: "EventScheduled", venue: { name: "Town Hall", address: { addressLocality: "Auckland" } } };
    const groups = groupTicketmasterListingEvents([
      { ...base, startsAt: "2026-08-02T19:30:00" },
      { ...base, startsAt: "2026-08-01T19:30:00" },
      { ...base, startsAt: "2026-08-01T19:30:00" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((event) => event.startsAt)).toEqual(["2026-08-01T19:30:00", "2026-08-02T19:30:00"]);
  });

  it("uses complete listing JSON-LD without requiring a detail page", () => {
    const complete = { eventId: "1", title: "Complete", sourceUrl: "https://www.ticketmaster.co.nz/complete/event/1", category: "MusicEvent", startsAt: "2026-08-01T19:30:00", eventStatus: "EventScheduled", venue: { name: "Town Hall", address: { addressLocality: "Auckland" } } };
    expect(ticketmasterListingCoverage([complete])).toMatchObject({ complete: true, events: [{ externalId: "1", city: "Auckland" }] });
    expect(ticketmasterListingCoverage([{ ...complete, venue: undefined }])).toMatchObject({ complete: false });
  });

  it("keeps one source series and distinct occurrence identities for repeated dates", () => {
    const base = { eventId: "series", title: "Tour", sourceUrl: "https://www.ticketmaster.co.nz/tour/event/series", category: "MusicEvent", eventStatus: "EventScheduled", venue: { name: "Town Hall", address: { addressLocality: "Auckland" } } };
    const events = normaliseTicketmasterEvents([
      { ...base, startsAt: "2026-08-01T19:30:00" },
      { ...base, startsAt: "2026-08-02T19:30:00" },
    ]);
    expect(events.map((event) => event.externalId)).toEqual([
      "series:2026-08-01T07:30:00.000Z",
      "series:2026-08-02T07:30:00.000Z",
    ]);
    expect(events.map((event) => event.metadata.sourceEventId)).toEqual(["series", "series"]);
  });

  it("paces refreshes by event horizon and backs failures off", () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    const event = normaliseTicketmasterEvent({ eventId: "1", title: "Future", sourceUrl: "https://www.ticketmaster.co.nz/future/event/1", startsAt: "2026-07-22T19:30:00", eventStatus: "EventScheduled" });
    expect(ticketmasterRefreshPolicy([event!], now)).toMatchObject({ active: true, priority: 10, nextFetchAt: new Date("2026-07-21T06:00:00.000Z") });
    expect(ticketmasterRefreshPolicy([event!], now, 3)).toMatchObject({ active: true, priority: 10, nextFetchAt: new Date("2026-07-22T00:00:00.000Z") });
    expect(ticketmasterFailureBackoff(1, false, now)).toEqual(new Date("2026-07-21T00:30:00.000Z"));
    expect(ticketmasterFailureBackoff(1, true, now)).toEqual(new Date("2026-07-21T06:00:00.000Z"));
  });

  it("retires cancelled events without scheduling another detail fetch", () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    const event = normaliseTicketmasterEvent({ eventId: "cancelled", title: "Cancelled", sourceUrl: "https://www.ticketmaster.co.nz/cancelled/event/cancelled", startsAt: "2026-07-22T19:30:00", eventStatus: "EventCancelled" });
    expect(event).toMatchObject({ status: "CANCELLED" });
    expect(ticketmasterRefreshPolicy([event!], now)).toEqual({ active: false, priority: 900, nextFetchAt: null });
  });

  it("opens an adaptive 6/24/72 hour circuit and then requires manual review", () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    const first = ticketmasterChallengeTransition({}, now);
    expect(first).toMatchObject({ challengeCount: 1, cooldownHours: 6, state: "OPEN", cooldownUntil: new Date("2026-07-21T06:00:00.000Z") });
    const second = ticketmasterChallengeTransition(first.metadata, new Date("2026-07-21T06:00:01.000Z"));
    expect(second).toMatchObject({ challengeCount: 2, cooldownHours: 24, state: "OPEN", cooldownUntil: new Date("2026-07-22T06:00:01.000Z") });
    const third = ticketmasterChallengeTransition(second.metadata, new Date("2026-07-22T06:00:02.000Z"));
    expect(third).toMatchObject({ challengeCount: 3, cooldownHours: 72, state: "MANUAL_REQUIRED", cooldownUntil: new Date("2026-07-25T06:00:02.000Z") });
    expect(ticketmasterCircuitStatus(third.metadata, new Date("2026-07-30T00:00:00.000Z"))).toMatchObject({ state: "MANUAL_REQUIRED", blocked: true, halfOpen: false });
  });

  it("allows one half-open probe after cooldown and resets on success", () => {
    const challenged = ticketmasterChallengeTransition({}, new Date("2026-07-21T00:00:00.000Z"));
    expect(ticketmasterCircuitStatus(challenged.metadata, new Date("2026-07-21T05:59:59.000Z"))).toMatchObject({ state: "OPEN", blocked: true, halfOpen: false });
    expect(ticketmasterCircuitStatus(challenged.metadata, new Date("2026-07-21T06:00:01.000Z"))).toMatchObject({ state: "HALF_OPEN", blocked: false, halfOpen: true, challengeCount: 1 });
    const recovered = ticketmasterCircuitSuccessMetadata(challenged.metadata, new Date("2026-07-21T06:01:00.000Z"));
    expect(recovered).toMatchObject({ ticketmasterChallengeCount: 0, ticketmasterCircuitState: "CLOSED", ticketmasterLastRecoveredAt: "2026-07-21T06:01:00.000Z" });
    expect(recovered).not.toHaveProperty("ticketmasterCooldownUntil");
  });
});
