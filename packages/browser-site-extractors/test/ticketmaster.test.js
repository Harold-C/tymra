import assert from "node:assert/strict";
import test from "node:test";

import { extractTicketmasterPage } from "../src/index.js";

test("extracts Ticketmaster NZ events from public Next data", () => {
  const event = {
    "@type": "MusicEvent",
    url: "https://www.ticketmaster.co.nz/sample-auckland-21-07-2026/event/240064959CF424FB?brand=x",
    name: "Sample Concert",
    description: "Public event description",
    startDate: "2026-07-21T19:30:00",
    endDate: "2026-07-21",
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: "Auckland Town Hall", address: { streetAddress: "301 Queen Street", addressLocality: "Auckland", addressCountry: "NZ" }, geo: { latitude: -36.85, longitude: 174.76 } },
    offers: { "@type": "Offer", availability: "https://schema.org/InStock", url: "https://www.ticketmaster.co.nz/sample/event/240064959CF424FB" },
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { eventsJsonLD: [[event]] } } })}</script>`;
  const result = extractTicketmasterPage({ html, title: "Auckland Events", finalUrl: "https://www.ticketmaster.co.nz/discover/auckland?ref=x" });
  assert.equal(result.kind, "listing");
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], {
    eventId: "240064959CF424FB", title: "Sample Concert", sourceUrl: "https://www.ticketmaster.co.nz/sample-auckland-21-07-2026/event/240064959CF424FB", description: "Public event description", category: "MusicEvent", startsAt: "2026-07-21T19:30:00", endsAt: "2026-07-21", eventStatus: "EventScheduled", venue: { name: "Auckland Town Hall", address: { streetAddress: "301 Queen Street", addressLocality: "Auckland", addressCountry: "NZ" }, latitude: -36.85, longitude: 174.76 }, offers: [{ availability: "InStock", url: "https://www.ticketmaster.co.nz/sample/event/240064959CF424FB" }], performers: [], imageUrls: [],
  });
});

test("rejects missing event identity and ignores partner events", () => {
  const events = [
    { "@type": "MusicEvent", name: "Missing URL", startDate: "2026-08-01" },
    { "@type": "MusicEvent", name: "Partner", startDate: "2026-08-01", url: "https://partner.example/event/1" },
  ];
  const html = `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { eventsJsonLD: events } } })}</script>`;
  assert.throws(() => extractTicketmasterPage({ html, title: "Events", finalUrl: "https://www.ticketmaster.co.nz/discover/auckland" }), /no supported event JSON-LD/);
});

test("classifies an event URL as a detail extraction", () => {
  const event = { "@type": "EducationEvent", url: "https://www.ticketmaster.co.nz/sample/event/240064959CF424FB", name: "Sample Talk", startDate: "2026-07-21T19:30:00", eventStatus: "https://schema.org/EventCancelled" };
  const html = `<script type="application/ld+json">${JSON.stringify(event)}</script>`;
  const result = extractTicketmasterPage({ html, title: "Sample Talk", finalUrl: `${event.url}?ref=detail` });
  assert.equal(result.kind, "event_detail");
  assert.equal(result.canonicalUrl, event.url);
  assert.equal(result.events[0].eventStatus, "EventCancelled");
});
