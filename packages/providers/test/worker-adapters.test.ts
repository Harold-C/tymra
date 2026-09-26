import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

import { AdapterError, NZ_MAJOR_ACCOMMODATION_MARKETS, assessNzMarketCoverage, assessNzMarketOperationalCoverage, canonicalNzMarketKey, changedMetServiceFeedItems, combineQueenstownPassengerMatrices, decodeQueenstownPassengerMatrix, extractEventfindaHttpPage, extractTicketmasterHttpPage, findQueenstownAirportDashboardUrl, findWellingtonAirportWorkbookUrl, marketKeysForAnniversaryRegion, marketKeysForMbieArea, metServiceFeedItemVersion, nearestNzMarketKey, nzCoverageKeysForAreaText, nzMarketKeysForAreaText, otaAdapters, parseAirportMonthlyPassengers, parseAraAcademicCalendar, parseAucklandLivePage, parseCanterburyMajorAnnualEvent, parseChristchurchCouncilEventsPage, parseChristchurchNzPage, parseChristchurchRacing, parseChristchurchSports, parseCruiseDashboard, parseDocAlertGroups, parseEducationSchoolHolidays, parseEmploymentPublicHolidays, parseFlightTime, parseHawkesBayNzEvents, parseInterislanderAlerts, parseIsaacTheatreRoyalEvents, parseIvsAnnualSummary, parseManawatuNzEvents, parseMbieAccommodationTail, parseMetServiceCapAlert, parseMetServiceCapFeed, parseMrteSummary, parseNelsonTasmanNzEvents, parseNorthlandNzEvents, parseNztaDelays, parseOurAucklandPage, parsePlatformJsonLdEvents, parsePoalCruiseCsv, parseQueenstownAirportFlights, parseQueenstownNzEvents, parseRotoruaNzEvents, parseSkiSeasonHtml, parseSouthlandNzEvents, parseStatsNzInternationalTravel, parseTaranakiNzEvents, parseTaupoNzEvents, parseTaurangaNzEvents, parseTePaeEvents, parseTourismFlowsMonthly, parseUcKeyDates, parseUniversityEvents, parseVenuesOtautahiStories, parseVenuesOtautahiToken, parseWaikatoNzEvents, parseWellingtonAirportFlights, parseWellingtonAirportMonthlyPassengers, parseWellingtonNzEvents, publicDataAdapters, publicSignalCollectionPlanForAddress, publicSignalCollectionPlanForMarket, publicSignalSourceIdsForMarket, resolveNzAddressSignalCoverage, resolveNzMarketKey } from "../src";

