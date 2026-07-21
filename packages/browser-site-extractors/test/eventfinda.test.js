import assert from "node:assert/strict";
import test from "node:test";

import { extractEventfindaPage } from "../src/index.js";

test("extracts Eventfinda listing discovery and pagination", () => {
  const html = `<div class="listings-events"><div class="card h-event sponsored"><script>_efC(3, 922033)</script><h3 class="p-name"><a href="/2026/sample/auckland">Sample Event</a></h3><p class="p-location"><a class="location">Town Hall</a>, Auckland</p><p class="meta-date"><span class="dtstart"><span class="value-title" title="2026-08-16T18:00:00+12:00"></span></span><span class="category">Theatre</span></p><img data-src="https://cdn.eventfinda.co.nz/sample.jpg"></div></div><ul class="pagination"><li class="next"><a href="/whatson/events/new-zealand/page/2">Next</a></li><li class="last"><a href="/whatson/events/new-zealand/page/186">Last</a></li></ul>`;
  const result = extractEventfindaPage({ html, title: "Events", finalUrl: "https://www.eventfinda.co.nz/whatson/events/new-zealand" });
  assert.equal(result.kind, "listing");
  assert.equal(result.totalPages, 186);
  assert.deepEqual(result.events[0], {
    eventId: "922033", title: "Sample Event", sourceUrl: "https://www.eventfinda.co.nz/2026/sample/auckland", startsAt: "2026-08-16T18:00:00+12:00", venueName: "Town Hall", location: "Town Hall, Auckland", category: "Theatre", imageUrl: "https://cdn.eventfinda.co.nz/sample.jpg", sponsored: true, ticketAction: null,
  });
});

test("extracts every Eventfinda occurrence and rich detail metadata", () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify([
    { "@type": "Place", "@id": "venue:1", name: "Town Hall", address: { "@type": "PostalAddress", streetAddress: "1 Queen Street", addressLocality: "Auckland", addressRegion: "Auckland", postalCode: "1010", addressCountry: "New Zealand" }, geo: { "@type": "GeoCoordinates", latitude: -36.84, longitude: 174.76 } },
    { "@type": "Offer", "@id": "offer:1", name: "Adult", price: "25.00", priceCurrency: "NZD", availability: "https://schema.org/InStock", url: "https://www.eventfinda.co.nz/tickets" },
    { "@type": "PerformingGroup", "@id": "performer:1", name: "The Group" },
    { "@type": "PerformingGroup", "@id": "performer:placeholder", name: "n/a" },
    { "@type": "SportsEvent", name: "Sample Event", description: "<p>Full description</p>", url: "https://www.eventfinda.co.nz/2026/sample/auckland", startDate: "2026-08-16T18:00:00+12:00", endDate: "2026-08-16T20:00:00+12:00", eventStatus: "https://schema.org/EventScheduled", location: { "@id": "venue:1" }, offers: [{ "@id": "offer:1" }], performer: [{ "@id": "performer:1" }, { "@id": "performer:placeholder" }], image: ["https://cdn.eventfinda.co.nz/sample.jpg"] },
    { "@type": "Festival", name: "Sample Event", url: "https://www.eventfinda.co.nz/2026/sample/auckland", startDate: "2026-08-17T18:00:00+12:00", endDate: "2026-08-17T20:00:00+12:00", location: { "@id": "venue:1" } },
  ])}</script></head><body><script>_efC(3, 922033)</script><h1 class="p-name">Sample Event</h1><div id="eventDescription"><p>Full description</p></div><div class="module restrictions"><h2>Restrictions</h2><p>All Ages</p></div><div class="module websites"><a href="https://example.org">Official site</a></div></body></html>`;
  const result = extractEventfindaPage({ html, title: "Sample Event", finalUrl: "https://www.eventfinda.co.nz/2026/sample/auckland?ref=x" });
  assert.equal(result.kind, "event_detail");
  assert.equal(result.eventId, "922033");
  assert.equal(result.occurrences.length, 2);
  assert.equal(result.occurrences[0].eventStatus, "EventScheduled");
  assert.equal(result.occurrences[0].location.address.addressLocality, "Auckland");
  assert.equal(result.occurrences[0].offers[0].availability, "InStock");
  assert.equal(result.occurrences[0].performers[0].name, "The Group");
  assert.equal(result.occurrences[0].performers.length, 1);
  assert.equal(result.performers.length, 1);
  assert.equal(result.description, "Full description");
  assert.equal(result.restrictions, "Restrictions All Ages");
  assert.equal(result.websites[0].url, "https://example.org/");
});
