import { describe, expect, it } from "vitest";

import { AdapterError, changedMetServiceFeedItems, extractEventfindaHttpPage, extractTicketmasterHttpPage, metServiceFeedItemVersion, otaAdapters, parseAirportMonthlyPassengers, parseAraAcademicCalendar, parseAucklandLivePage, parseCanterburyMajorAnnualEvent, parseChristchurchCouncilEventsPage, parseChristchurchNzPage, parseChristchurchRacing, parseChristchurchSports, parseCruiseDashboard, parseEducationSchoolHolidays, parseEmploymentPublicHolidays, parseFlightTime, parseIsaacTheatreRoyalEvents, parseMbieAccommodationTail, parseMetServiceCapAlert, parseMetServiceCapFeed, parseNztaDelays, parseOurAucklandPage, parsePlatformJsonLdEvents, parsePoalCruiseCsv, parseQueenstownAirportFlights, parseStatsNzInternationalTravel, parseTePaeEvents, parseUcKeyDates, parseUniversityEvents, parseVenuesOtautahiStories, parseVenuesOtautahiToken, publicDataAdapters } from "../src";

const fixtureContext = { mode: "fixture" as const, correlationId: "adapter-contract", locale: "en" as const, currency: "NZD" as const };
const liveContext = { ...fixtureContext, mode: "live" as const };
const samples: Record<string, string> = {
  booking: "https://www.booking.com/hotel/nz/example-stay.html?aid=123",
  airbnb: "https://www.airbnb.co.nz/rooms/12345678?source_impression_id=x",
  expedia: "https://www.expedia.co.nz/Hotel-Information-12345",
  hotels: "https://nz.hotels.com/ho12345",
  agoda: "https://www.agoda.com/hotel/nz/12345.html",
  trip: "https://www.trip.com/hotels/detail/12345",
  google_hotels: "https://www.google.co.nz/travel/hotels?q=Example%20Stay",
};

describe("OTA adapter contract", () => {
  for (const [sourceId, adapter] of Object.entries(otaAdapters)) {
    it(`${sourceId} resolves, canonicalises and provides deterministic fixture evidence`, async () => {
      const listing = await adapter.resolveListing(samples[sourceId], fixtureContext);
      expect(listing.sourceId).toBe(sourceId);
      expect(listing.canonicalUrl).not.toContain("aid=");
      const units = await adapter.listUnits(listing, fixtureContext);
      const query = { sourceListingId: listing.sourceListingId, unitExternalId: units[0].externalId, checkIn: "2026-08-01", nights: 1, adults: 2, childrenAges: [], units: 1, collectionProfileKey: "public-v1" };
      const rates = await adapter.fetchRates(query, fixtureContext);
      expect(rates[0]).toMatchObject({ currency: "NZD", fixture: true, availabilityStatus: "AVAILABLE" });
      expect(await adapter.fetchAvailability(query, fixtureContext)).toHaveProperty("availabilityStatus");
      expect(await adapter.fetchPolicies(query, fixtureContext)).toHaveProperty("cancellationPolicy");
      expect((await adapter.healthCheck(fixtureContext)).status).toBe("HEALTHY");
      await expect(adapter.fetchRates(query, liveContext)).rejects.toBeInstanceOf(AdapterError);
    });
  }
});