const fixtureContext = { mode: "fixture" as const, correlationId: "adapter-contract", locale: "en" as const, currency: "NZD" as const };
const liveContext = { ...fixtureContext, mode: "live" as const };
const samples: Record<string, string> = {
  booking: "https://www.booking.com/hotel/nz/example-stay.html?aid=123",
  airbnb: "https://www.airbnb.co.nz/rooms/12345678?source_impression_id=x",
  expedia: "https://www.expedia.co.nz/Auckland-Hotels-Example.h12345.Hotel-Information",
  wotif: "https://www.wotif.co.nz/Auckland-Hotels-Example.h12345.Hotel-Information",
  hotels: "https://nz.hotels.com/ho12345",
  bookabach: "https://www.bookabach.co.nz/holiday-accommodation/p12345",
  vrbo: "https://www.vrbo.com/12345ha",
  agoda: "https://www.agoda.com/example-hotel/hotel/auckland-nz.html?hotel_id=12345",
  trip: "https://www.trip.com/hotels/auckland-hotel-detail-12345/example/",
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
  it("exposes a complete deterministic contract for every public adapter", async () => {
    for (const [sourceId, adapter] of Object.entries(publicDataAdapters)) {
      expect(adapter.metadata).toMatchObject({ sourceId, sourceType: "PUBLIC_DATA" });
      expect(adapter.metadata.collectorVersion).toBeTruthy();
      expect(adapter.metadata.parserVersion).toBeTruthy();
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
  });

  it("keeps the next year's official holidays when the page lists two years", () => {
    const table = (observed: string) => `<table><tr><th>Holiday</th><th>Actual Date</th><th>Observed date</th></tr><tr><td>New Year's Day</td><td>1 January</td><td>${observed}</td></tr></table>`;
    const anniversary = `<table><tr><th>Region</th><th>Actual Date</th><th>Observed date</th></tr><tr><td>Canterbury</td><td>16 December</td><td>Wednesday 16 December</td></tr></table>`;
    const records = parseEmploymentPublicHolidays(`<h2>2026 public holiday and anniversary dates</h2>${table("Thursday 1 January")}${anniversary}<h2>2027 public holiday and anniversary dates</h2>${table("Friday 1 January")}${anniversary}`);
    expect(records.filter((record) => record.type === "PUBLIC_HOLIDAY").map((record) => record.startsAt)).toEqual(["2026-01-01", "2027-01-01"]);
  });

  it("fails closed when an official calendar has more in-window records than its budget", async () => {
    const html = `<h2>2026 public holiday and anniversary dates</h2><table><tr><th>Holiday</th><th>Actual Date</th><th>Observed date</th></tr><tr><td>Waitangi Day</td><td>6 February</td><td>Friday 6 February</td></tr></table><table><tr><th>Region</th><th>Actual Date</th><th>Observed date</th></tr><tr><td>Canterbury</td><td>16 December</td><td>Friday 13 November</td></tr></table>`;
    const fetchMock = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const context = { ...fixtureContext, collectionRange: { from: new Date("2026-01-01"), to: new Date("2027-01-01") }, collectionLimits: { maxRequests: 1, maxRecords: 1, timeoutMs: 10_000, maxBytes: 100_000 } };
      await expect(publicDataAdapters.public_holidays_nz.fetch("https://www.employment.govt.nz/leave-and-holidays/public-holidays/public-holidays-and-anniversary-dates", context)).rejects.toMatchObject({ code: "PARSING_ERROR", retryable: false });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("normalises browser-delivered aviation depth into market pricing signals", async () => {
    const auckland = await publicDataAdapters.auckland_airport_monthly.normalise([{
      sourceId: "auckland_airport_monthly", externalId: "airport-passengers:2026-06",
      payload: { sourceUrl: "https://corporate.aucklandairport.co.nz/report", record: { period: "2026-06", domesticPassengers: 700000, internationalPassengers: 900000, totalPassengers: 1600000, annualChangePercent: 4.5 } },
      fetchedAt: new Date(), fixture: false,
    }], fixtureContext);
    expect(auckland).toEqual([expect.objectContaining({ marketKey: "auckland", type: "TOURISM_DEMAND", direction: "POSITIVE" })]);

    const performance = await publicDataAdapters.mot_airline_performance.normalise([{
      sourceId: "mot_airline_performance", externalId: "airline-performance:2026-06:AKL:ZQN",
      payload: { sourceUrl: "https://www.transport.govt.nz/report.xlsx", record: { period: "2026-06", originAirportCode: "AKL", destinationAirportCode: "ZQN", originName: "Auckland", destinationName: "Queenstown", scheduledFlights: 300, arrivalOnTimePercent: 62, departureOnTimePercent: 68, cancelledFlights: 20, cancellationPercent: 6.7, coverageCaveat: "Voluntary participating-airline reporting; coverage is incomplete." } },
      fetchedAt: new Date(), fixture: false,
    }], fixtureContext);
    expect(performance.map((signal) => signal.marketKey).sort()).toEqual(["auckland", "queenstown-wanaka"]);
    expect(performance.every((signal) => signal.type === "TRANSPORT_FLOW" && signal.direction === "NEGATIVE")).toBe(true);
    expect(performance[0]?.metadata).toMatchObject({ voluntaryReporting: true, incompleteCoverageCaveat: expect.stringContaining("incomplete") });
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

  it("registers the remaining fixed Argus-only public sources", async () => {
    expect(publicDataAdapters.school_sport_nz.metadata).toMatchObject({ adapterKey: "public:school_sport_nz:argus-v1", accessMethod: "PUBLIC_WEB_ARGUS_READ_ONLY", concurrencyLimit: 1 });
    expect(publicDataAdapters.school_sport_canterbury.metadata.supportedDomains).toContain("teamup.com");
    expect(publicDataAdapters.ticketek_events.metadata).toMatchObject({ adapterKey: "public:ticketek_events:argus-v1", dailyBudget: 20 });
    expect(publicDataAdapters.dunedinnz_events.metadata).toMatchObject({ adapterKey: "public:dunedinnz_events:argus-v1", accessMethod: "PUBLIC_WEB_ARGUS_READ_ONLY" });
    expect(publicDataAdapters.rotoruanz_events.metadata).toMatchObject({ adapterKey: "public:rotoruanz_events:rotoruanz-simple-tile-html-v1", accessMethod: "OFFICIAL_PUBLIC_HTML" });
    await expect(publicDataAdapters.school_sport_nz.discover({ marketScope: "christchurch", from: new Date(), to: new Date() }, fixtureContext)).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
    await expect(publicDataAdapters.ticketek_events.fetch("https://premier.ticketek.co.nz/shows/whatson.aspx", fixtureContext)).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
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

  it("parses official Wellington and Waikato regional event listings", () => {
    const wellington = parseWellingtonNzEvents(`<a href="/visit/events/beervana" class="featured-item featured-item--event" data-id="1826"><h3 class="featured-item__title">Beervana</h3><span class="featured-item__text--date">21 – 22 August 2026</span><span class="featured-item__text--info">TSB Arena</span></a>`);
    expect(wellington).toEqual([expect.objectContaining({ externalId: "wellingtonnz:1826", title: "Beervana", city: "Wellington", startsAt: new Date("2026-08-20T12:00:00.000Z"), endsAt: new Date("2026-08-22T11:59:59.999Z") })]);

    const waikato = parseWaikatoNzEvents({ totalResults: 1, totalPages: 1, results: JSON.stringify([{ Id: 31957, Url: "/all-events/stitched-in-time/", Name: "Stitched in Time", Regions: "Te Awamutu", DateSummary: "24 Jul - 20 Oct 2026", Featured: true }]) });
    expect(waikato.events).toEqual([expect.objectContaining({ externalId: "waikatonz:31957", city: "Te Awamutu", region: "Waikato", startsAt: new Date("2026-07-23T12:00:00.000Z"), endsAt: new Date("2026-10-20T10:59:59.999Z") })]);
    expect(publicDataAdapters.wellingtonnz_events.metadata.accessMethod).toBe("OFFICIAL_PUBLIC_HTML");
    expect(publicDataAdapters.waikatonz_events.metadata.accessMethod).toBe("OFFICIAL_PUBLIC_JSON_PAGINATED");
    const queenstown = parseQueenstownNzEvents({ docs: [{ recid: "3717", title: "NZ Adaptive National champs", startDate: "2026-08-06T00:00:00.000Z", endDate: "2026-08-07T00:00:00.000Z", url: "/event/nz-adaptive-national-champs/3717/", location: "Cardrona Alpine Resort" }] });
    expect(queenstown).toEqual([expect.objectContaining({ externalId: "queenstownnz:3717", title: "NZ Adaptive National champs", region: "Otago" })]);
    expect(publicDataAdapters.queenstownnz_events.metadata.accessMethod).toBe("OFFICIAL_PUBLIC_JSON_DISCOVERED");
    const taupo = parseTaupoNzEvents(`<div class="c-filter-summary">Displaying 1 - 20 of 48</div><a href="/en/events/944033" class="o-event-tile"><span class="o-event-tile__tag">Motorsport</span><span class="o-event-tile__date">06 Aug - 26 Nov</span><h3 class="o-event-tile__heading">Sim Race Club</h3></a><a href="?page=3" class="js-pagination-link">3</a>`, undefined, new Date("2026-08-06T00:00:00Z"));
    expect(taupo).toMatchObject({ totalPages: 3, events: [expect.objectContaining({ externalId: "tauponz:944033", startsAt: new Date("2026-08-05T12:00:00.000Z") })] });
    const southland = parseSouthlandNzEvents({ docs: [{ recid: "6038", title: "Hydro Half Marathon", startDate: "2026-08-24T00:00:00Z", endDate: "2026-08-24T03:00:00Z", url: "/event/hydro-half-marathon/6038/", location: "Te Anau" }] });
    expect(southland).toEqual([expect.objectContaining({ externalId: "southlandnz:6038", region: "Southland" })]);
    const hawkesBay = parseHawkesBayNzEvents(`<div class="eventItem" data-category="lifestyle" data-dateStart="1789878600" data-dateEnd="1789965000" data-location="Napier"><a data-item="5095" href="/events/example" class="card"><div class="info"><h3>Regional Festival</h3><h5>Sep 20</h5></div></a></div>`);
    expect(hawkesBay).toEqual([expect.objectContaining({ externalId: "hawkesbaynz:5095", city: "Napier", region: "Hawke's Bay" })]);
    const taranaki = parseTaranakiNzEvents({ data: { listings: { edges: [{ node: { UUID: "5632000111", Title: "Garden Festival", URLSegment: "garden-festival", FullAddress: "", CurrentStartDate: "2026-10-30 09:00:00", MainCategory: { Title: "Festival" } } }], pageInfo: { hasNextPage: false, totalCount: 1 } } } });
    expect(taranaki.events).toEqual([expect.objectContaining({ externalId: "taranakienz:5632000111", startsAt: new Date("2026-10-29T20:00:00.000Z") })]);
    const nelson = parseNelsonTasmanNzEvents(`<div class="ElementalEvents"><div class="group"><h4><a href="/events/example/">Nelson Festival</a></h4><div class="me-2 flex items-start gap-2">13 September 2026 7:00 pm - 11:59 pm</div><div class="flex items-start gap-2">Theatre Royal Nelson, Nelson</div></div></div>`);
    expect(nelson).toEqual([expect.objectContaining({ externalId: "nelsontasman:example", startsAt: new Date("2026-09-13T07:00:00.000Z") })]);
    const tauranga = parseTaurangaNzEvents(`<div class="event-search-results-box-carousel"><a class="event-search-results-box-clickable" href="/event-details/?event=123"><h3 class="event-search-results-box-title">Mount Festival</h3><div class="event-search-results-box-details"><p>8 August 2026</p><p>Mount Maunganui</p></div></a></div>`);
    expect(tauranga).toEqual([expect.objectContaining({ externalId: "tauranga:123", city: "Mount Maunganui" })]);
    const manawatu = parseManawatuNzEvents(`<div class="event-block"><a href="/events/open-day/"><h3 class="event--title">Open Day</h3><div id="text_block-548-1">9 August 2026</div><div id="text_block-566-1">Te Marae o Hine, Palmerston North</div></a></div><a class="page-numbers">4</a>`);
    expect(manawatu).toMatchObject({ totalPages: 4, events: [expect.objectContaining({ externalId: "manawatunz:open-day", city: "Palmerston North" })] });
    const northland = parseNorthlandNzEvents(`<div class="events-list-container"><div class="list-item-container"><article><a href="/Events/Whats-On/Ocean-Ocean"><h2 class="list-item-title">Ocean Ocean</h2><span class="part-date">06</span><span class="part-month">Aug</span><span class="part-year">2026</span><p class="list-item-address">ONEONESIX, Whangārei 0110</p></a></article></div></div>`);
    expect(northland).toEqual([expect.objectContaining({ externalId: "northland:Ocean-Ocean", city: "Whangārei", venueName: "ONEONESIX" })]);
    const rotorua = parseRotoruaNzEvents(`<div class="simple-tile"><div class="simple-tile__body"><h4>Blue Lake 24hr Challenge</h4><p>26 – 27 September</p><p>Lake Tikitapu</p><p>Grassroots endurance event.</p><p><a href="https://www.bluelake24hr.com/">More info</a></p></div></div>`, "https://www.rotoruanz.com/whats-on", new Date("2026-08-06T00:00:00Z"));
    expect(rotorua).toEqual([expect.objectContaining({ title: "Blue Lake 24hr Challenge", city: "Rotorua", region: "Bay of Plenty", venueName: "Lake Tikitapu", startsAt: new Date("2026-09-25T12:00:00.000Z") })]);
  });

  it("marks nationwide source implementation complete only after every market has an official layer", () => {
    expect(NZ_MAJOR_ACCOMMODATION_MARKETS).toHaveLength(15);
    const report = assessNzMarketCoverage(new Set(Object.keys(publicDataAdapters)));
    expect(report.complete).toBe(true);
    expect(report.markets.find((market) => market.key === "christchurch")?.implemented).toBe(true);
    expect(report.markets.find((market) => market.key === "wellington")?.implemented).toBe(true);
    expect(report.markets.find((market) => market.key === "northland")?.implemented).toBe(true);
    expect(report.implementedMarkets).toBe(15);
    expect(report.argusRequired).toEqual([]);
  });

  it("uses one canonical market key across regional events, schedules and pricing", () => {
    expect(canonicalNzMarketKey("queenstown_wanaka")).toBe("queenstown-wanaka");
    expect(resolveNzMarketKey({ city: "Wānaka", region: "Otago" })).toBe("queenstown-wanaka");
    expect(resolveNzMarketKey({ city: "Dunedin", region: "Otago" })).toBe("dunedin");
    expect(resolveNzMarketKey({ city: "Mount Maunganui", region: "Bay of Plenty" })).toBe("tauranga");
    expect(resolveNzMarketKey({ region: "Otago" })).toBeNull();
    expect(publicSignalSourceIdsForMarket("hawkes_bay")).toContain("hawkesbaynz_events");
  });

  it("gives every structured New Zealand region an explicit, non-guessed signal coverage level", () => {
    const regions = [
      "Auckland", "Bay of Plenty", "Canterbury", "Chatham Islands", "Gisborne", "Hawke's Bay",
      "Manawatū-Whanganui", "Marlborough", "Nelson", "Northland", "Otago", "Southland",
      "Taranaki", "Tasman", "Waikato", "Wellington", "West Coast",
    ];
    for (const region of regions) {
      expect(resolveNzAddressSignalCoverage({ region, countryCode: "NZ" })).not.toBeNull();
    }

    expect(resolveNzAddressSignalCoverage({ city: "Christchurch", region: "Canterbury", countryCode: "NZ" })).toMatchObject({
      level: "FULL", marketKey: "christchurch", majorMarketKey: "christchurch", regionKey: "nz-region-canterbury", limitations: [],
    });
    expect(resolveNzAddressSignalCoverage({ city: "Greymouth", region: "West Coast", countryCode: "NZ" })).toMatchObject({
      level: "REGIONAL", marketKey: "nz-region-west-coast", majorMarketKey: null, regionName: "West Coast",
      limitations: ["LOCAL_OFFICIAL_EVENT_SOURCE_NOT_CONFIGURED", "LOCAL_FLOW_SOURCE_NOT_CONFIGURED"],
    });
    expect(resolveNzAddressSignalCoverage({ city: "Unresolved locality", countryCode: "NZ" })).toMatchObject({
      level: "NATIONAL_ONLY", marketKey: "new-zealand", regionKey: null,
    });
    expect(resolveNzAddressSignalCoverage({ city: "Sydney", countryCode: "AU" })).toBeNull();
  });

  it("uses the nationwide baseline plan for regional and national-only addresses", () => {
    const regional = publicSignalCollectionPlanForAddress({ city: "Greymouth", region: "West Coast", countryCode: "NZ" });
    const national = publicSignalCollectionPlanForAddress({ countryCode: "NZ" });
    expect(regional).toEqual(national);
    expect(regional).toHaveLength(19);
    expect(regional.every((target) => target.marketScope === "new-zealand")).toBe(true);
    expect(regional.filter((target) => target.layer === "DISCOVERY")).toHaveLength(5);
    expect(regional.filter((target) => target.layer === "DEMAND")).toHaveLength(5);
    expect(regional.filter((target) => target.layer === "DISRUPTION")).toHaveLength(9);
    expect(regional.some((target) => target.layer === "OFFICIAL_EVENT" || target.layer === "LOCAL_FLOW")).toBe(false);
  });

  it("builds the complete on-demand signal plan for every market", () => {
    for (const market of NZ_MAJOR_ACCOMMODATION_MARKETS) {
      const plan = publicSignalCollectionPlanForMarket(market.key);
      expect(plan.map((target) => target.sourceId)).toEqual(publicSignalSourceIdsForMarket(market.key));
      expect(plan.filter((target) => target.layer === "DISCOVERY")).toHaveLength(5);
      expect(plan.filter((target) => target.layer === "DEMAND")).toHaveLength(5);
      expect(plan.filter((target) => target.layer === "DISRUPTION")).toHaveLength(9);
      expect(plan.filter((target) => ["DISCOVERY", "DEMAND", "DISRUPTION", "SEASONAL"].includes(target.layer)).every((target) => target.marketScope === "new-zealand")).toBe(true);
      expect(plan.filter((target) => ["OFFICIAL_EVENT", "LOCAL_FLOW"].includes(target.layer)).every((target) => target.marketScope === market.key)).toBe(true);
    }
    expect(publicSignalCollectionPlanForMarket("wellington")).toContainEqual({ sourceId: "wellington_airport", marketScope: "wellington", layer: "LOCAL_FLOW" });
    expect(publicSignalCollectionPlanForMarket("wellington")).toContainEqual({ sourceId: "wellington_airport_monthly", marketScope: "wellington", layer: "LOCAL_FLOW" });
    expect(publicSignalCollectionPlanForMarket("queenstown-wanaka")).toContainEqual({ sourceId: "queenstown_airport_monthly", marketScope: "queenstown-wanaka", layer: "LOCAL_FLOW" });
    expect(publicSignalCollectionPlanForMarket("auckland")).toContainEqual({ sourceId: "auckland_airport_monthly", marketScope: "auckland", layer: "LOCAL_FLOW" });
    expect(publicSignalCollectionPlanForMarket("auckland")).toContainEqual({ sourceId: "mot_airline_performance", marketScope: "new-zealand", layer: "DISRUPTION" });
    expect(publicSignalCollectionPlanForMarket("dunedin")).toContainEqual({ sourceId: "dunedinnz_events", marketScope: "dunedin", layer: "OFFICIAL_EVENT" });
    expect(publicSignalCollectionPlanForMarket("taupo")).toContainEqual({ sourceId: "doc_alerts", marketScope: "new-zealand", layer: "DISRUPTION" });
    expect(publicSignalCollectionPlanForMarket("taupo")).toContainEqual({ sourceId: "ski_seasons_nz", marketScope: "new-zealand", layer: "SEASONAL" });
    expect(publicSignalCollectionPlanForMarket("wellington")).toContainEqual({ sourceId: "interislander_alerts", marketScope: "new-zealand", layer: "DISRUPTION" });
  });

  it("parses official ski-season windows as date-specific demand context", async () => {
    expect(parseSkiSeasonHtml("<main><h4>27 June - 11 October 2026</h4></main>", { resort: "Mt Hutt", marketKey: "christchurch", region: "Canterbury", url: "https://www.mthutt.co.nz/mountain-info", datePattern: /(\d{1,2}\s+[A-Za-z]+)\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+)\s+(20\d{2})/i })).toMatchObject({ opensAt: "2026-06-26T12:00:00.000Z", closesAt: "2026-10-10T11:00:00.000Z" });
    const signals = await publicDataAdapters.ski_seasons_nz.normalise([{ sourceId: "ski_seasons_nz", externalId: "ski-season:mt-hutt:2026", payload: { resort: "Mt Hutt", marketKey: "christchurch", region: "Canterbury", opensAt: "2026-06-26T12:00:00.000Z", closesAt: "2026-10-10T11:00:00.000Z", sourceUrl: "https://www.mthutt.co.nz/mountain-info" }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signals[0]).toMatchObject({ marketKey: "christchurch", type: "TOURISM_DEMAND", direction: "POSITIVE", confidence: 0.8 });
    expect(signals[0]!.endsAt.toISOString()).toBe("2026-10-11T11:00:00.000Z");
  });

  it("parses and routes official ferry and DOC access alerts conservatively", async () => {
    expect(parseInterislanderAlerts([{ id: 7, title: "Sailings cancelled", summary: "Weather", content: "", start: "2026-08-06", end: null, last_edited: "2026-08-06", version: 3 }])).toHaveLength(1);
    expect(parseDocAlertGroups([{ name: "Tongariro", staticLink: "/track/", alerts: [{ summary: "Track closed", description: "<p>Unsafe access.</p>", subText: "Reviewed", sortDate: "2026-08-05", displayDate: "5 August 2026", associatedBookingIDs: "" }], isGeneral: false }])).toHaveLength(1);
    const fetchedAt = new Date("2026-08-06T14:00:00.000Z");
    const ferry = await publicDataAdapters.interislander_alerts.normalise([{ sourceId: "interislander_alerts", externalId: "service-alert:7", payload: { alert: { id: 7, title: "Sailings cancelled", summary: "Weather", content: "", start: null, end: null, last_edited: null, version: 3 } }, fetchedAt, fixture: false }], fixtureContext);
    expect(ferry.map((signal) => signal.marketKey)).toEqual(["wellington", "nelson-tasman"]);
    expect(ferry.every((signal) => signal.direction === "NEGATIVE" && signal.startsAt.toISOString() === "2026-08-06T12:00:00.000Z" && signal.endsAt.toISOString() === "2026-08-08T12:00:00.000Z")).toBe(true);
    const doc = await publicDataAdapters.doc_alerts.normalise([{ sourceId: "doc_alerts", externalId: "doc-alert:otago:x", payload: { region: { slug: "otago", name: "Otago", guid: "x", markets: ["dunedin", "queenstown-wanaka"] }, group: { name: "Routeburn", staticLink: "/track/", alerts: [], isGeneral: false }, alert: { summary: "Track closed", description: "<p>Unsafe access.</p>", subText: "", sortDate: "2026-08-05", displayDate: "", associatedBookingIDs: "" }, sourceUrl: "https://www.doc.govt.nz/track/" }, fetchedAt, fixture: false }], fixtureContext);
    expect(doc.map((signal) => signal.marketKey)).toEqual(["dunedin", "queenstown-wanaka"]);
    expect(doc.every((signal) => signal.type === "WEATHER_OR_ACCESS_DISRUPTION" && signal.direction === "NEGATIVE")).toBe(true);
  });

  it("routes provincial anniversary days only to their applicable markets", async () => {
    expect(marketKeysForAnniversaryRegion("Canterbury")).toEqual(["christchurch"]);
    expect(marketKeysForAnniversaryRegion("Otago")).toEqual(["dunedin", "queenstown-wanaka"]);
    expect(marketKeysForAnniversaryRegion("Auckland")).toEqual(["auckland", "northland", "waikato", "taupo", "rotorua", "tauranga"]);
    expect(marketKeysForAnniversaryRegion("Chatham Islands")).toEqual([]);
    const records = [
      { sourceId: "public_holidays_nz", externalId: "public", payload: { id: "public", title: "Waitangi Day", region: "New Zealand", startsAt: "2026-02-06", endsAt: "2026-02-07", type: "PUBLIC_HOLIDAY" }, fetchedAt: new Date(), fixture: false },
      { sourceId: "public_holidays_nz", externalId: "otago", payload: { id: "otago", title: "Otago Anniversary Day", region: "Otago", startsAt: "2026-03-23", endsAt: "2026-03-24", type: "ANNIVERSARY_DAY" }, fetchedAt: new Date(), fixture: false },
    ];
    const signals = await publicDataAdapters.public_holidays_nz.normalise(records, fixtureContext);
    expect(signals.map((signal) => signal.marketKey)).toEqual(["new-zealand", "dunedin", "queenstown-wanaka"]);
  });

  it("routes disruption area text and coordinates to applicable accommodation markets", () => {
    expect(nzMarketKeysForAreaText("Bay of Plenty and Rotorua")).toEqual(expect.arrayContaining(["rotorua", "tauranga"]));
    expect(nzMarketKeysForAreaText("Otago and Clutha")).toEqual(expect.arrayContaining(["dunedin", "queenstown-wanaka"]));
    expect(nzMarketKeysForAreaText("Hawke's Bay")).toEqual(["hawkes-bay"]);
    expect(nzMarketKeysForAreaText("Gisborne")).toEqual([]);
    expect(nzCoverageKeysForAreaText("Heavy rain across Gisborne and the West Coast")).toEqual(expect.arrayContaining(["nz-region-gisborne", "nz-region-west-coast"]));
    expect(nearestNzMarketKey(-37.0734, 174.9300)).toBe("auckland");
    expect(nearestNzMarketKey(-45.0312, 168.6626)).toBe("queenstown-wanaka");
  });

  it("routes GeoNet earthquakes by locality and affected radius", async () => {
    const signals = await publicDataAdapters.geonet.normalise([{ sourceId: "geonet", externalId: "quake-1", payload: { properties: { locality: "20 km south of Rotorua", time: "2026-08-06T00:00:00.000Z", mmi: 4, magnitude: 4.2 }, geometry: { type: "Point", coordinates: [176.25, -38.31] } }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signals.map((signal) => signal.marketKey)).toEqual(expect.arrayContaining(["rotorua", "tauranga", "taupo"]));
    expect(signals.every((signal) => signal.marketKey !== "new-zealand")).toBe(true);
  });

  it("routes active GeoNet volcanic alert levels and drops level zero", async () => {
    const records = [
      { sourceId: "geonet", externalId: "volcano-alert:whiteisland", payload: { sourceKind: "volcano_alert_level", properties: { volcanoID: "whiteisland", volcanoTitle: "White Island", level: 2, acc: "Yellow", activity: "Heightened unrest", hazards: "Potential eruption hazards" }, geometry: { type: "Point", coordinates: [177.183, -37.521] } }, fetchedAt: new Date("2026-08-06T12:00:00.000Z"), fixture: false },
      { sourceId: "geonet", externalId: "volcano-alert:auckland", payload: { sourceKind: "volcano_alert_level", properties: { volcanoID: "auckland", volcanoTitle: "Auckland Volcanic Field", level: 0, acc: "Green" }, geometry: { type: "Point", coordinates: [174.77, -36.985] } }, fetchedAt: new Date("2026-08-06T12:00:00.000Z"), fixture: false },
    ];
    const signals = await publicDataAdapters.geonet.normalise(records, fixtureContext);
    expect(signals.map((signal) => signal.marketKey)).toEqual(expect.arrayContaining(["tauranga", "rotorua"]));
    expect(signals.every((signal) => signal.title.includes("White Island") && signal.direction === "NEGATIVE")).toBe(true);
    expect(signals[0]?.metadata).toMatchObject({ hazardKind: "VOLCANIC_ALERT_LEVEL", level: 2, aviationColourCode: "Yellow" });
  });

  it("fails closed when GeoNet volcanic alerts exceed the bounded allocation", async () => {
    const originalFetch = globalThis.fetch;
    try {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: Array.from({ length: 17 }, (_, index) => ({ properties: { volcanoID: `volcano-${index}`, level: 0 } })) }), { status: 200 })));
      await expect(publicDataAdapters.geonet.fetch("https://api.geonet.org.nz/volcano/val", {
        ...fixtureContext,
        collectionLimits: { maxRequests: 2, maxRecords: 16, timeoutMs: 30_000, maxBytes: 2_000_000 },
      })).rejects.toMatchObject({ code: "PARSING_ERROR" });
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("requires fresh independent signal layers before calling a market operationally stable", () => {
    const now = new Date("2026-08-06T00:00:00.000Z");
    const evidence = Object.keys(publicDataAdapters).map((sourceId) => ({
      sourceId, lastSuccessAt: now, successfulRuns72h: 6, failedRuns72h: 0, successfulRunDays: 3, enabled: true, available: true,
      ...(["mbie", "mbie_tourism_flows", "mbie_mrte"].includes(sourceId) ? { marketKeys: NZ_MAJOR_ACCOMMODATION_MARKETS.map((market) => market.key) } : {}),
      ...(["stats_nz", "mbie_ivs"].includes(sourceId) ? { marketKeys: ["new-zealand"] } : {}),
    }));
    const report = assessNzMarketOperationalCoverage(evidence, now);
    expect(report.stableMarkets).toBe(15);
    expect(report.markets.find((market) => market.key === "wellington")?.stable).toBe(true);
    expect(report.markets.find((market) => market.key === "rotorua")?.stable).toBe(true);
    expect(report.markets.find((market) => market.key === "dunedin")?.stable).toBe(true);

    const wellingtonOfficialSources = new Set(NZ_MAJOR_ACCOMMODATION_MARKETS.find((market) => market.key === "wellington")!.officialRegionalSources);
    const staleWellington = evidence.map((item) => wellingtonOfficialSources.has(item.sourceId) ? { ...item, lastSuccessAt: "2026-08-04T00:00:00.000Z" } : item);
    expect(assessNzMarketOperationalCoverage(staleWellington, now).markets.find((market) => market.key === "wellington")?.layers.officialRegional).toBe(false);

    const missingLocalDemand = evidence.map((item) => item.sourceId === "mbie" ? { ...item, marketKeys: item.marketKeys?.filter((key) => key !== "taupo") } : item);
    expect(assessNzMarketOperationalCoverage(missingLocalDemand, now).markets.find((market) => market.key === "taupo")?.layers.accommodationDemand).toBe(false);

    const sameDayOnly = evidence.map((item) => item.sourceId === "mbie" ? { ...item, successfulRunDays: 1 } : item);
    expect(assessNzMarketOperationalCoverage(sameDayOnly, now).markets.find((market) => market.key === "auckland")?.stable).toBe(false);

    const staleSkiSeason = evidence.map((item) => item.sourceId === "ski_seasons_nz" ? { ...item, lastSuccessAt: "2026-07-20T00:00:00.000Z" } : item);
    expect(assessNzMarketOperationalCoverage(staleSkiSeason, now).markets.find((market) => market.key === "queenstown-wanaka")?.layers.seasonal).toBe(false);
    expect(assessNzMarketOperationalCoverage(staleSkiSeason, now).markets.find((market) => market.key === "auckland")?.layers.seasonal).toBeNull();
  });

  it("treats a valid regional feed with no events in the requested window as a successful empty collection", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { listings: { edges: [{ node: { UUID: "5632000111", Title: "Garden Festival", URLSegment: "garden-festival", FullAddress: "", CurrentStartDate: "2026-10-30 09:00:00", MainCategory: { Title: "Festival" } } }], pageInfo: { hasNextPage: false, totalCount: 1 } } } }), { status: 200, headers: { "content-type": "application/json" } }));
    try {
      const records = await publicDataAdapters.taranakienz_events.fetch("https://listings.venture.org.nz/api", {
        ...liveContext,
        collectionRange: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z") },
        collectionLimits: { maxRequests: 1, maxRecords: 20, maxBytes: 2_000_000, timeoutMs: 10_000 },
      });
      expect(records).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("unions University of Auckland responses from bounded backend replicas", async () => {
    const event = (eventId: string, hour: string) => ({ eventId, name: `Event ${eventId}`, startDateTime: `2026-08-20T${hour}:00:00`, endDateTime: `2026-08-20T${hour}:30:00`, location: { city: "Auckland", displayName: "City Campus" } });
    const responses = [[event("a", "09")], [event("a", "09"), event("b", "10")], [event("b", "10"), event("c", "11")]];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(responses.shift() ?? []), { status: 200, headers: { "content-type": "application/json" } }));
    try {
      const records = await publicDataAdapters.university_calendars.fetch("https://apis.auckland.ac.nz/events-portal-access/v1/events", {
        ...liveContext,
        collectionRange: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z") },
        collectionLimits: { maxRequests: 3, maxRecords: 50, maxBytes: 2_000_000, timeoutMs: 30_000 },
      });
      expect(records.map((record) => record.externalId)).toEqual(["uoa:a", "uoa:b", "uoa:c"]);
      expect(records.reduce((sum, record) => sum + record.networkRequestCount, 0)).toBe(3);
    } finally {
      fetchMock.mockRestore();
    }
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

  it("tracks the official cruise dashboard boundary and airport monthly passenger trends", () => {
    const cruise = parseCruiseDashboard(`<iframe title="Christchurch Cruise schedule 2025_26" src="https://app.powerbi.com/view?r=public-token"></iframe>`, "https://www.christchurchnz.com/visit/plan-your-visit/cruise/christchurch-cruise-schedule");
    expect(cruise.metadata).toMatchObject({ publisher: "ChristchurchNZ", underlyingSource: "New Zealand Cruise Association", extractionBoundary: "DIRECT_PUBLIC_POWERBI_JSON" });
    const airport = parseAirportMonthlyPassengers(`<h4>2025</h4><table><tr><td>June</td><td>300,000</td><td>100,000</td><td>400,000</td></tr></table><h4>2026</h4><table><tr><td>June</td><td>361,510</td><td>108,278</td><td>469,788</td></tr></table>`, "https://www.christchurchairport.co.nz/about-us/who-we-are/facts-and-figures/monthly-passenger-arrivals-and-departures/");
    expect(airport.signals?.[1]).toMatchObject({ type: "TOURISM_DEMAND", direction: "POSITIVE", startsAt: new Date("2026-05-31T12:00:00.000Z"), metadata: { contextSeriesKey: "airport-monthly-passengers", domesticPassengers: 361510, internationalPassengers: 108278, totalPassengers: 469788, annualChangePercent: 17.447 } });
  });

  it("discovers and parses Wellington Airport monthly passenger workbook", async () => {
    expect(findWellingtonAirportWorkbookUrl(`<a href="/documents/latest.xlsx">Monthly Traffic Statistics</a>`)).toBe("https://www.wellingtonairport.co.nz/documents/latest.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Monthly Traffic Stats");
    sheet.getCell("B6").value = "April"; sheet.getCell("D6").value = 25; sheet.getCell("F6").value = 60_000; sheet.getCell("H6").value = 340_000; sheet.getCell("J6").value = { formula: "F6+H6", result: 400_000 };
    sheet.getCell("B7").value = "April"; sheet.getCell("D7").value = 26; sheet.getCell("F7").value = 71_084; sheet.getCell("H7").value = 328_262; sheet.getCell("J7").value = { formula: "F7+H7", result: 399_346 };
    const records = await parseWellingtonAirportMonthlyPassengers(new Uint8Array(await workbook.xlsx.writeBuffer()));
    expect(records).toEqual([
      expect.objectContaining({ year: 2025, month: 3, totalPassengers: 400000, annualChangePercent: null }),
      expect.objectContaining({ year: 2026, month: 3, domesticPassengers: 328262, internationalPassengers: 71084, totalPassengers: 399346, annualChangePercent: -0.1635 }),
    ]);
    const signals = await publicDataAdapters.wellington_airport_monthly.normalise([{ sourceId: "wellington_airport_monthly", externalId: "airport-passengers:2026-04", payload: { record: records[1], sourceUrl: "https://www.wellingtonairport.co.nz/documents/latest.xlsx" }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signals[0]).toMatchObject({ marketKey: "wellington", type: "TOURISM_DEMAND", direction: "MIXED", metadata: { contextSeriesKey: "airport-monthly-passengers", temporalUse: "LAGGED_TREND_CONTEXT" } });
  });

  it("discovers, combines and normalises Queenstown Airport monthly passenger matrices", async () => {
    expect(findQueenstownAirportDashboardUrl(`<iframe src="https://app.powerbi.com/view?r=public-report"></iframe>`)).toBe("https://app.powerbi.com/view?r=public-report");
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const matrix = (previous: number, current: number) => ({ results: [{ result: { data: { dsr: { DS: [{ SH: [{ DM2: [{ G1: 2025 }, { G1: 2026 }] }], PH: [{ DM0: [] }, { DM1: [{ G0: 0, X: [{ M0: previous }, { M0: current }] }] }], ValueDicts: { D0: months } }] } } } }] });
    const records = combineQueenstownPassengerMatrices(
      decodeQueenstownPassengerMatrix(matrix(60, 66)),
      decodeQueenstownPassengerMatrix(matrix(40, 44)),
      decodeQueenstownPassengerMatrix(matrix(100, 110)),
    );
    expect(records).toEqual([
      expect.objectContaining({ year: 2025, month: 0, domesticPassengers: 60, internationalPassengers: 40, totalPassengers: 100, annualChangePercent: null }),
      expect.objectContaining({ year: 2026, month: 0, domesticPassengers: 66, internationalPassengers: 44, totalPassengers: 110, annualChangePercent: 10 }),
    ]);
    const [signal] = await publicDataAdapters.queenstown_airport_monthly.normalise([{ sourceId: "queenstown_airport_monthly", externalId: "airport-passengers:2026-01", payload: { record: records[1] }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signal).toMatchObject({ marketKey: "queenstown-wanaka", type: "TOURISM_DEMAND", direction: "POSITIVE", metadata: { contextSeriesKey: "airport-monthly-passengers", totalPassengers: 110, annualChangePercent: 10 } });
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
    expect(publicDataAdapters.mbie.metadata).toMatchObject({ adapterKey: "public:mbie:adp-csv-v2", accessMethod: "OFFICIAL_PUBLIC_CSV_RANGE" });
  });

  it("maps real MBIE RTO and territorial-authority names to every canonical accommodation market", async () => {
    const expected = new Map([
      ["Auckland RTO", ["auckland"]], ["Wellington City", ["wellington"]], ["Canterbury RTO", ["christchurch"]],
      ["Queenstown-Lakes District", ["queenstown-wanaka"]], ["Rotorua District", ["rotorua"]],
      ["Tauranga City", ["tauranga"]], ["Waikato RTO", ["waikato", "nz-region-waikato"]], ["Lake Taupo RTO", ["taupo"]],
      ["Dunedin City", ["dunedin"]], ["Nelson Tasman RTO", ["nelson-tasman"]],
      ["Hawke's Bay RTO", ["hawkes-bay"]], ["Taranaki RTO", ["taranaki"]], ["Northland RTO", ["northland"]],
      ["Palmerston North City", ["manawatu"]], ["Fiordland RTO", ["southland-fiordland"]],
      ["Bay of Plenty RTO", ["rotorua", "tauranga", "nz-region-bay-of-plenty"]], ["Total New Zealand", ["new-zealand"]],
    ]);
    for (const [area, markets] of expected) expect(marketKeysForMbieArea(area)).toEqual(markets);
    expect(marketKeysForMbieArea("West Coast RTO")).toEqual(["nz-region-west-coast"]);
    expect(marketKeysForMbieArea("Tairawhiti RTO")).toEqual(["nz-region-gisborne"]);
    expect(marketKeysForMbieArea("Destination Marlborough RTO")).toEqual(["nz-region-marlborough"]);

    const record = parseMbieAccommodationTail("Month,Area type,Area,Property,Measure,Value,Flag\n1/05/2026,RTO,Bay of Plenty RTO,Total,Occupancy rate,0.72,\n1/05/2026,RTO,Bay of Plenty RTO,Total,Quality indicator,High,")[0]!;
    const signals = await publicDataAdapters.mbie.normalise([{ sourceId: "mbie", externalId: record.id, payload: record, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signals.map((signal) => signal.marketKey)).toEqual(["rotorua", "tauranga", "nz-region-bay-of-plenty"]);
    expect(new Set(signals.map((signal) => signal.externalId)).size).toBe(3);
  });

  it("parses and normalises MBIE Tourism Volumes & Flows RTO visitor trends", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet 1");
    sheet.addRow(["Geographic_level_destination", "Destination", "Destination_code", "Population_segment", "Date", "Monthly_unique_counts"]);
    sheet.addRow(["RTO", "Queenstown RTO", "RTO_2025_36", "Total visitor", "2025-06-30", 100_000]);
    sheet.addRow(["RTO", "Queenstown RTO", "RTO_2025_36", "Domestic visitor", "2026-06-30", 70_000]);
    sheet.addRow(["RTO", "Queenstown RTO", "RTO_2025_36", "Total visitor", "2026-06-30", 110_000]);
    const records = await parseTourismFlowsMonthly(new Uint8Array(await workbook.xlsx.writeBuffer()));
    expect(records).toEqual([
      expect.objectContaining({ destination: "Queenstown RTO", period: "2025-06-01", monthlyUniqueCount: 100_000, annualChangePercent: null }),
      expect.objectContaining({ destination: "Queenstown RTO", period: "2026-06-01", monthlyUniqueCount: 110_000, annualChangePercent: 10 }),
    ]);
    const signals = await publicDataAdapters.mbie_tourism_flows.normalise(records.map((record) => ({ sourceId: "mbie_tourism_flows", externalId: `tvf:${record.destinationCode}:${record.period}`, payload: { record }, fetchedAt: new Date(), fixture: false })), fixtureContext);
    expect(signals.at(-1)).toMatchObject({ marketKey: "queenstown-wanaka", type: "TOURISM_DEMAND", direction: "POSITIVE", metadata: { contextSeriesKey: "tvf-monthly-unique:RTO_2025_36", monthlyUniqueVisitors: 110_000, temporalUse: "LAGGED_TREND_CONTEXT" } });
  });

  it("parses and normalises MBIE MRTE regional tourism spend", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("RTO table");
    sheet.getCell("A6").value = "June-2026 RTO Summary Table";
    sheet.addRow([]); sheet.addRow([]); sheet.addRow([]);
    sheet.getRow(10).values = ["Destination Great Lake Taupo", 20, 5, 0.1, -0.1];
    sheet.getRow(11).values = ["RotoruaNZ", "", "", "", ""];
    const records = await parseMrteSummary(new Uint8Array(await workbook.xlsx.writeBuffer()));
    expect(records[0]).toMatchObject({ rto: "Destination Great Lake Taupo", period: "2026-06-01", domesticSpendMillions: 20, internationalSpendMillions: 5, totalSpendMillions: 25 });
    expect(records[0]!.annualChangePercent).toBeCloseTo(5.32, 1);
    const [signal] = await publicDataAdapters.mbie_mrte.normalise([{ sourceId: "mbie_mrte", externalId: "mrte:taupo:2026-06-01", payload: { record: records[0] }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signal).toMatchObject({ marketKey: "taupo", type: "TOURISM_DEMAND", direction: "POSITIVE", metadata: { contextSeriesKey: "mrte-monthly-spend:destination-great-lake-taupo", totalSpendMillions: 25, unit: "NZD millions" } });
  });

  it("parses and normalises the MBIE IVS rolling annual summary", async () => {
    const country = (value: number) => ({ Country: [{ Category: "All countries", Value: value }] });
    const records = parseIvsAnnualSummary([
      { publisher: "MBIE", publishingDate: "2026-06-02 11:00:00" },
      { data: {
        "Total spend": { "2025-03-31": country(10_000_000_000), "2026-03-31": country(11_000_000_000) },
        "Mean spend per visitor": { "2026-03-31": country(3_030) },
        "Median length of stay": { "2026-03-31": country(11) },
      } },
    ]);
    expect(records.at(-1)).toMatchObject({ periodEnd: "2026-03-31", totalSpendNzd: 11_000_000_000, meanSpendPerVisitorNzd: 3_030, medianLengthOfStayDays: 11, annualChangePercent: 10, publishedAt: "2026-06-02 11:00:00" });
    const [signal] = await publicDataAdapters.mbie_ivs.normalise([{ sourceId: "mbie_ivs", externalId: "ivs-annual:2026-03-31", payload: { record: records.at(-1) }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signal).toMatchObject({ marketKey: "new-zealand", type: "TOURISM_DEMAND", direction: "POSITIVE", startsAt: new Date("2025-03-31T11:00:00.000Z"), endsAt: new Date("2026-03-31T11:00:00.000Z"), metadata: { contextSeriesKey: "ivs-rolling-annual-total-spend", temporalUse: "LAGGED_TREND_CONTEXT" } });
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
      { type: "Feature", properties: { ExternalId: 12, Status: "Active", Name: "Road Closure: SH 2 near Papakura", LocationArea: "Papakura", EventType: "Road Closure", StartDate: "2026-07-21 09:00:00", EndDate: "2026-07-22 09:00:00", Impact: "Road Closed", EventIsland: "North Island", IsCritical: 1 }, geometry: { type: "Point", coordinates: [174.9300, -37.0734] } },
      { type: "Feature", properties: { ExternalId: 13, Status: "Resolved", Name: "Old event" }, geometry: null },
    ] }, { from: new Date("2026-07-20T00:00:00.000Z"), to: new Date("2026-07-24T00:00:00.000Z") });
    expect(records.map((record) => record.id)).toEqual(["nzta-road-event:12", "nzta-road-event:11"]);
    expect(records[0]).toMatchObject({ startsAt: "2026-07-20T21:00:00.000Z", endsAt: "2026-07-21T21:00:00.000Z", feature: { properties: { Impact: "Road Closed" } } });
    const [signal] = await publicDataAdapters.nzta.normalise([{ sourceId: "nzta", externalId: records[0].id, payload: records[0], fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signal).toMatchObject({ marketKey: "auckland", type: "WEATHER_OR_ACCESS_DISRUPTION", direction: "NEGATIVE", confidence: 0.95, region: "North Island", metadata: { isCritical: true, geometry: { type: "Point" } } });
    expect(publicDataAdapters.nzta.metadata).toMatchObject({ adapterKey: "public:nzta:journey-planner-delays-v1", accessMethod: "OFFICIAL_PUBLIC_GEOJSON" });
  });

  it("parses MetService CAP RSS and full CAP 1.2 alerts without dropping operational fields", async () => {
    const alertUrl = "https://alerts.metservice.com/cap/alert/urn:oid:2.49.0.1.554.0.test";
    const feed = parseMetServiceCapFeed(`<?xml version="1.0"?><rss version="2.0"><channel><title>MetService New Zealand Weather Warnings</title><link>https://alerts.metservice.com/</link><description>Current warnings</description><pubDate>Tue, 21 Jul 2026 03:00:00 GMT</pubDate><copyright>CC BY 4.0</copyright><item><title>Heavy Rain Warning</title><link>${alertUrl}</link><description>Official warning</description><pubDate>Tue, 21 Jul 2026 02:55:00 GMT</pubDate><guid>warning-123</guid></item><item><title>Rejected host</title><link>https://example.com/alert.xml</link></item></channel></rss>`);
    expect(feed).toMatchObject({ pubDate: "2026-07-21T03:00:00.000Z", copyright: "CC BY 4.0", items: [{ title: "Heavy Rain Warning", link: alertUrl, guid: "warning-123" }] });

    const alert = parseMetServiceCapAlert(`<?xml version="1.0" encoding="UTF-8"?><alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>urn:oid:2.49.0.1.554.0.test</identifier><sender>MetService</sender><sent>2026-07-21T14:55:00+12:00</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope><references>old-alert</references><info><language>en-NZ</language><category>Met</category><event>Heavy Rain Warning</event><responseType>Prepare</responseType><urgency>Expected</urgency><severity>Severe</severity><certainty>Likely</certainty><effective>2026-07-21T15:00:00+12:00</effective><onset>2026-07-21T18:00:00+12:00</onset><expires>2026-07-22T09:00:00+12:00</expires><senderName>MetService New Zealand</senderName><headline>Heavy Rain Warning - Canterbury</headline><description>Rainfall may cause disruption.</description><instruction>Keep up to date with forecasts.</instruction><web>https://www.metservice.com/warnings/home</web><parameter><valueName>ColourCode</valueName><value>Orange</value></parameter><parameter><valueName>ColourCodeHex</valueName><value>#f58220</value></parameter><area><areaDesc>Canterbury High Country</areaDesc><polygon>-43.0,171.0 -44.0,172.0 -43.0,171.0</polygon></area></info></alert>`);
    expect(alert).toMatchObject({ identifier: "urn:oid:2.49.0.1.554.0.test", sent: "2026-07-21T02:55:00.000Z", references: "old-alert", infos: [{ severity: "Severe", certainty: "Likely", parameters: { ColourCode: ["Orange"], ColourCodeHex: ["#f58220"] }, areas: [{ areaDesc: "Canterbury High Country", polygons: ["-43.0,171.0 -44.0,172.0 -43.0,171.0"] }] }] });

    const [signal] = await publicDataAdapters.metservice.normalise([{ sourceId: "metservice", externalId: `cap-alert:${alert.identifier}`, payload: { kind: "cap_alert", sourceUrl: alertUrl, feedItem: feed.items[0], alert }, fetchedAt: new Date("2026-07-21T03:00:00.000Z"), fixture: false }], fixtureContext);
    expect(signal).toMatchObject({ marketKey: "christchurch", type: "WEATHER_OR_ACCESS_DISRUPTION", title: "Heavy Rain Warning - Canterbury", region: "Canterbury High Country", startsAt: new Date("2026-07-21T06:00:00.000Z"), endsAt: new Date("2026-07-21T21:00:00.000Z"), direction: "NEGATIVE", confidence: 0.95, metadata: { sourceFormat: "OASIS CAP 1.2", attribution: "MetService New Zealand" } });
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
    const [show] = parseCanterburyMajorAnnualEvent(`<main>Ravensdown Canterbury A&amp;P Show Wed 11 - Fri 13 November 2026 Canterbury Agricultural Park 70,000 Annual\nVisitors 400 Trade\nSites 5,000 Show\nEvents &amp; Competitions</main>`, "https://www.theshow.co.nz/");
    expect(show).toMatchObject({
      externalId: "canterbury-ap-show:2026",
      impactStatus: "PROMOTED",
      impactScore: 0.95,
      impactEvidence: { schemaVersion: "event-impact-evidence-v1", items: [expect.objectContaining({ evidenceType: "EXPECTED_ATTENDANCE", value: 70_000, unit: "people" })] },
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
    expect(events[0]).toMatchObject({ externalId: "christchurchnz:13786:at:2026-08-17T06:00:00.000Z", city: "Christchurch", region: "Canterbury", latitude: -43.5197, longitude: 172.6602, startsAt: new Date("2026-08-17T06:00:00.000Z"), metadata: { importedSource: "ccc", sourceEventId: "christchurchnz:13786" } });
    const renumbered = await publicDataAdapters.rto_calendars.normaliseEvents!([{ sourceId: "rto_calendars", externalId: "christchurchnz:13786", payload: { provider: "ChristchurchNZ", event: { ...item, event_sessions: [{ ...item.event_sessions[0], id: 804310 }] } }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(renumbered[0].externalId).toBe(events[0].externalId);
    expect(renumbered[0].metadata).toEqual(events[0].metadata);
  });

  it("does not report a partial ChristchurchNZ page budget as successful collection", async () => {
    const originalFetch = globalThis.fetch;
    try {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [], pagination: { currentPage: 1, totalPages: 2 } }), { status: 200 })));
      await expect(publicDataAdapters.rto_calendars.fetch("https://www.christchurchnz.com/api/db/events/all.json?page=1&date=all&category=all&location=all", {
        ...fixtureContext,
        collectionLimits: { maxRequests: 1, maxRecords: 30, timeoutMs: 30_000, maxBytes: 2_000_000 },
      })).rejects.toMatchObject({ code: "PARSING_ERROR" });
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("bootstraps the complete ChristchurchNZ window, then rotates a smaller overlapping page slice", async () => {
    const originalFetch = globalThis.fetch;
    const visited: number[] = [];
    try {
      vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
        const page = Number(new URL(String(input)).searchParams.get("page"));
        visited.push(page);
        const start = new Date(Date.UTC(2026, 8, page));
        const date = start.toISOString().slice(0, 19);
        const event = { id: page, title: `Event ${page}`, earliest_start_date: date, event_sessions: [{ id: page * 10, start_date: date, end_date: date }], data: {} };
        return new Response(JSON.stringify({ data: [event], pagination: { currentPage: page, totalPages: 47 } }), { status: 200 });
      }));
      const reference = "https://www.christchurchnz.com/api/db/events/all.json?page=1&date=all&category=all&location=all";
      const limits = { maxRequests: 40, maxRecords: 1_000, timeoutMs: 180_000, maxBytes: 2_000_000 };
      const range = { from: new Date("2026-09-25T00:00:00Z"), to: new Date("2026-10-07T23:59:59Z") };
      const firstScan: NonNullable<import("../src/adapter-types").AdapterContext["christchurchScan"]> = {};
      const first = await publicDataAdapters.rto_calendars.fetch(reference, { ...fixtureContext, collectionLimits: limits, collectionRange: range, christchurchScan: firstScan });
      expect(firstScan.progress).toMatchObject({ mode: "FULL", firstWindowPage: 25, boundaryPage: 38, nextPage: 27, windowComplete: true });
      expect(visited).toEqual(Array.from({ length: 38 }, (_, index) => index + 1));
      expect(first.map((item) => item.externalId)).toEqual(Array.from({ length: 13 }, (_, index) => `christchurchnz:${index + 25}`));

      visited.length = 0;
      const prior = firstScan.progress!;
      const nextScan: NonNullable<import("../src/adapter-types").AdapterContext["christchurchScan"]> = { previous: prior };
      const next = await publicDataAdapters.rto_calendars.fetch(reference, { ...fixtureContext, collectionLimits: limits, collectionRange: range, christchurchScan: nextScan });
      expect(nextScan.progress).toMatchObject({ mode: "INCREMENTAL", firstWindowPage: 25, boundaryPage: 38, nextPage: 27, windowComplete: true });
      expect(visited).toEqual(Array.from({ length: 15 }, (_, index) => index + 24));
      expect(new Set(next.map((item) => item.externalId)).size).toBe(next.length);
      expect(next.map((item) => item.externalId)).toEqual(first.map((item) => item.externalId));
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("rotates ChristchurchNZ deep pages without returning to page one after each successful run", async () => {
    const originalFetch = globalThis.fetch;
    const visited: number[] = [];
    try {
      vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
        const page = Number(new URL(String(input)).searchParams.get("page"));
        visited.push(page);
        const date = new Date(Date.UTC(2026, 8, 25 + Math.floor((page - 1) / 2))).toISOString().slice(0, 19);
        return new Response(JSON.stringify({ data: [{ id: page, title: `Event ${page}`, earliest_start_date: date, event_sessions: [{ id: page, start_date: date, end_date: date }], data: {} }], pagination: { currentPage: page, totalPages: 47 } }), { status: 200 });
      }));
      const context = { ...fixtureContext, collectionRange: { from: new Date("2026-09-25"), to: new Date("2026-10-26") }, collectionLimits: { maxRequests: 40, maxRecords: 1_000, timeoutMs: 180_000, maxBytes: 2_000_000 } };
      const first: NonNullable<import("../src/adapter-types").AdapterContext["christchurchScan"]> = { previous: { nextPage: 4, firstWindowPage: 1, boundaryPage: 38, fullScanAt: new Date().toISOString() } };
      await publicDataAdapters.rto_calendars.fetch("https://www.christchurchnz.com/api/db/events/all.json?page=1&date=all&category=all&location=all", { ...context, christchurchScan: first });
      expect(visited).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
      expect(first.progress).toMatchObject({ mode: "INCREMENTAL", nextPage: 15, windowComplete: false });
      visited.length = 0;
      const second: NonNullable<import("../src/adapter-types").AdapterContext["christchurchScan"]> = { previous: first.progress! };
      await publicDataAdapters.rto_calendars.fetch("https://www.christchurchnz.com/api/db/events/all.json?page=1&date=all&category=all&location=all", { ...context, christchurchScan: second });
      expect(visited).toEqual([1, 2, 3, ...Array.from({ length: 12 }, (_, index) => index + 15)]);
      expect(second.progress).toMatchObject({ mode: "INCREMENTAL", nextPage: 26, windowComplete: false });
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("uses the official ordered listing date while retaining older recurring sessions", async () => {
    const originalFetch = globalThis.fetch;
    try {
      vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
        const page = Number(new URL(String(input)).searchParams.get("page"));
        const event = page === 1
          ? { id: 1, title: "Recurring event", earliest_start_date: "2026-09-25T00:00:00", event_sessions: [{ id: 10, start_date: "2026-08-01T00:00:00", end_date: "2026-08-01T01:00:00" }, { id: 11, start_date: "2026-09-25T00:00:00", end_date: "2026-09-25T01:00:00" }], data: {} }
          : { id: 2, title: "Later event", earliest_start_date: "2026-11-01T00:00:00", event_sessions: [{ id: 20, start_date: "2026-11-01T00:00:00", end_date: "2026-11-01T01:00:00" }], data: {} };
        return new Response(JSON.stringify({ data: [event], pagination: { currentPage: page, totalPages: 2 } }), { status: 200 });
      }));
      const scan: NonNullable<import("../src/adapter-types").AdapterContext["christchurchScan"]> = {};
      const records = await publicDataAdapters.rto_calendars.fetch("https://www.christchurchnz.com/api/db/events/all.json?page=1&date=all&category=all&location=all", {
        ...fixtureContext, collectionRange: { from: new Date("2026-09-25"), to: new Date("2026-10-26") },
        collectionLimits: { maxRequests: 2, maxRecords: 1_000, timeoutMs: 180_000, maxBytes: 2_000_000 }, christchurchScan: scan,
      });
      expect(records.map((record) => record.externalId)).toEqual(["christchurchnz:1"]);
      expect(scan.progress).toMatchObject({ mode: "FULL", boundaryPage: 2, windowComplete: true });
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("parses Queenstown Airport flights into transport-flow facts", async () => {
    const flight = parseQueenstownAirportFlights([{ flightList: ["NZ659"], from: "Christchurch", destination: "Queenstown", schTime: "09:40:00", schDate: "2026-07-21", status: "On Time", orderByDate: "2026-07-21T09:40:00+12:00", isDomestic: true, flightType: "Arrival" }])[0];
    const signals = await publicDataAdapters.airport_data.normalise([{ sourceId: "airport_data", externalId: "queenstown-airport:arrival:NZ659:2026-07-21T09:40:00+12:00", payload: { provider: "Queenstown Airport", flight }, fetchedAt: new Date(), fixture: false }], fixtureContext);
    expect(signals[0]).toMatchObject({ type: "TRANSPORT_FLOW", marketKey: "queenstown-wanaka", direction: "POSITIVE", startsAt: new Date("2026-07-20T21:40:00.000Z"), confidence: 0.75 });
  });

  it("parses Wellington Airport's official flight board into disruption-aware transport flow", async () => {
    const html = `<div class="flights-board__items-wrapper"><div class="flights-board__item--body-row"><div class="flights-board__scheduled-time"><span>Scheduled time: </span>11:45</div><div class="flights-board__estimated-time"><span>Estimated time: </span>11:55</div><div class="flights-board__place"><span>From: </span>Napier</div><div class="flights-board__flight-number"><span>Flight number: </span>NZ5885</div><span class="flights-board__airline-name">Air New Zealand</span><div class="flights-board__gate"><strong>9</strong></div><div class="flights-board__remarks">Delayed</div></div></div>`;
    const [flight] = parseWellingtonAirportFlights(html, "2026-07-21", "arrival");
    expect(flight).toMatchObject({ flightNumber: "NZ5885", place: "Napier", scheduledAt: "2026-07-20T23:45:00.000Z", estimatedAt: "2026-07-20T23:55:00.000Z", status: "Delayed" });
    const signals = await publicDataAdapters.wellington_airport.normalise([{ sourceId: "wellington_airport", externalId: "wellington-airport:arrival:nz5885:2026", payload: { provider: "Wellington Airport", flight }, fetchedAt: new Date(), fixture: false }], { ...fixtureContext, collectionRange: { from: new Date("2026-07-20T00:00:00Z"), to: new Date("2026-07-22T00:00:00Z") } });
    expect(signals[0]).toMatchObject({ marketKey: "wellington", type: "TRANSPORT_FLOW", direction: "NEGATIVE", confidence: 0.9 });
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

  it("collects bounded Wellington Airport transport flow through direct HTTP", async () => {
    const from = new Date();
    const to = new Date(from.getTime() + 2 * 86_400_000);
    const context = { ...liveContext, collectionRange: { from, to }, collectionLimits: { maxRequests: 4, maxRecords: 40, timeoutMs: 30_000, maxBytes: 2_000_000 } };
    const adapter = publicDataAdapters.wellington_airport;
    const references = await adapter.discover({ marketScope: "wellington", from, to }, context);
    const records = (await Promise.all(references.map((reference) => adapter.fetch(reference, context)))).flat();
    const signals = await adapter.normalise(records, context);
    expect(records.length).toBeGreaterThan(0);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.marketKey === "wellington" && signal.type === "TRANSPORT_FLOW")).toBe(true);
    expect(records.reduce((sum, record) => sum + (record.networkRequestCount ?? 0), 0)).toBeLessThanOrEqual(4);
  }, 30_000);
});
