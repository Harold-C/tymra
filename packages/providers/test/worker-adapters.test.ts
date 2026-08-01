import { describe, expect, it } from "vitest";

import { AdapterError, changedMetServiceFeedItems, metServiceFeedItemVersion, otaAdapters, parseAucklandLivePage, parseChristchurchNzPage, parseEducationSchoolHolidays, parseEmploymentPublicHolidays, parseMbieAccommodationTail, parseMetServiceCapAlert, parseMetServiceCapFeed, parseNztaDelays, parseOurAucklandPage, parsePoalCruiseCsv, parseQueenstownAirportFlights, parseStatsNzInternationalTravel, parseUniversityEvents, publicDataAdapters } from "../src";

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

  it("delegates Ticketmaster collection to the read-only Browser Worker path", async () => {
    const adapter = publicDataAdapters.ticketmaster;
    expect(adapter.metadata).toMatchObject({
      supportedDomains: ["www.ticketmaster.co.nz", "ticketmaster.co.nz"],
      adapterKey: "public:ticketmaster:browser-v1",
      accessMethod: "PUBLIC_WEB_BROWSER_READ_ONLY",
      concurrencyLimit: 1,
    });
    await expect(adapter.discover({ marketScope: "new-zealand", from: new Date(), to: new Date() }, fixtureContext)).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
    await expect(adapter.fetch("https://www.ticketmaster.co.nz/", fixtureContext)).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
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

  it("routes RBNZ B1 through the read-only Browser Worker", async () => {
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

  it("parses OurAuckland cards conservatively as date-precision council events", async () => {
    const page = parseOurAucklandPage(`<article class="article-tile"><div class="article-tile__content"><span class="article-tile__date">21 Jul 2026 - 25 Jul 2026</span><h2><a class="article-tile__link" href="/events/2026/07/sharp-teeth/">Sharp Teeth</a></h2><p>A theatre event.</p></div></article><a class="pagination__link" data-page="32" href="?page=32">32</a>`);
    expect(page).toMatchObject({ totalPages: 32, events: [{ id: "our-auckland:sharp-teeth", title: "Sharp Teeth", startsOn: "2026-07-21", endsOn: "2026-07-25" }] });
    const events = await publicDataAdapters.council_calendars.normaliseEvents!([{ sourceId: "council_calendars", externalId: page.events[0].id, payload: { provider: "Auckland Council / OurAuckland", event: page.events[0], page: 1 }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(events[0]).toMatchObject({ city: "Auckland", startsAt: new Date("2026-07-20T12:00:00.000Z"), endsAt: new Date("2026-07-25T11:59:59.000Z"), metadata: { timePrecision: "DATE_ONLY" } });
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