describe("public data adapter contract", () => {
  it("exposes a complete deterministic contract and rights metadata for every public adapter", async () => {
    for (const [sourceId, adapter] of Object.entries(publicDataAdapters)) {
      expect(adapter.metadata).toMatchObject({ sourceId, sourceType: "PUBLIC_DATA" });
      expect(adapter.metadata.collectorVersion).toBeTruthy();
      expect(adapter.metadata.parserVersion).toBeTruthy();
      expect(adapter.rightsMetadata()).toMatchObject({ internalApprovalStatus: expect.any(String), legalRightsStatus: expect.any(String), retentionPolicy: expect.any(Object) });
      expect(typeof adapter.discover).toBe("function");
      expect(typeof adapter.fetch).toBe("function");
      expect(typeof adapter.normalise).toBe("function");
      expect(typeof adapter.healthCheck).toBe("function");
    }
  });

  it("parses official public and school holiday HTML conservatively", () => {
    const employment = parseEmploymentPublicHolidays(`<h2>2026 public holiday and anniversary dates</h2><table><tr><th>Holiday</th><th>Actual Date</th><th>Observed date</th></tr><tr><td>Waitangi Day</td><td>6 February</td><td>Friday 6 February</td></tr><tr><td>Unknown</td><td>Varies</td><td>To be confirmed</td></tr></table><p>Regional note</p><table><tr><th>Province</th><th>Actual date</th><th>Observed date</th></tr><tr><td>Canterbury</td><td>16 December</td><td>Friday 13 November</td></tr></table>`);
    expect(employment).toEqual([
      expect.objectContaining({ title: "Waitangi Day", startsAt: "2026-02-06", endsAt: "2026-02-07", type: "PUBLIC_HOLIDAY" }),
      expect.objectContaining({ title: "Canterbury Anniversary Day", startsAt: "2026-11-13", endsAt: "2026-11-14", type: "ANNIVERSARY_DAY" }),
    ]);

    const education = parseEducationSchoolHolidays(`<h2>2026 school holidays<a>#</a></h2><h3>Term 1<a>#</a></h3><p>Friday 3 April to Sunday 19 April 2026.</p><h3>Summer holidays<a>#</a></h3><p>Start no later than Saturday 19 December 2026 and run for 5 or 6 weeks.</p><h2>2027 school terms</h2>`);
    expect(education).toEqual([expect.objectContaining({ title: "New Zealand school holiday after Term 1", startsAt: "2026-04-03", endsAt: "2026-04-20" })]);
    expect(publicDataAdapters.public_holidays_nz.metadata.accessMethod).toBe("OFFICIAL_PUBLIC_HTML");
    expect(publicDataAdapters.school_holidays_nz.rightsMetadata().legalRightsStatus).toBe("ALLOWED");
  });

  it("uses direct HTTP Ticketmaster listings and reserves Argus for details", async () => {
    const adapter = publicDataAdapters.ticketmaster;
    expect(adapter.metadata).toMatchObject({
      supportedDomains: ["www.ticketmaster.co.nz", "ticketmaster.co.nz"],
      adapterKey: "public:ticketmaster:http-listing-argus-detail-v1",
      accessMethod: "PUBLIC_HTTP_LISTING_ARGUS_DETAIL",
      concurrencyLimit: 1,
    });
    await expect(adapter.discover({ marketScope: "new-zealand", from: new Date(), to: new Date() }, fixtureContext)).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
    await expect(adapter.fetch("https://www.ticketmaster.co.nz/", fixtureContext)).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
  });

  it("extracts Eventfinda and Ticketmaster direct HTTP listing payloads", () => {
    const eventfinda = extractEventfindaHttpPage({
      finalUrl: "https://www.eventfinda.co.nz/whatson/events/new-zealand",
      title: "Events",
      html: `<div class="listings-events"><article class="card h-event"><h2 class="p-name"><a href="/2026/sample/christchurch">Sample</a></h2><div class="dtstart"><span class="value-title" title="2026-08-20T19:00:00+12:00"></span></div><div class="p-location"><a class="location">Town Hall</a> Christchurch</div></article></div>`,
    });
    expect(eventfinda).toMatchObject({ kind: "listing", events: [{ title: "Sample", startsAt: "2026-08-20T19:00:00+12:00" }] });

    const ticketmaster = extractTicketmasterHttpPage({
      finalUrl: "https://www.ticketmaster.co.nz/discover/christchurch",
      title: "Christchurch",
      html: `<script type="application/ld+json">${JSON.stringify({ "@type": "MusicEvent", name: "Concert", startDate: "2026-09-10T19:30:00+12:00", eventStatus: "https://schema.org/EventScheduled", url: "https://www.ticketmaster.co.nz/concert/event/2400000000000001", location: { "@type": "Place", name: "Town Hall", address: { addressLocality: "Christchurch", addressCountry: "NZ" } } })}</script>`,
    });
    expect(ticketmaster).toMatchObject({ kind: "listing", events: [{ eventId: "2400000000000001", title: "Concert" }] });
  });

  it("normalises platform JSON-LD and Christchurch Airport local flight times", () => {
    const events = parsePlatformJsonLdEvents(`<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Community Expo", startDate: "2026-08-20T10:00:00+12:00", endDate: "2026-08-20T16:00:00+12:00", url: "https://www.eventbrite.co.nz/e/community-expo-tickets-123", location: { "@type": "Place", name: "Convention Centre", address: { streetAddress: "1 Main Street", addressLocality: "Christchurch", addressRegion: "Canterbury", postalCode: "8011" } } })}</script>`, "https://www.eventbrite.co.nz/d/new-zealand/events/", "eventbrite_events");
    expect(events[0]).toMatchObject({ title: "Community Expo", city: "Christchurch", countryCode: "NZ", status: "SCHEDULED" });
    expect(parseFlightTime("Tue 7:10 AM", new Date("2026-08-03T10:00:00.000Z"))?.toISOString()).toBe("2026-08-03T19:10:00.000Z");
  });

  it("uses Christchurch-specific platform routes and bounded pagination metadata", async () => {
    const request = { marketScope: "christchurch", from: new Date("2026-08-01"), to: new Date("2026-09-01") };
    await expect(publicDataAdapters.eventbrite_events.discover(request, fixtureContext)).resolves.toEqual(["https://www.eventbrite.co.nz/d/new-zealand--christchurch/events/"]);
    await expect(publicDataAdapters.humanitix_events.discover(request, fixtureContext)).resolves.toEqual(["https://humanitix.com/nz/events/nz--canterbury-region--christchurch"]);
    expect(publicDataAdapters.eventbrite_events.metadata).toMatchObject({ adapterKey: "public:eventbrite:jsonld-listing-v2", accessMethod: "PUBLIC_HTML_JSONLD_PAGINATED" });
  });

  it("parses Christchurch official sports fixtures", () => {
    const crusaders = parseChristchurchSports(`<div class="c-opta-data-block__heading"><h1>2026 Super Rugby Pacific Draw</h1></div><table class="c-fixture-table"><tbody><tr><td>13</td><td>Fri 8 May | 07:05 PM</td><td>Crusaders V Blues</td><td>One NZ Stadium, Christchurch</td><td></td></tr><tr><td>14</td><td>Fri 15 May | 07:05 PM</td><td>Crusaders V Force</td><td>Perth Stadium</td><td></td></tr></tbody></table>`, "https://www.crusaders.co.nz/fixtures/draw/");
    expect(crusaders.events).toEqual([expect.objectContaining({ title: "Crusaders V Blues", city: "Christchurch", category: "Sport", startsAt: new Date("2026-05-08T07:05:00.000Z") })]);

    const tactix = parseChristchurchSports(`<h1>2026 Draw</h1><div class="match home-game"><div class="date"><div class="additional">Round 6</div><div class="day">16</div><div class="month">May</div></div><div class="details"><div class="location">Parakiore Recreation and Sports Centre <strong>Christchurch</strong><div>Home Game</div></div></div></div>`, "https://www.tactixnetball.co.nz/tactix/draw/results.html");
    expect(tactix.events?.[0]).toMatchObject({ title: "Mainland Tactix home game - Round 6", venueName: "Parakiore Recreation and Sports Centre Christchurch" });
  });

  it("keeps only demand-relevant UC dates", () => {
    const parsed = parseUcKeyDates(`<div id="2026"><h5>2026</h5></div><div class="cmp-timeline-ordered-item"><div class="cmp-timeline-ordered-item__title-ctn"><h3>25 - 27 August</h3></div><div class="cmp-timeline-ordered-item__content-ctn"><p>Spring graduation celebrations. Add to calendar</p></div></div><div class="cmp-timeline-ordered-item"><div class="cmp-timeline-ordered-item__title-ctn"><h3>28 August</h3></div><div class="cmp-timeline-ordered-item__content-ctn"><p>Deadline to submit an assignment.</p></div></div>`, "https://www.canterbury.ac.nz/study/study-support-info/dates-and-timetables/key-university-dates");
    expect(parsed.signals).toEqual([expect.objectContaining({ type: "UNIVERSITY_CALENDAR", title: "Spring graduation celebrations.", startsAt: new Date("2026-08-24T12:00:00.000Z"), endsAt: new Date("2026-08-27T11:59:59.999Z") })]);
  });

  it("parses Addington meetings and Riccarton Cup Week dates", () => {
    const addington = parseChristchurchRacing(`<a class="racing-button" href="https://www.addington.co.nz/events/cup"><span class="date">11 November 2026<br><span>Race </span></span><span class="time">5:00pm</span></a>`, "https://www.addington.co.nz/racing/");
    expect(addington.events?.[0]).toMatchObject({ category: "Horse racing", startsAt: new Date("2026-11-11T04:00:00.000Z") });
    const riccarton = parseChristchurchRacing(`<h1>New Zealand Cup Week 2026</h1><div class="feature-tile--icon-info">7, 11, 14 November 2026</div>`, "https://racing.riccartonpark.nz/");
    expect(riccarton.events?.map((event) => event.externalId)).toEqual(["riccarton-cup-week:2026-7", "riccarton-cup-week:2026-11", "riccarton-cup-week:2026-14"]);
  });

  it("tracks the official cruise dashboard boundary and airport monthly passenger totals", () => {
    const cruise = parseCruiseDashboard(`<iframe title="Christchurch Cruise schedule 2025_26" src="https://app.powerbi.com/view?r=public-token"></iframe>`, "https://www.christchurchnz.com/visit/plan-your-visit/cruise/christchurch-cruise-schedule");
    expect(cruise.metadata).toMatchObject({ publisher: "ChristchurchNZ", underlyingSource: "New Zealand Cruise Association", extractionBoundary: "DIRECT_PUBLIC_POWERBI_JSON" });
    const airport = parseAirportMonthlyPassengers(`<h4>2026</h4><table><tr><td>Month</td><td>Domestic</td><td>International</td><td>Total</td></tr><tr><td>June</td><td>361,510</td><td>108,278</td><td>469,788</td></tr></table>`, "https://www.christchurchairport.co.nz/about-us/who-we-are/facts-and-figures/monthly-passenger-arrivals-and-departures/");
    expect(airport.signals?.[0]).toMatchObject({ type: "AIRPORT_MONTHLY_CAPACITY", startsAt: new Date("2026-05-31T12:00:00.000Z"), metadata: { domesticPassengers: 361510, internationalPassengers: 108278, totalPassengers: 469788 } });
  });

  it("parses and groups the latest MBIE ADP accommodation measures", async () => {
    const records = parseMbieAccommodationTail(`partial,row\n1/04/2026,RTO,Auckland RTO,Total,Occupancy rate,0.55,\n1/05/2026,RTO,Auckland RTO,Total,Occupancy rate,0.619,\n1/05/2026,RTO,Auckland RTO,Total,Total guest nights,617000,\n1/05/2026,RTO,Auckland RTO,Total,Quality indicator,High,\n1/05/2026,TA,Queenstown-Lakes District,Total,Occupancy rate,0.598,\n1/05/2026,TA,Queenstown-Lakes District,Total,Quality indicator,Medium,`);
    expect(records).toEqual([
      expect.objectContaining({ id: "adp:2026-05-01:rto:auckland-rto:total", area: "Auckland RTO", measures: expect.objectContaining({ "Occupancy rate": { value: 0.619, flag: null }, "Total guest nights": { value: 617000, flag: null }, "Quality indicator": { value: "High", flag: null } }) }),
      expect.objectContaining({ id: "adp:2026-05-01:ta:queenstown-lakes-district:total", area: "Queenstown-Lakes District" }),
    ]);
    const signals = await publicDataAdapters.mbie.normalise([
      { sourceId: "mbie", externalId: records[0].id, payload: records[0], fetchedAt: new Date(), fixture: false },
    ], fixtureContext);
    expect(signals[0]).toMatchObject({ type: "TOURISM_DEMAND", marketKey: "auckland", direction: "MIXED", confidence: 0.9, metadata: { period: "2026-05-01", measures: { "Occupancy rate": { value: 0.619, flag: null } } } });
    expect(publicDataAdapters.mbie.metadata).toMatchObject({ adapterKey: "public:mbie:adp-csv-v1", accessMethod: "OFFICIAL_PUBLIC_CSV_RANGE" });
  });

  it("routes RBNZ B1 through Argus", async () => {
    const adapter = publicDataAdapters.fx_rates;
    expect(adapter.metadata).toMatchObject({ adapterKey: "public:fx_rates:rbnz-browser-v1", accessMethod: "OFFICIAL_PUBLIC_HTML_BROWSER", concurrencyLimit: 1 });
    await expect(adapter.discover({ marketScope: "new-zealand", from: new Date(), to: new Date() }, fixtureContext)).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
  });

  it("parses and normalises the Stats NZ international-travel indicator", async () => {
    const record = parseStatsNzInternationalTravel(`<main><div id="pageViewData" data-value="{&quot;Title&quot;:&quot;International travel (provisional)&quot;,&quot;PageDate&quot;:&quot;2026-07-15 11:10:00&quot;,&quot;FeaturedMedia&quot;:{&quot;Name&quot;:&quot;International travel (provisional)&quot;,&quot;Value&quot;:&quot;165,900&quot;,&quot;Period&quot;:&quot;Four weeks ended 21 June 2026&quot;,&quot;IndicatorDescription&quot;:&quot;Overseas visitor arrivals (provisional)&quot;,&quot;Value2&quot;:&quot;7,290&quot;,&quot;Period2&quot;:&quot;Compared with four weeks ended 22 June 2025&quot;,&quot;IndicatorDescription2&quot;:&quot;Change from previous year&quot;,&quot;Value3&quot;:&quot;4.6 %&quot;,&quot;Period3&quot;:&quot;Compared with four weeks ended 22 June 2025&quot;,&quot;IndicatorDescription3&quot;:&quot;Percent change from previous year&quot;,&quot;LastUpdatedDate&quot;:&quot;15 July 2026&quot;,&quot;NextUpdatedDate&quot;:&quot;22 July 2026&quot;}}"></div></main>`);
    expect(record).toMatchObject({ id: "international-travel:2026-06-21:overseas-visitor-arrivals", observationStart: "2026-05-25", observationEnd: "2026-06-21", lastUpdatedDate: "2026-07-15", nextUpdatedDate: "2026-07-22", metrics: [{ value: 165900, unit: "COUNT" }, { value: 7290, unit: "COUNT" }, { value: 4.6, unit: "PERCENT" }] });
    const [signal] = await publicDataAdapters.stats_nz.normalise([{ sourceId: "stats_nz", externalId: record.id, payload: record, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signal).toMatchObject({ type: "TOURISM_DEMAND", marketKey: "new-zealand", direction: "POSITIVE", confidence: 0.85, metadata: { observationEnd: "2026-06-21" } });
    expect(signal.metadata?.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ value: 165900 })]));
    expect(publicDataAdapters.stats_nz.metadata).toMatchObject({ adapterKey: "public:stats_nz:international-travel-v1", accessMethod: "OFFICIAL_PUBLIC_HTML_EMBEDDED_JSON" });
  });

  it("parses, prioritises and normalises NZTA Journey Planner GeoJSON", async () => {
    const records = parseNztaDelays({ type: "FeatureCollection", features: [
      { type: "Feature", properties: { ExternalId: 11, Status: "Active", Name: "Area Warning: SH 1", EventType: "Area Warning", StartDate: "2026-07-20 18:30:00", EndDate: "2026-07-23 02:00:00", Impact: "Caution", EventIsland: "South Island", IsCritical: 0 }, geometry: { type: "Point", coordinates: [172, -43] } },
      { type: "Feature", properties: { ExternalId: 12, Status: "Active", Name: "Road Closure: SH 2", EventType: "Road Closure", StartDate: "2026-07-21 09:00:00", EndDate: "2026-07-22 09:00:00", Impact: "Road Closed", EventIsland: "North Island", IsCritical: 1 }, geometry: null },
      { type: "Feature", properties: { ExternalId: 13, Status: "Resolved", Name: "Old event" }, geometry: null },
    ] }, { from: new Date("2026-07-20T00:00:00.000Z"), to: new Date("2026-07-24T00:00:00.000Z") });
    expect(records.map((record) => record.id)).toEqual(["nzta-road-event:12", "nzta-road-event:11"]);
    expect(records[0]).toMatchObject({ startsAt: "2026-07-20T21:00:00.000Z", endsAt: "2026-07-21T21:00:00.000Z", feature: { properties: { Impact: "Road Closed" } } });
    const [signal] = await publicDataAdapters.nzta.normalise([{ sourceId: "nzta", externalId: records[0].id, payload: records[0], fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signal).toMatchObject({ type: "WEATHER_OR_ACCESS_DISRUPTION", direction: "NEGATIVE", confidence: 0.95, region: "North Island", metadata: { isCritical: true, geometry: null } });
    expect(publicDataAdapters.nzta.metadata).toMatchObject({ adapterKey: "public:nzta:journey-planner-delays-v1", accessMethod: "OFFICIAL_PUBLIC_GEOJSON" });
  });

  it("parses MetService CAP RSS and full CAP 1.2 alerts without dropping operational fields", async () => {
    const alertUrl = "https://alerts.metservice.com/cap/alert/urn:oid:2.49.0.1.554.0.test";
    const feed = parseMetServiceCapFeed(`<?xml version="1.0"?><rss version="2.0"><channel><title>MetService New Zealand Weather Warnings</title><link>https://alerts.metservice.com/</link><description>Current warnings</description><pubDate>Tue, 21 Jul 2026 03:00:00 GMT</pubDate><copyright>CC BY 4.0</copyright><item><title>Heavy Rain Warning</title><link>${alertUrl}</link><description>Official warning</description><pubDate>Tue, 21 Jul 2026 02:55:00 GMT</pubDate><guid>warning-123</guid></item><item><title>Rejected host</title><link>https://example.com/alert.xml</link></item></channel></rss>`);
    expect(feed).toMatchObject({ pubDate: "2026-07-21T03:00:00.000Z", copyright: "CC BY 4.0", items: [{ title: "Heavy Rain Warning", link: alertUrl, guid: "warning-123" }] });

    const alert = parseMetServiceCapAlert(`<?xml version="1.0" encoding="UTF-8"?><alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>urn:oid:2.49.0.1.554.0.test</identifier><sender>MetService</sender><sent>2026-07-21T14:55:00+12:00</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope><references>old-alert</references><info><language>en-NZ</language><category>Met</category><event>Heavy Rain Warning</event><responseType>Prepare</responseType><urgency>Expected</urgency><severity>Severe</severity><certainty>Likely</certainty><effective>2026-07-21T15:00:00+12:00</effective><onset>2026-07-21T18:00:00+12:00</onset><expires>2026-07-22T09:00:00+12:00</expires><senderName>MetService New Zealand</senderName><headline>Heavy Rain Warning - Canterbury</headline><description>Rainfall may cause disruption.</description><instruction>Keep up to date with forecasts.</instruction><web>https://www.metservice.com/warnings/home</web><parameter><valueName>ColourCode</valueName><value>Orange</value></parameter><parameter><valueName>ColourCodeHex</valueName><value>#f58220</value></parameter><area><areaDesc>Canterbury High Country</areaDesc><polygon>-43.0,171.0 -44.0,172.0 -43.0,171.0</polygon></area></info></alert>`);
    expect(alert).toMatchObject({ identifier: "urn:oid:2.49.0.1.554.0.test", sent: "2026-07-21T02:55:00.000Z", references: "old-alert", infos: [{ severity: "Severe", certainty: "Likely", parameters: { ColourCode: ["Orange"], ColourCodeHex: ["#f58220"] }, areas: [{ areaDesc: "Canterbury High Country", polygons: ["-43.0,171.0 -44.0,172.0 -43.0,171.0"] }] }] });

    const [signal] = await publicDataAdapters.metservice.normalise([{ sourceId: "metservice", externalId: `cap-alert:${alert.identifier}`, payload: { kind: "cap_alert", sourceUrl: alertUrl, feedItem: feed.items[0], alert }, fetchedAt: new Date("2026-07-21T03:00:00.000Z"), fixture: false }], fixtureContext);
    expect(signal).toMatchObject({ type: "WEATHER_OR_ACCESS_DISRUPTION", title: "Heavy Rain Warning - Canterbury", region: "Canterbury High Country", startsAt: new Date("2026-07-21T06:00:00.000Z"), endsAt: new Date("2026-07-21T21:00:00.000Z"), direction: "NEGATIVE", confidence: 0.95, metadata: { sourceFormat: "OASIS CAP 1.2", attribution: "MetService New Zealand" } });
    expect(publicDataAdapters.metservice.metadata).toMatchObject({ adapterKey: "public:metservice:cap-rss-v1", accessMethod: "OFFICIAL_PUBLIC_CAP_RSS", dailyBudget: 288 });
  });

  it("only schedules new or updated MetService CAP details", () => {
    const unchanged = { title: "Heavy Rain", link: "https://alerts.metservice.com/cap/alert/rain", description: null, pubDate: "2026-07-21T03:00:00.000Z", guid: "warning-123" };
    const updated = { ...unchanged, pubDate: "2026-07-21T04:00:00.000Z" };
    const fresh = { ...unchanged, link: "https://alerts.metservice.com/cap/alert/wind", guid: "warning-456" };
    const known = { [unchanged.link]: metServiceFeedItemVersion(unchanged) };
    expect(changedMetServiceFeedItems([unchanged, fresh], known)).toEqual([fresh]);
    expect(changedMetServiceFeedItems([updated], known)).toEqual([updated]);
  });

  it("parses University of Auckland events and preserves the official event fields", async () => {
    const event = parseUniversityEvents([{ eventId: "uoa-1", name: "Open Day", url: "https://unievents.auckland.ac.nz/event/open-day", startDateTime: "2026-08-08T10:00:00", endDateTime: "2026-08-08T16:00:00", summary: "Campus open day", location: { name: "City Campus", address1: "34 Princes Street", city: "Auckland", region: "Auckland", postCode: "1010", country: "NZ", latitude: "-36.85", longitude: "174.77", displayName: "34 Princes Street, Auckland" }, categoryName: "Community", subcategoryName: "Open day", free: true, soldOut: false }])[0];
    const events = await publicDataAdapters.university_calendars.normaliseEvents!([{ sourceId: "university_calendars", externalId: "uoa:uoa-1", payload: { provider: "University of Auckland", event }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(events[0]).toMatchObject({ externalId: "uoa:uoa-1:2026-08-07T22:00:00.000Z", city: "Auckland", startsAt: new Date("2026-08-07T22:00:00.000Z"), endsAt: new Date("2026-08-08T04:00:00.000Z"), metadata: { sourceEventId: "uoa:uoa-1", isFree: true } });
    expect(publicDataAdapters.university_calendars.metadata).toMatchObject({ accessMethod: "OFFICIAL_PUBLIC_JSON", dailyBudget: 24 });
  });

  it("parses Auckland Live pagination and emits exact performance occurrences", async () => {
    const show = { type: "shows", id: "4432", attributes: { slug: "the-civic-tours", name: "The Civic Tours", venue_name: "The Civic", description: "Tour the theatre", genres: [{ name: "special-events", description: "Special Events" }], performances: [{ id: 36433, starts_at: "2026-08-20T10:00:00+12:00", ends_at: "-0001-11-30T00:00:00+11:39", venue_name: "The Civic, Auckland", ticketmaster_availability: "limited", price_lowest: 46.9 }] } };
    const page = parseAucklandLivePage({ data: [show], links: { last: "http://api.aucklandunlimited.com/v2/live/event-search?page=12" } });
    expect(page).toMatchObject({ totalPages: 12, shows: [show] });
    const events = await publicDataAdapters.venue_calendars.normaliseEvents!([{ sourceId: "venue_calendars", externalId: "auckland-live:4432", payload: { provider: "Auckland Live", show }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(events[0]).toMatchObject({ externalId: "auckland-live:4432:36433", venueName: "The Civic, Auckland", startsAt: new Date("2026-08-19T22:00:00.000Z"), endsAt: new Date("2026-08-19T22:00:00.000Z"), ticketStatus: "ONSALE", metadata: { sourceEventId: "auckland-live:4432" } });
  });

  it("parses Te Pae listing cards without opening event details", async () => {
    const parsed = parseTePaeEvents(`<div class="event-block"><div class="content-block"><div class="h6">Australasian Weeds Conference</div><div class="p3">23 Aug 2026 - 27 Aug 2026</div></div><img src="https://www.tepae.co.nz/images/weeds.jpg"><a class="link link-overlay" href="https://example-conference.test/register"></a></div>`);
    expect(parsed[0]).toMatchObject({
      id: "te-pae:australasian-weeds-conference:2026-08-23",
      seriesId: "te-pae:australasian-weeds-conference",
      title: "Australasian Weeds Conference",
      sourceUrl: "https://example-conference.test/register",
      startsAt: "2026-08-22T12:00:00.000Z",
      endsAt: "2026-08-27T11:59:59.000Z",
      venueName: "Te Pae Christchurch Convention Centre",
      advertisedDate: "23 Aug 2026 - 27 Aug 2026",
    });
    const events = await publicDataAdapters.te_pae_events.normaliseEvents!([{ sourceId: "te_pae_events", externalId: parsed[0].id, payload: { event: parsed[0] }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(events[0]).toMatchObject({ city: "Christchurch", region: "Canterbury", postcode: "8011", fixture: false });
  });

  it("parses Isaac Theatre Royal cards as date-only event ranges", () => {
    const parsed = parseIsaacTheatreRoyalEvents(`<div class="custom-visual-card" data-category="classical &amp; orchestral music" data-location="the auditorium and stage" data-start-date="1788480000000" data-end-date="1788480000000"><a href="https://isaactheatreroyal.co.nz/event-fleetwood-macs"><img src="https://isaactheatreroyal.co.nz/image.jpg"><p class="custom-visual-card__upcoming-date">Fri 4 September 2026</p><h3 class="custom-visual-card__title">Fleetwood Macs</h3></a></div>`);
    expect(parsed[0]).toMatchObject({
      id: "isaac-theatre-royal:fleetwood-macs:2026-09-04",
      seriesId: "isaac-theatre-royal:fleetwood-macs",
      title: "Fleetwood Macs",
      category: "classical & orchestral music",
      startsAt: "2026-09-03T12:00:00.000Z",
      endsAt: "2026-09-04T11:59:59.000Z",
      venueName: "Isaac Theatre Royal",
    });
  });

  it("parses Christchurch City Council cards and follows only listing pagination", () => {
    const parsed = parseChristchurchCouncilEventsPage(`<div class="event-card"><div class="card-event"><img src="/event.jpg"><time class="card-pre-heading">11 to 13 November 2026</time><h4 class="card-title"><a href="/search-results/searchRedirect?url=https%3A%2F%2Fwww.ccc.govt.nz%2Fnews-and-events%2Fwhats-on%2Fevent%2Fthe-show">The Show</a></h4></div></div><a class="next-prev-link" href="/news-and-events/whats-on?start_rank=16">Next</a>`);
    expect(parsed.nextUrl).toBe("https://www.ccc.govt.nz/news-and-events/whats-on?start_rank=16");
    expect(parsed.events[0]).toMatchObject({
      sourceId: "christchurch_council_events",
      externalId: "ccc-whats-on:the-show:2026-11-11",
      title: "The Show",
      sourceUrl: "https://www.ccc.govt.nz/news-and-events/whats-on/event/the-show",
      startsAt: new Date("2026-11-10T11:00:00.000Z"),
      endsAt: new Date("2026-11-13T10:59:59.000Z"),
    });
  });

  it("keeps only accommodation-demand-relevant Ara academic dates", () => {
    const signals = parseAraAcademicCalendar(`<section class="wysiwygBlock"><h4>2026</h4><table><tbody><tr><td>16 February</td><td><p>Semester 1 starts</p><p>Details</p></td></tr><tr><td>13 March</td><td><p>Autumn Graduation - Christchurch</p></td></tr><tr><td>30 April</td><td><p>Timaru Graduation</p></td></tr><tr><td>13 November</td><td><p>Canterbury Anniversary Day - Christchurch campuses closed</p></td></tr></tbody></table></section>`);
    expect(signals).toHaveLength(2);
    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ externalId: "ara:semester-1-starts:2026-02-16", type: "TOURISM_DEMAND", direction: "POSITIVE" }),
      expect.objectContaining({ externalId: "ara:autumn-graduation-christchurch:2026-03-13", confidence: 0.9 }),
    ]));
  });

  it("promotes the Canterbury A&P Show only when the official page publishes scale evidence", () => {
    const [show] = parseCanterburyMajorAnnualEvent(`<main>Ravensdown Canterbury A&amp;P Show Wed 11 - Fri 13 November 2026 Canterbury Agricultural Park 70,000 Annual Visitors 400 Trade Sites 5,000 Show Events &amp; Competitions</main>`, "https://www.theshow.co.nz/");
    expect(show).toMatchObject({
      externalId: "canterbury-ap-show:2026",
      impactStatus: "PROMOTED",
      impactScore: 0.95,
      impactEvidence: { annualVisitors: 70_000 },
      metadata: { tradeSites: 400, showEventsAndCompetitions: 5_000 },
    });
    const [marathon] = parseCanterburyMajorAnnualEvent(`<main>ASICS Christchurch Marathon 18 April 2027</main>`, "https://www.christchurchmarathon.co.nz/");
    expect(marathon).toMatchObject({ externalId: "christchurch-marathon:2027", impactStatus: "PENDING_EVIDENCE", venueName: "Hagley Park" });
  });

  it("discovers and parses the Venues Otautahi public Storyblok feed", () => {
    const token = parseVenuesOtautahiToken(`<astro-island component-url="/_astro/EventIndexClient.js" props='{"initialData":[0,{"token":[0,"public-token-123"]}]}'></astro-island>`);
    expect(token).toBe("public-token-123");
    const parsed = parseVenuesOtautahiStories({ stories: [{
      id: 123,
      uuid: "event-uuid",
      name: "Robbie Williams",
      full_slug: "whats-on/robbie-williams",
      published_at: "2026-06-01T00:00:00.000Z",
      content: {
        title: "Robbie Williams",
        category: "music",
        status: "On sale now",
        event_start_date: "2026-11-28 19:30",
        event_end_date: "2026-11-28 22:30",
        event_location: ["e3979aea-e7d0-4f4d-b890-4436b7995e48"],
        tickets_url: { url: "https://www.ticketmaster.co.nz/robbie-williams" },
        tile_image: { filename: "https://a.storyblok.com/robbie.jpg" },
        event_description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Live at One NZ Stadium." }] }] },
      },
    }] });
    expect(parsed[0]).toMatchObject({
      id: "venues-otautahi:event-uuid:2026-11-28T06:30:00.000Z",
      seriesId: "venues-otautahi:event-uuid",
      title: "Robbie Williams",
      venueName: "One NZ Stadium",
      startsAt: "2026-11-28T06:30:00.000Z",
      endsAt: "2026-11-28T09:30:00.000Z",
      description: "Live at One NZ Stadium.",
      ticketStatus: "AVAILABLE_OR_UNKNOWN",
    });
  });

  it("parses OurAuckland cards conservatively as date-precision council events", async () => {
    const page = parseOurAucklandPage(`<article class="article-tile"><div class="article-tile__content"><span class="article-tile__date">21 Jul 2026 - 25 Jul 2026</span><h2><a class="article-tile__link" href="/events/2026/07/sharp-teeth/">Sharp Teeth</a></h2><p>A theatre event.</p></div></article><a class="pagination__link" data-page="32" href="?page=32">32</a>`);
    expect(page).toMatchObject({ totalPages: 32, events: [{ id: "our-auckland:sharp-teeth", title: "Sharp Teeth", startsOn: "2026-07-21", endsOn: "2026-07-25" }] });
    const events = await publicDataAdapters.council_calendars.normaliseEvents!([{ sourceId: "council_calendars", externalId: page.events[0].id, payload: { provider: "Auckland Council / OurAuckland", event: page.events[0], page: 1 }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(events[0]).toMatchObject({ city: "Auckland", startsAt: new Date("2026-07-20T12:00:00.000Z"), endsAt: new Date("2026-07-25T11:59:59.000Z"), metadata: { timePrecision: "DATE_ONLY" } });
  });

  it("normalises OurAuckland detail occurrences and preserves source quality", async () => {
    const detail = {
      kind: "event_detail", id: "our-auckland:japanese-film-screening", title: "Japanese Film Screening",
      canonicalUrl: "https://ourauckland.aucklandcouncil.govt.nz/events/2026/08/japanese-film-screening/",
      description: "A free public screening.",
      occurrences: [{ startsAt: "2026-08-28T18:00:00", endsAt: "2026-08-28T20:00:00", timePrecision: "DATETIME", timezone: "Pacific/Auckland", scheduleText: "Friday 28 August 2026 6pm-8pm" }],
      venue: { name: "Ellen Melville Centre", addressText: "Ellen Melville Centre, 2 Freyberg Place, Auckland", mapUrl: "https://maps.google.com/?q=Ellen" },
      costText: "Free", isFree: true, bookingRequired: false,
      publicContact: { name: "Example Organiser", email: "events@example.test", phone: "09 303 4106" },
      categories: ["Events"], tags: ["Cultural", "Film"], ward: "Waitematā & Gulf Ward", imageUrls: ["https://example.test/event.jpg"],
      quality: "complete", missingFields: [], warnings: [], fieldSources: { occurrences: ".event-panel__group:When" },
    };
    const events = await publicDataAdapters.council_calendars.normaliseEvents!([{ sourceId: "council_calendars", externalId: detail.id, payload: { provider: "Auckland Council / OurAuckland", event: detail, page: 1 }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(events[0]).toMatchObject({
      externalId: "our-auckland:japanese-film-screening:2026-08-28T06:00:00.000Z",
      venueName: "Ellen Melville Centre",
      startsAt: new Date("2026-08-28T06:00:00.000Z"),
      endsAt: new Date("2026-08-28T08:00:00.000Z"),
      ticketStatus: "FREE",
      metadata: { timePrecision: "DATETIME", argusQuality: "complete", bookingRequired: false },
    });
  });

  it("parses ChristchurchNZ RTO events and exact imported sessions", async () => {
    const item = { id: 13786, slug: "monthly-spoon-club-13786", title: "Monthly Spoon Club", summary: "Crafting", content: "Full description", image: "https://example.com/image.jpg", categories: ["Arts and Crafts"], source: "ccc", created_at: "2026-07-20T14:07:16.113259+00:00", earliest_start_date: "2026-08-17T06:00:00", event_sessions: [{ id: 664800, start_date: "2026-08-17T06:00:00", end_date: "2026-08-17T09:00:00" }], data: { URLValue: "https://ccc.govt.nz/news-and-events/whats-on/event/monthly-spoon-club", PriceType: "Paid event", TicketPriceMin: "$10", BookingRequired: 1, BuildingName: "Avebury House", StreetAddress: "9 Evelyn Couzins Avenue", Coordinates: "[172.6602,-43.5197]" } };
    expect(parseChristchurchNzPage({ data: [item], pagination: { currentPage: 1, totalPages: 30 } })).toMatchObject({ currentPage: 1, totalPages: 30, events: [item] });
    const events = await publicDataAdapters.rto_calendars.normaliseEvents!([{ sourceId: "rto_calendars", externalId: "christchurchnz:13786", payload: { provider: "ChristchurchNZ", event: item }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(events[0]).toMatchObject({ externalId: "christchurchnz:13786:664800", city: "Christchurch", region: "Canterbury", latitude: -43.5197, longitude: 172.6602, startsAt: new Date("2026-08-17T06:00:00.000Z"), metadata: { importedSource: "ccc", sourceEventId: "christchurchnz:13786" } });
  });

  it("parses Queenstown Airport flights into transport-flow facts", async () => {
    const flight = parseQueenstownAirportFlights([{ flightList: ["NZ659"], from: "Christchurch", destination: "Queenstown", schTime: "09:40:00", schDate: "2026-07-21", status: "On Time", orderByDate: "2026-07-21T09:40:00+12:00", isDomestic: true, flightType: "Arrival" }])[0];
    const signals = await publicDataAdapters.airport_data.normalise([{ sourceId: "airport_data", externalId: "queenstown-airport:arrival:NZ659:2026-07-21T09:40:00+12:00", payload: { provider: "Queenstown Airport", flight }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signals[0]).toMatchObject({ type: "TRANSPORT_FLOW", marketKey: "queenstown", direction: "POSITIVE", startsAt: new Date("2026-07-20T21:40:00.000Z"), confidence: 0.75 });
  });

  it("parses Port of Auckland cruise CSV into Auckland transport-flow facts", async () => {
    const calls = parsePoalCruiseCsv(`Vessel,"Wharf Vessel Ref\t",Arrival,Departs,"Previous Port","Next Port"\n"CROWN PRINCESS",QUEENS,"29 Aug 2026 05:30","29 Aug 2026 21:00",MOOREA,SYDNEY`);
    expect(calls[0]).toMatchObject({ vessel: "CROWN PRINCESS", wharf: "QUEENS", arrival: "2026-08-28T17:30:00.000Z", departs: "2026-08-29T09:00:00.000Z", previousPort: "MOOREA", nextPort: "SYDNEY" });
    const signals = await publicDataAdapters.port_and_cruise.normalise([{ sourceId: "port_and_cruise", externalId: `poal-cruise:crown-princess:${calls[0].arrival}`, payload: { provider: "Port of Auckland", call: calls[0] }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signals[0]).toMatchObject({ type: "TRANSPORT_FLOW", marketKey: "auckland", direction: "POSITIVE", confidence: 0.85 });
  });

  it("uses the public LINZ Gazetteer as reference data without inventing a market signal", async () => {
    const references = await publicDataAdapters.linz.discover({ marketScope: "new-zealand", from: new Date(), to: new Date() }, fixtureContext);
    expect(references[0]).toBe("https://gazetteer.linz.govt.nz/api/search?term=Auckland");
    expect(await publicDataAdapters.linz.normalise([], fixtureContext)).toEqual([]);
    expect(publicDataAdapters.linz.metadata).toMatchObject({ adapterKey: "public:linz:gazetteer-search-v1", accessMethod: "OFFICIAL_PUBLIC_JSON" });
  });
});

describe.skipIf(process.env.LIVE_SOURCE_PROBE !== "1")("Christchurch live source probe", () => {
  it("collects bounded current events from every direct HTTP source", async () => {
    const from = new Date();
    const to = new Date(from.getTime() + 180 * 86_400_000);
    const context = {
      ...liveContext,
      collectionRange: { from, to },
      collectionLimits: { maxRequests: 3, maxRecords: 5, maxBytes: 2_000_000 },
    };
    for (const sourceId of ["te_pae_events", "venues_otautahi_events", "isaac_theatre_royal_events", "christchurch_council_events", "canterbury_major_annual_events"]) {
      const adapter = publicDataAdapters[sourceId];
      const references = await adapter.discover({ marketScope: "christchurch", from, to }, context);
      const records = (await Promise.all(references.map((reference) => adapter.fetch(reference, context)))).flat();
      const events = await adapter.normaliseEvents!(records, context);
      expect(events.length, `${sourceId} should return at least one current event`).toBeGreaterThan(0);
      expect(events.length).toBeLessThanOrEqual(5);
      expect(events.every((event) => event.city === "Christchurch" && event.fixture === false)).toBe(true);
      expect(records.reduce((sum, record) => sum + (record.networkRequestCount ?? 0), 0)).toBeLessThanOrEqual(3);
    }
  }, 30_000);

  it("collects Ara academic demand dates without browser execution", async () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2027-01-01T00:00:00.000Z");
    const context = { ...liveContext, collectionRange: { from, to }, collectionLimits: { maxRequests: 1, maxRecords: 20, timeoutMs: 30_000, maxBytes: 2_000_000 } };
    const adapter = publicDataAdapters.ara_academic_dates;
    const [reference] = await adapter.discover({ marketScope: "christchurch", from, to }, context);
    const records = await adapter.fetch(reference, context);
    const signals = await adapter.normalise(records, context);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.marketKey === "christchurch" && signal.type === "TOURISM_DEMAND")).toBe(true);
  }, 30_000);

  it("collects bounded Eventbrite, Humanitix and Christchurch Airport data without browser execution", async () => {
    const from = new Date();
    const to = new Date(from.getTime() + 180 * 86_400_000);
    const context = { ...liveContext, collectionRange: { from, to }, collectionLimits: { maxRequests: 4, maxRecords: 5, timeoutMs: 30_000, maxBytes: 2_000_000 } };
    for (const sourceId of ["eventbrite_events", "humanitix_events"]) {
      const adapter = publicDataAdapters[sourceId];
      const references = await adapter.discover({ marketScope: "new-zealand", from, to }, context);
      const records = await adapter.fetch(references[0], context);
      const events = await adapter.normaliseEvents!(records, context);
      expect(events.length, `${sourceId} should return listing JSON-LD events`).toBeGreaterThan(0);
      expect(records.reduce((sum, record) => sum + (record.networkRequestCount ?? 0), 0)).toBeLessThanOrEqual(4);
      expect(records.every((record) => (record.networkRequestsAvoided ?? 0) >= 0)).toBe(true);
    }
    const airport = publicDataAdapters.christchurch_airport;
    const references = await airport.discover({ marketScope: "christchurch", from, to }, context);
    const records = (await Promise.all(references.map((reference) => airport.fetch(reference, context)))).flat();
    const signals = await airport.normalise(records, context);
    expect(references).toHaveLength(4);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.marketKey === "christchurch" && signal.type === "TRANSPORT_FLOW")).toBe(true);
  }, 30_000);

  it("collects the new Christchurch demand channels through direct HTTP", async () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2027-06-30T00:00:00.000Z");
    const context = { ...liveContext, collectionRange: { from, to }, collectionLimits: { maxRequests: 4, maxRecords: 100, timeoutMs: 30_000, maxBytes: 2_000_000 } };
    for (const sourceId of ["christchurch_sports", "christchurch_university_dates", "christchurch_racing", "christchurch_airport_monthly"]) {
      const adapter = publicDataAdapters[sourceId];
      const references = await adapter.discover({ marketScope: "christchurch", from, to }, context);
      const records = (await Promise.all(references.map((reference) => adapter.fetch(reference, context)))).flat();
      expect(records.length, `${sourceId} should return official records`).toBeGreaterThan(0);
      expect(records.every((record) => record.fixture === false)).toBe(true);
    }
    const cruise = publicDataAdapters.christchurch_cruise;
    const [reference] = await cruise.discover({ marketScope: "christchurch", from, to }, context);
    const [record] = await cruise.fetch(reference, context);
    expect(record.payload).toMatchObject({ kind: "event", value: { category: "Cruise ship", city: "Christchurch" } });
  }, 60_000);
});
