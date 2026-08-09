import { parse } from "csv-parse/sync";
import { parseHTML } from "linkedom";

import type {
  AdapterContext,
  AdapterHealth,
  AdapterMetadata,
  PublicDataAdapter,
  PublicDiscoveryRequest,
  PublicEvent,
  PublicRawRecord,
  PublicSignal,
} from "./adapter-types";
import { AdapterError } from "./adapter-types";

const UOA_EVENTS_URL = "https://apis.auckland.ac.nz/events-portal-access/v1/events";
const AUCKLAND_LIVE_URL = "https://www.aucklandlive.co.nz/api/live/event-search?date=-&genre=-&price=-&page=1&is_published=true";
const OUR_AUCKLAND_URL = "https://ourauckland.aucklandcouncil.govt.nz/events/?page=1";
const CHRISTCHURCH_NZ_EVENTS_URL = "https://www.christchurchnz.com/api/db/events/all.json?page=1&date=all&category=all&location=all";
const QUEENSTOWN_AIRPORT_ARRIVALS_URL = "https://www.queenstownairport.co.nz/api/flights/arrivals";
const QUEENSTOWN_AIRPORT_DEPARTURES_URL = "https://www.queenstownairport.co.nz/api/flights/departures";
const WELLINGTON_AIRPORT_FLIGHTS_URL = "https://www.wellingtonairport.co.nz/flights/";
const POAL_CRUISE_CSV_URL = "https://poal.co.nz/operations/schedules/cruises/download";
const LINZ_GAZETTEER_SEARCH_URL = "https://gazetteer.linz.govt.nz/api/search";

type JsonRecord = Record<string, unknown>;
type RawEntry = { externalId: string; payload: unknown };
type Collector = (reference: string, context: AdapterContext) => Promise<PublicRawRecord[]>;
type EventNormaliser = (records: PublicRawRecord[], context: AdapterContext) => PublicEvent[];
type SignalNormaliser = (records: PublicRawRecord[], context: AdapterContext) => PublicSignal[];

class OfficialEndpointAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata;

  constructor(
    metadata: AdapterMetadata,
    private readonly references: string[],
    private readonly collector: Collector,
    private readonly eventNormaliser: EventNormaliser = () => [],
    private readonly signalNormaliser: SignalNormaliser = () => [],
  ) {
    this.metadata = metadata;
  }

  async discover(_request: PublicDiscoveryRequest, _context: AdapterContext): Promise<string[]> {
    return this.references;
  }

  fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    if (!isAllowedHttpsUrl(reference, this.metadata.supportedDomains)) {
      throw new AdapterError("INVALID_INPUT", `${this.metadata.sourceName} reference host is not allowed`, false);
    }
    return this.collector(reference, context);
  }

  async normalise(records: PublicRawRecord[], context: AdapterContext): Promise<PublicSignal[]> {
    return this.signalNormaliser(records, context);
  }

  async normaliseEvents(records: PublicRawRecord[], context: AdapterContext): Promise<PublicEvent[]> {
    return this.eventNormaliser(records, context);
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    return endpointHealth(this.references[0]!, this.metadata.sourceName, context);
  }

}

export function parseUniversityEvents(payload: unknown): JsonRecord[] {
  if (!Array.isArray(payload)) throw new Error("University of Auckland response is not an event array");
  return payload.filter((item): item is JsonRecord => isRecord(item) && Boolean(stringValue(item.eventId)) && Boolean(stringValue(item.name)));
}

async function collectUniversityEvents(reference: string, context: AdapterContext) {
  const maxRequests = Math.min(3, Math.max(1, context.collectionLimits?.maxRequests ?? 1));
  const eventsById = new Map<string, JsonRecord>();
  for (let request = 0; request < maxRequests; request += 1) {
    const payload = await fetchJson(reference, context, "University of Auckland events");
    for (const event of parseUniversityEvents(payload)) eventsById.set(stringValue(event.eventId), event);
  }
  const entries = [...eventsById.values()]
    .filter((event) => {
      const location = jsonRecord(event.location);
      const startsAt = parseNzDateTime(stringValue(event.startDateTime));
      const endsAt = parseNzDateTime(stringValue(event.endDateTime)) ?? startsAt;
      return startsAt && isNzInPersonLocation(location) && overlaps(startsAt, endsAt ?? startsAt, context);
    })
    .sort((left, right) => stableEventOrder(left, right, "startDateTime", "eventId"))
    .slice(0, maxRecords(context))
    .map((event) => ({ externalId: `uoa:${stringValue(event.eventId)}`, payload: { provider: "University of Auckland", event } }));
  return rawRecords("university_calendars", entries, maxRequests);
}

function normaliseUniversityEvents(records: PublicRawRecord[], context: AdapterContext) {
  const events: PublicEvent[] = [];
  for (const record of records) {
    const item = jsonRecord(jsonRecord(record.payload).event);
    const startsAt = parseNzDateTime(stringValue(item.startDateTime));
    if (!startsAt) continue;
    const parsedEnd = parseNzDateTime(stringValue(item.endDateTime));
    const endsAt = parsedEnd && parsedEnd >= startsAt ? parsedEnd : startsAt;
    const location = jsonRecord(item.location);
    const sourceEventId = `uoa:${stringValue(item.eventId)}`;
    const sourceUrl = safeHttpsUrl(stringValue(item.url)) ?? "https://unievents.auckland.ac.nz/";
    const city = nullableString(location.city);
    events.push(baseEvent({
      sourceId: "university_calendars",
      externalId: `${sourceEventId}:${startsAt.toISOString()}`,
      sourceEventId,
      title: stringValue(item.name),
      category: nullableString(item.categoryName),
      subcategory: nullableString(item.subcategoryName),
      sourceUrl,
      venueName: nullableString(location.name),
      address: nullableString(location.displayName) ?? joinAddress(location),
      city,
      region: nullableString(location.region) ?? city,
      postcode: nullableString(location.postCode),
      latitude: finiteNumber(location.latitude),
      longitude: finiteNumber(location.longitude),
      startsAt,
      endsAt,
      ticketStatus: booleanValue(item.soldOut) || booleanValue(item.isSoldOut) ? "SOLD_OUT" : "AVAILABLE_OR_UNKNOWN",
      metadata: {
        description: nullableString(item.description) ?? nullableString(item.summary),
        summary: nullableString(item.summary),
        imageUrl: safeHttpsUrl(stringValue(item.imageUrl)),
        thumbnailUrl: safeHttpsUrl(stringValue(item.thumbnailUrl)),
        eventSource: nullableString(item.eventSource),
        organisationName: nullableString(item.organisationName),
        organiserUrl: safeHttpsUrl(stringValue(item.organiserUrl)),
        lowestPrice: finiteNumber(item.lowestPrice),
        highestPrice: finiteNumber(item.highestPrice),
        isFree: booleanValue(item.free) || booleanValue(item.isFree),
        sourceEventId,
        seriesUrl: sourceUrl,
        extractionVersion: "uoa-events-api-v1",
      },
    }));
  }
  return events.slice(0, maxRecords(context));
}

export function parseAucklandLivePage(payload: unknown): { shows: JsonRecord[]; totalPages: number } {
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw new Error("Auckland Live response has no data array");
  const links = jsonRecord(payload.links);
  const last = stringValue(links.last);
  const totalPages = positiveInteger(urlParameter(last, "page")) ?? 1;
  return { shows: payload.data.filter(isRecord), totalPages };
}

async function collectAucklandLive(reference: string, context: AdapterContext) {
  const entries: RawEntry[] = [];
  // Page one currently exceeds the shared 2 MB local-acceptance evidence cap.
  // Page two uses the same official contract and contains in-range events.
  let page = context.localAcceptance ? 2 : 1;
  let requestCount = 0;
  let totalPages = page;
  const requestLimit = maxRequests(context, 50);
  while (page <= totalPages && requestCount < requestLimit && entries.length < maxRecords(context)) {
    const url = new URL(reference);
    url.searchParams.set("page", String(page));
    const parsed = parseAucklandLivePage(await fetchJson(url.href, context, "Auckland Live events"));
    requestCount += 1;
    totalPages = Math.min(parsed.totalPages, 50);
    for (const show of parsed.shows.sort((left, right) => stableEventOrder(jsonRecord(left.attributes), jsonRecord(right.attributes), "start_date", "name"))) {
      const attributes = jsonRecord(show.attributes);
      const startsAt = parseIsoDateTime(stringValue(attributes.start_date));
      const endsAt = parseIsoDateTime(stringValue(attributes.end_date)) ?? startsAt;
      if (!startsAt || !overlaps(startsAt, endsAt ?? startsAt, context)) continue;
      entries.push({ externalId: `auckland-live:${stringValue(show.id)}`, payload: { provider: "Auckland Live", show } });
      if (entries.length >= maxRecords(context)) break;
    }
    page += 1;
  }
  return rawRecords("venue_calendars", entries, requestCount);
}

function normaliseAucklandLiveEvents(records: PublicRawRecord[], context: AdapterContext) {
  const events: PublicEvent[] = [];
  for (const record of records) {
    const show = jsonRecord(jsonRecord(record.payload).show);
    const attributes = jsonRecord(show.attributes);
    const sourceEventId = `auckland-live:${stringValue(show.id)}`;
    const slug = stringValue(attributes.slug);
    const sourceUrl = `https://www.aucklandlive.co.nz/show/${encodeURIComponent(slug)}`;
    const performances = arrayRecords(attributes.performances);
    const occurrences = performances.length ? performances : [{
      id: "season",
      starts_at: attributes.start_date,
      ends_at: attributes.end_date,
      venue_name: attributes.venue_name,
      ticketmaster_availability: "",
    }];
    for (const performance of occurrences) {
      const startsAt = parseIsoDateTime(stringValue(performance.starts_at));
      if (!startsAt) continue;
      const parsedEnd = parseIsoDateTime(stringValue(performance.ends_at));
      const endsAt = parsedEnd && parsedEnd >= startsAt ? parsedEnd : startsAt;
      if (!overlaps(startsAt, endsAt, context)) continue;
      events.push(baseEvent({
        sourceId: "venue_calendars",
        externalId: `${sourceEventId}:${stringValue(performance.id) || startsAt.toISOString()}`,
        sourceEventId,
        title: stringValue(attributes.name),
        category: firstString(arrayRecords(attributes.genres).map((genre) => genre.description ?? genre.name)),
        subcategory: firstString(stringArray(attributes.tags)),
        sourceUrl,
        venueName: nullableString(performance.venue_name) ?? nullableString(attributes.venue_name),
        address: null,
        city: "Auckland",
        region: "Auckland",
        postcode: null,
        latitude: null,
        longitude: null,
        startsAt,
        endsAt,
        ticketStatus: aucklandLiveTicketStatus(performance),
        metadata: {
          description: nullableString(attributes.description) ?? nullableString(attributes.seo_description),
          subtitle: nullableString(attributes.subtitle),
          presenter: nullableString(attributes.presenter),
          duration: nullableString(attributes.duration),
          price: nullableString(attributes.price),
          pricing: Array.isArray(attributes.pricing) ? attributes.pricing : [],
          images: [safeHttpsUrl(stringValue(attributes.landscape_thumbnail)), safeHttpsUrl(stringValue(attributes.square_thumbnail))].filter(Boolean),
          accessibility: {
            wheelchairAccessible: booleanValue(attributes.wheelchair_accessible),
            audioDescribed: booleanValue(attributes.audio_described),
            hearingAidLoop: booleanValue(attributes.hearing_aid_loop),
            signLanguageInterpreted: booleanValue(attributes.sign_language_interpreted),
            relaxed: booleanValue(performance.accessibility_relaxed),
          },
          performance,
          sourceEventId,
          seriesUrl: sourceUrl,
          extractionVersion: "auckland-live-event-search-v1",
        },
      }));
      if (events.length >= maxRecords(context)) return events;
    }
  }
  return events;
}

export type OurAucklandEvent = {
  id: string;
  title: string;
  summary: string | null;
  sourceUrl: string;
  startsOn: string;
  endsOn: string;
  rawHtml: string;
};

export function parseOurAucklandPage(html: string): { events: OurAucklandEvent[]; totalPages: number } {
  const { document } = parseHTML(html);
  const events: OurAucklandEvent[] = [];
  for (const tile of document.querySelectorAll(".article-tile")) {
    const link = tile.querySelector(".article-tile__link");
    const title = cleanText(link?.textContent ?? "");
    const href = link?.getAttribute("href") ?? "";
    const range = parseOurAucklandDateRange(cleanText(tile.querySelector(".article-tile__date")?.textContent ?? ""));
    if (!title || !href || !range) continue;
    const sourceUrl = new URL(href, OUR_AUCKLAND_URL).href;
    events.push({
      id: `our-auckland:${sourceUrl.split("/").filter(Boolean).at(-1)}`,
      title,
      summary: nullableString(tile.querySelector(".article-tile__content > p")?.textContent),
      sourceUrl,
      startsOn: range.startsOn,
      endsOn: range.endsOn,
      rawHtml: tile.outerHTML,
    });
  }
  const totalPages = Math.max(1, ...[...document.querySelectorAll(".pagination__link")].map((link) => Number(link.getAttribute("data-page"))).filter(Number.isInteger));
  return { events, totalPages };
}

async function collectOurAuckland(reference: string, context: AdapterContext) {
  const entries: RawEntry[] = [];
  let page = 1;
  let requestCount = 0;
  let totalPages = 1;
  const requestLimit = maxRequests(context, 50);
  while (page <= totalPages && requestCount < requestLimit && entries.length < maxRecords(context)) {
    const url = new URL(reference);
    url.searchParams.set("page", String(page));
    const parsed = parseOurAucklandPage(await fetchText(url.href, context, "OurAuckland events", "text/html"));
    requestCount += 1;
    totalPages = Math.min(parsed.totalPages, 50);
    for (const event of parsed.events.sort((left, right) => stableEventOrder(left, right, "earliest_start_date", "id"))) {
      const startsAt = parseNzDateTime(`${event.startsOn}T00:00:00`);
      const endsAt = parseNzDateTime(`${event.endsOn}T23:59:59`);
      if (!startsAt || !endsAt || !overlaps(startsAt, endsAt, context)) continue;
      entries.push({ externalId: event.id, payload: { provider: "Auckland Council / OurAuckland", event, page } });
      if (entries.length >= maxRecords(context)) break;
    }
    page += 1;
  }
  return rawRecords("council_calendars", entries, requestCount);
}

function normaliseOurAucklandEvents(records: PublicRawRecord[], context: AdapterContext) {
  return records.flatMap((record): PublicEvent[] => {
    const event = jsonRecord(jsonRecord(record.payload).event);
    if (stringValue(event.kind) === "event_detail") return normaliseOurAucklandDetail(event);
    const startsAt = parseNzDateTime(`${stringValue(event.startsOn)}T00:00:00`);
    const advertisedEnd = parseNzDateTime(`${stringValue(event.endsOn)}T23:59:59`);
    if (!startsAt || !advertisedEnd) return [];
    const sourceEventId = stringValue(event.id);
    const sourceUrl = stringValue(event.sourceUrl);
    return [baseEvent({
      sourceId: "council_calendars",
      externalId: `${sourceEventId}:${startsAt.toISOString()}`,
      sourceEventId,
      title: stringValue(event.title),
      category: "Council event",
      subcategory: null,
      sourceUrl,
      venueName: null,
      address: null,
      city: "Auckland",
      region: "Auckland",
      postcode: null,
      latitude: null,
      longitude: null,
      startsAt,
      endsAt: advertisedEnd,
      ticketStatus: null,
      metadata: {
        description: nullableString(event.summary),
        advertisedDateRange: { startsOn: stringValue(event.startsOn), endsOn: stringValue(event.endsOn) },
        timePrecision: "DATE_ONLY",
        sourceEventId,
        seriesUrl: sourceUrl,
        extractionVersion: "our-auckland-listing-html-v1",
      },
    })];
  }).slice(0, maxRecords(context));
}

function normaliseOurAucklandDetail(event: JsonRecord): PublicEvent[] {
  const sourceEventId = stringValue(event.id);
  const sourceUrl = stringValue(event.canonicalUrl);
  const venue = jsonRecord(event.venue);
  const categories = stringArray(event.categories);
  const tags = stringArray(event.tags);
  const quality = stringValue(event.quality);
  return arrayRecords(event.occurrences).flatMap((occurrence): PublicEvent[] => {
    const precision = stringValue(occurrence.timePrecision) === "DATETIME" ? "DATETIME" : "DATE";
    const startsAt = precision === "DATETIME"
      ? parseNzDateTime(stringValue(occurrence.startsAt))
      : parseNzDateTime(`${stringValue(occurrence.startsAt)}T00:00:00`);
    const advertisedEnd = nullableString(occurrence.endsAt);
    const endsAt = advertisedEnd
      ? precision === "DATETIME" ? parseNzDateTime(advertisedEnd) : parseNzDateTime(`${advertisedEnd}T23:59:59`)
      : startsAt;
    if (!sourceEventId || !sourceUrl || !startsAt || !endsAt) return [];
    return [baseEvent({
      sourceId: "council_calendars",
      externalId: `${sourceEventId}:${startsAt.toISOString()}`,
      sourceEventId,
      title: stringValue(event.title),
      category: categories[0] ?? tags[0] ?? "Council event",
      subcategory: categories[1] ?? tags[1] ?? null,
      sourceUrl,
      venueName: nullableString(venue.name),
      address: nullableString(venue.addressText),
      city: "Auckland",
      region: "Auckland",
      postcode: null,
      latitude: null,
      longitude: null,
      startsAt,
      endsAt,
      ticketStatus: event.isFree === true ? "FREE" : null,
      impactEvidence: isRecord(occurrence.impactEvidence) ? occurrence.impactEvidence : undefined,
      metadata: {
        description: nullableString(event.description),
        occurrence,
        timePrecision: precision,
        advertisedEnd,
        endTimeMissing: advertisedEnd === null,
        categories,
        tags,
        ward: nullableString(event.ward),
        costText: nullableString(event.costText),
        isFree: event.isFree === true ? true : event.isFree === false ? false : null,
        bookingRequired: event.bookingRequired === true ? true : event.bookingRequired === false ? false : null,
        publicContact: isRecord(event.publicContact) ? event.publicContact : null,
        imageUrls: stringArray(event.imageUrls),
        mapUrl: nullableString(venue.mapUrl),
        argusQuality: quality || null,
        argusMissingFields: stringArray(event.missingFields),
        argusWarnings: stringArray(event.warnings),
        argusFieldSources: isRecord(event.fieldSources) ? event.fieldSources : {},
        sourceEventId,
        seriesUrl: sourceUrl,
        extractionVersion: "our-auckland-detail-v1",
      },
    })];
  });
}

export function parseChristchurchNzPage(payload: unknown): { events: JsonRecord[]; currentPage: number; totalPages: number } {
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw new Error("ChristchurchNZ response has no data array");
  const pagination = jsonRecord(payload.pagination);
  return {
    events: payload.data.filter(isRecord),
    currentPage: positiveInteger(pagination.currentPage) ?? 1,
    totalPages: positiveInteger(pagination.totalPages) ?? 1,
  };
}

async function collectChristchurchNz(reference: string, context: AdapterContext) {
  const entries: RawEntry[] = [];
  let page = 1;
  let requestCount = 0;
  let totalPages = 1;
  const requestLimit = maxRequests(context, 60);
  while (page <= totalPages && requestCount < requestLimit && entries.length < maxRecords(context)) {
    const url = new URL(reference);
    url.searchParams.set("page", String(page));
    const parsed = parseChristchurchNzPage(await fetchJson(url.href, context, "ChristchurchNZ events"));
    requestCount += 1;
    totalPages = Math.min(parsed.totalPages, 60);
    for (const event of parsed.events) {
      if (!christchurchEventOverlaps(event, context)) continue;
      entries.push({ externalId: `christchurchnz:${stringValue(event.id)}`, payload: { provider: "ChristchurchNZ", event } });
      if (entries.length >= maxRecords(context)) break;
    }
    page += 1;
  }
  return rawRecords("rto_calendars", entries, requestCount);
}

function normaliseChristchurchNzEvents(records: PublicRawRecord[], context: AdapterContext) {
  const events: PublicEvent[] = [];
  for (const record of records) {
    const item = jsonRecord(jsonRecord(record.payload).event);
    const data = jsonRecord(item.data);
    const sourceEventId = `christchurchnz:${stringValue(item.id)}`;
    const sessions = arrayRecords(item.event_sessions);
    const occurrences = sessions.length ? sessions : [{ id: "event", start_date: item.earliest_start_date ?? item.start_date, end_date: item.earliest_start_date ?? item.start_date }];
    for (const session of occurrences) {
      const startsAt = parseUtcNaive(stringValue(session.start_date));
      if (!startsAt) continue;
      const parsedEnd = parseUtcNaive(stringValue(session.end_date));
      const endsAt = parsedEnd && parsedEnd >= startsAt ? parsedEnd : startsAt;
      if (!overlaps(startsAt, endsAt, context)) continue;
      const venue = jsonRecord(data.Venues);
      const sourceUrl = christchurchEventUrl(item, data);
      const coordinates = parseCoordinates(data.Coordinates ?? venue.Coordinates ?? jsonRecord(data.point));
      events.push(baseEvent({
        sourceId: "rto_calendars",
        externalId: `${sourceEventId}:${stringValue(session.id) || startsAt.toISOString()}`,
        sourceEventId,
        title: stringValue(item.title) || stringValue(data.Title),
        category: firstString(Array.isArray(item.categories) ? item.categories : [data.CategoryTitles]),
        subcategory: nullableString(data.PriceType),
        sourceUrl,
        venueName: nullableString(venue.Title) ?? nullableString(data.BuildingName) ?? nullableString(jsonRecord(data.location).name),
        address: nullableString(venue.StreetAddress) ?? nullableString(data.StreetAddress) ?? nullableString(data.address),
        city: "Christchurch",
        region: "Canterbury",
        postcode: null,
        latitude: coordinates?.latitude ?? finiteNumber(jsonRecord(data.point).lat),
        longitude: coordinates?.longitude ?? finiteNumber(jsonRecord(data.point).lng),
        startsAt,
        endsAt,
        ticketStatus: rtoTicketStatus(data),
        sourceUpdatedAt: parseIsoDateTime(stringValue(item.created_at)),
        metadata: {
          description: nullableString(item.content) ?? nullableString(item.summary),
          summary: nullableString(item.summary),
          image: safeHttpsUrl(stringValue(item.image)),
          importedSource: nullableString(item.source),
          categories: Array.isArray(item.categories) ? item.categories : [],
          priceType: nullableString(data.PriceType),
          ticketPriceMin: data.TicketPriceMin ?? null,
          ticketPriceMax: data.TicketPriceMax ?? null,
          bookingRequired: data.BookingRequired ?? null,
          services: Array.isArray(data.EventServices) ? data.EventServices : [],
          session,
          sourceEventId,
          seriesUrl: sourceUrl,
          extractionVersion: "christchurchnz-events-db-v1",
        },
      }));
      if (events.length >= maxRecords(context)) return events;
    }
  }
  return events;
}

export function parseQueenstownAirportFlights(payload: unknown): JsonRecord[] {
  if (!Array.isArray(payload)) throw new Error("Queenstown Airport response is not a flight array");
  return payload.filter((flight): flight is JsonRecord => isRecord(flight) && Array.isArray(flight.flightList) && Boolean(stringValue(flight.orderByDate)));
}

export type WellingtonAirportFlight = {
  direction: "arrival" | "departure";
  scheduledAt: string;
  estimatedAt: string | null;
  place: string;
  flightNumber: string;
  airline: string | null;
  gate: string | null;
  status: string | null;
};

export function parseWellingtonAirportFlights(html: string, date: string, direction: "arrival" | "departure") {
  const { document } = parseHTML(html);
  const board = document.querySelector(".flights-board__items-wrapper");
  if (!board) throw new Error("Wellington Airport page has no flight board");
  return [...board.querySelectorAll(".flights-board__item--body-row")].flatMap((row): WellingtonAirportFlight[] => {
    const scheduled = cleanText(row.querySelector(".flights-board__scheduled-time")?.textContent ?? "").replace(/^Scheduled time:\s*/i, "");
    const estimated = cleanText(row.querySelector(".flights-board__estimated-time")?.textContent ?? "").replace(/^Estimated time:\s*/i, "");
    const place = cleanText(row.querySelector(".flights-board__place")?.textContent ?? "").replace(/^(?:From|To):\s*/i, "");
    const flightNumber = cleanText(row.querySelector(".flights-board__flight-number")?.textContent ?? "").replace(/^(?:Fight|Flight) number:\s*/i, "");
    const airline = nullableString(cleanText(row.querySelector(".flights-board__airline-name")?.textContent ?? ""));
    const gate = nullableString(cleanText(row.querySelector(".flights-board__gate strong")?.textContent ?? ""));
    const status = nullableString(cleanText(row.querySelector(".flights-board__remarks")?.textContent ?? ""));
    const scheduledAt = parseNzDateTime(`${date}T${scheduled}:00`);
    const estimatedAt = /^\d{2}:\d{2}$/.test(estimated) ? parseNzDateTime(`${date}T${estimated}:00`) : null;
    if (!scheduledAt || !place || !flightNumber) return [];
    return [{ direction, scheduledAt: scheduledAt.toISOString(), estimatedAt: estimatedAt?.toISOString() ?? null, place, flightNumber, airline, gate, status }];
  });
}

async function collectWellingtonAirport(reference: string, context: AdapterContext) {
  const from = context.collectionRange?.from ?? new Date();
  const to = context.collectionRange?.to ?? new Date(from.getTime() + 7 * 86_400_000);
  const firstDate = nzDate(from);
  const requestedDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
  const days = Math.min(7, requestedDays);
  const requestLimit = Math.min(maxRequests(context, 14), days * 2);
  const flights = new Map<string, WellingtonAirportFlight>();
  let requests = 0;
  for (let day = 0; day < days && requests < requestLimit; day += 1) {
    const date = isoDate(new Date(firstDate.getTime() + day * 86_400_000));
    for (const direction of ["arrival", "departure"] as const) {
      if (requests >= requestLimit || flights.size >= maxRecords(context)) break;
      const url = new URL(reference);
      url.searchParams.set("day", date);
      url.searchParams.set("time", "0");
      if (direction === "departure") url.searchParams.set("direction", "D");
      else url.searchParams.set("flight_type", "arrivals");
      const html = await fetchText(url.href, context, "Wellington Airport flights", "text/html,application/xhtml+xml");
      requests += 1;
      for (const flight of parseWellingtonAirportFlights(html, date, direction)) {
        const key = `${flight.direction}:${flight.flightNumber}:${flight.scheduledAt}`;
        flights.set(key, flight);
        if (flights.size >= maxRecords(context)) break;
      }
    }
  }
  const entries = [...flights.values()].map((flight) => ({
    externalId: `wellington-airport:${flight.direction}:${slug(flight.flightNumber)}:${flight.scheduledAt}`,
    payload: { provider: "Wellington Airport", flight },
  }));
  return rawRecords("wellington_airport", entries, requests);
}

function normaliseWellingtonAirport(records: PublicRawRecord[], context: AdapterContext) {
  return records.flatMap((record): PublicSignal[] => {
    const flight = jsonRecord(jsonRecord(record.payload).flight);
    const startsAt = parseIsoDateTime(stringValue(flight.scheduledAt));
    if (!startsAt || !overlaps(startsAt, new Date(startsAt.getTime() + 3_600_000), context)) return [];
    const direction = stringValue(flight.direction);
    const status = stringValue(flight.status);
    const disrupted = /cancel|divert|delay|late/i.test(status);
    return [{
      sourceId: "wellington_airport",
      externalId: record.externalId,
      marketKey: "wellington",
      type: "TRANSPORT_FLOW",
      title: `${direction === "arrival" ? "Arrival" : "Departure"} ${stringValue(flight.flightNumber)} ${direction === "arrival" ? "from" : "to"} ${stringValue(flight.place)}`,
      region: "Wellington",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      direction: disrupted ? "NEGATIVE" : direction === "arrival" ? "POSITIVE" : "MIXED",
      confidence: disrupted ? 0.9 : 0.75,
      evidenceRef: WELLINGTON_AIRPORT_FLIGHTS_URL,
      metadata: { ...flight, sourceFormat: "Wellington Airport public flight board HTML" },
      fixture: false,
    }];
  }).slice(0, maxRecords(context));
}

async function collectQueenstownAirport(reference: string, context: AdapterContext) {
  const payload = await fetchJson(reference, context, "Queenstown Airport flights");
  const entries = parseQueenstownAirportFlights(payload)
    .filter((flight) => {
      const startsAt = parseIsoDateTime(stringValue(flight.orderByDate));
      return startsAt && overlaps(startsAt, new Date(startsAt.getTime() + 3_600_000), context);
    })
    .sort((left, right) => stableEventOrder(left, right, "orderByDate", "flightType"))
    .slice(0, maxRecords(context))
    .map((flight) => {
      const codes = stringArray(flight.flightList);
      return { externalId: `queenstown-airport:${slug(stringValue(flight.flightType))}:${codes[0] ?? "unknown"}:${stringValue(flight.orderByDate)}`, payload: { provider: "Queenstown Airport", flight } };
    });
  return rawRecords("airport_data", entries, 1);
}

function normaliseQueenstownAirport(records: PublicRawRecord[], context: AdapterContext) {
  return records.flatMap((record): PublicSignal[] => {
    const flight = jsonRecord(jsonRecord(record.payload).flight);
    const startsAt = parseIsoDateTime(stringValue(flight.orderByDate));
    if (!startsAt) return [];
    const status = stringValue(flight.status);
    const flightType = stringValue(flight.flightType);
    const cancelledOrDisrupted = /cancel|divert|delay/i.test(status);
    const isArrival = /arrival/i.test(flightType);
    const codes = stringArray(flight.flightList);
    return [{
      sourceId: "airport_data",
      externalId: record.externalId,
      marketKey: "queenstown-wanaka",
      type: "TRANSPORT_FLOW",
      title: `${flightType || "Flight"} ${codes.join("/") || "unknown"}: ${stringValue(flight.from)} to ${stringValue(flight.destination)}`,
      region: "Queenstown",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      direction: cancelledOrDisrupted ? "NEGATIVE" : isArrival ? "POSITIVE" : "MIXED",
      confidence: cancelledOrDisrupted ? 0.9 : 0.75,
      evidenceRef: "https://www.queenstownairport.co.nz/flights/arrivals-departures/",
      metadata: { ...flight, sourceFormat: "Queenstown Airport public JSON", collectedFeed: new URL(record.externalId.includes(":arrival:") ? QUEENSTOWN_AIRPORT_ARRIVALS_URL : QUEENSTOWN_AIRPORT_DEPARTURES_URL).pathname },
      fixture: false,
    }];
  }).slice(0, maxRecords(context));
}

export type PoalCruiseCall = {
  vessel: string;
  wharf: string | null;
  arrival: string;
  departs: string;
  previousPort: string | null;
  nextPort: string | null;
};

export function parsePoalCruiseCsv(csv: string): PoalCruiseCall[] {
  const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true }) as Record<string, string>[];
  return rows.flatMap((row) => {
    const vessel = cleanText(row.Vessel ?? "");
    const arrival = parsePortDate(row.Arrival ?? "");
    const departs = parsePortDate(row.Departs ?? "");
    if (!vessel || !arrival || !departs) return [];
    const wharfKey = Object.keys(row).find((key) => /^Wharf Vessel Ref/.test(key));
    return [{
      vessel,
      wharf: nullableString(wharfKey ? row[wharfKey] : null),
      arrival: arrival.toISOString(),
      departs: departs.toISOString(),
      previousPort: nullableString(row["Previous Port"]),
      nextPort: nullableString(row["Next Port"]),
    }];
  });
}

async function collectPoalCruises(reference: string, context: AdapterContext) {
  const csv = await fetchText(reference, context, "Port of Auckland cruise schedule", "text/csv");
  const entries = parsePoalCruiseCsv(csv)
    .filter((call) => overlaps(new Date(call.arrival), new Date(call.departs), context))
    .slice(0, maxRecords(context))
    .map((call) => ({ externalId: `poal-cruise:${slug(call.vessel)}:${call.arrival}`, payload: { provider: "Port of Auckland", sourceUrl: reference, call } }));
  return rawRecords("port_and_cruise", entries, 1);
}

function normalisePoalCruises(records: PublicRawRecord[], context: AdapterContext) {
  return records.flatMap((record): PublicSignal[] => {
    const call = jsonRecord(jsonRecord(record.payload).call);
    const startsAt = parseIsoDateTime(stringValue(call.arrival));
    const parsedEnd = parseIsoDateTime(stringValue(call.departs));
    if (!startsAt) return [];
    return [{
      sourceId: "port_and_cruise",
      externalId: record.externalId,
      marketKey: "auckland",
      type: "TRANSPORT_FLOW",
      title: `${stringValue(call.vessel)} cruise call at Auckland`,
      region: "Auckland",
      startsAt,
      endsAt: parsedEnd && parsedEnd >= startsAt ? parsedEnd : startsAt,
      direction: "POSITIVE",
      confidence: 0.85,
      evidenceRef: "https://poal.co.nz/operations/schedules/cruise",
      metadata: { ...call, sourceFormat: "Port of Auckland public CSV" },
      fixture: false,
    }];
  }).slice(0, maxRecords(context));
}

class LinzGazetteerAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "linz",
    sourceName: "LINZ New Zealand Gazetteer",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["gazetteer.linz.govt.nz"],
    adapterKey: "public:linz:gazetteer-search-v1",
    accessMethod: "OFFICIAL_PUBLIC_JSON",
    concurrencyLimit: 1,
    dailyBudget: 100,
    collectorVersion: "linz-gazetteer-search-fetch-v1",
    parserVersion: "linz-gazetteer-search-json-v1",
  };

  async discover(request: PublicDiscoveryRequest): Promise<string[]> {
    const terms = request.marketScope === "new-zealand"
      ? ["Auckland", "Wellington", "Christchurch", "Queenstown", "Rotorua", "Tauranga", "Hamilton", "Dunedin", "Nelson", "Napier", "Taupo", "Paihia"]
      : [request.marketScope.replace(/[-_]+/g, " ")];
    return terms.map((term) => `${LINZ_GAZETTEER_SEARCH_URL}?term=${encodeURIComponent(term)}`);
  }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    if (!isAllowedHttpsUrl(reference, this.metadata.supportedDomains)) throw new AdapterError("INVALID_INPUT", "LINZ Gazetteer reference host is not allowed", false);
    const payload = await fetchJson(reference, context, "LINZ Gazetteer");
    if (!isRecord(payload) || !Array.isArray(payload.results)) throw new AdapterError("PARSING_ERROR", "LINZ Gazetteer response has no results array", false);
    const term = new URL(reference).searchParams.get("term") ?? "";
    const entries = payload.results.filter(isRecord).slice(0, maxRecords(context)).map((place) => ({
      externalId: `linz-gazetteer:${stringValue(place.id) || stringValue(place.feat_id)}`,
      payload: { provider: "LINZ New Zealand Gazetteer", query: term, bbox: payload.bbox ?? null, place },
    }));
    return rawRecords("linz", entries, 1);
  }

  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(): Promise<PublicEvent[]> { return []; }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(`${LINZ_GAZETTEER_SEARCH_URL}?term=Auckland`, this.metadata.sourceName, context); }
}

export const officialNzSourceAdapters: Record<string, PublicDataAdapter> = {
  linz: new LinzGazetteerAdapter(),
  university_calendars: new OfficialEndpointAdapter({
    sourceId: "university_calendars", sourceName: "University of Auckland events", sourceType: "PUBLIC_DATA",
    supportedDomains: ["apis.auckland.ac.nz"], adapterKey: "public:university-calendars:uoa-events-v1", accessMethod: "OFFICIAL_PUBLIC_JSON",
    concurrencyLimit: 1, dailyBudget: 24, collectorVersion: "uoa-events-fetch-v1", parserVersion: "uoa-events-json-v1",
  }, [UOA_EVENTS_URL], collectUniversityEvents, normaliseUniversityEvents),
  venue_calendars: new OfficialEndpointAdapter({
    sourceId: "venue_calendars", sourceName: "Auckland Live events", sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.aucklandlive.co.nz"], adapterKey: "public:venue-calendars:auckland-live-v1", accessMethod: "OFFICIAL_PUBLIC_JSON_PAGINATED",
    concurrencyLimit: 1, dailyBudget: 48, collectorVersion: "auckland-live-fetch-v1", parserVersion: "auckland-live-json-v1",
  }, [AUCKLAND_LIVE_URL], collectAucklandLive, normaliseAucklandLiveEvents),
  council_calendars: new OfficialEndpointAdapter({
    sourceId: "council_calendars", sourceName: "Auckland Council OurAuckland events", sourceType: "PUBLIC_DATA",
    supportedDomains: ["ourauckland.aucklandcouncil.govt.nz"], adapterKey: "public:council-calendars:our-auckland-v1", accessMethod: "OFFICIAL_PUBLIC_HTML_PAGINATED",
    concurrencyLimit: 1, dailyBudget: 100, collectorVersion: "our-auckland-fetch-v1", parserVersion: "our-auckland-html-v1",
  }, [OUR_AUCKLAND_URL], collectOurAuckland, normaliseOurAucklandEvents),
  rto_calendars: new OfficialEndpointAdapter({
    sourceId: "rto_calendars", sourceName: "ChristchurchNZ events", sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.christchurchnz.com"], adapterKey: "public:rto-calendars:christchurchnz-v1", accessMethod: "OFFICIAL_PUBLIC_JSON_PAGINATED",
    concurrencyLimit: 1, dailyBudget: 100, collectorVersion: "christchurchnz-events-fetch-v1", parserVersion: "christchurchnz-events-json-v1",
  }, [CHRISTCHURCH_NZ_EVENTS_URL], collectChristchurchNz, normaliseChristchurchNzEvents),
  airport_data: new OfficialEndpointAdapter({
    sourceId: "airport_data", sourceName: "Queenstown Airport flights", sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.queenstownairport.co.nz"], adapterKey: "public:airport-data:queenstown-flights-v2", accessMethod: "OFFICIAL_PUBLIC_JSON",
    concurrencyLimit: 1, dailyBudget: 96, collectorVersion: "queenstown-airport-fetch-v1", parserVersion: "queenstown-airport-canonical-market-v2",
  }, [QUEENSTOWN_AIRPORT_ARRIVALS_URL, QUEENSTOWN_AIRPORT_DEPARTURES_URL], collectQueenstownAirport, () => [], normaliseQueenstownAirport),
  wellington_airport: new OfficialEndpointAdapter({
    sourceId: "wellington_airport", sourceName: "Wellington Airport flights", sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.wellingtonairport.co.nz"], adapterKey: "public:wellington-airport:flight-board-html-v1", accessMethod: "OFFICIAL_PUBLIC_HTML",
    concurrencyLimit: 1, dailyBudget: 96, collectorVersion: "wellington-airport-flight-board-v1", parserVersion: "wellington-airport-flight-board-html-v1",
  }, [WELLINGTON_AIRPORT_FLIGHTS_URL], collectWellingtonAirport, () => [], normaliseWellingtonAirport),
  port_and_cruise: new OfficialEndpointAdapter({
    sourceId: "port_and_cruise", sourceName: "Port of Auckland cruise schedule", sourceType: "PUBLIC_DATA",
    supportedDomains: ["poal.co.nz"], adapterKey: "public:port-and-cruise:poal-csv-v1", accessMethod: "OFFICIAL_PUBLIC_CSV",
    concurrencyLimit: 1, dailyBudget: 24, collectorVersion: "poal-cruise-fetch-v1", parserVersion: "poal-cruise-csv-v1",
  }, [POAL_CRUISE_CSV_URL], collectPoalCruises, () => [], normalisePoalCruises),
};

function baseEvent(input: {
  sourceId: string;
  externalId: string;
  sourceEventId: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  sourceUrl: string;
  venueName: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  startsAt: Date;
  endsAt: Date;
  ticketStatus: string | null;
  sourceUpdatedAt?: Date | null;
  impactEvidence?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}): PublicEvent {
  return {
    sourceId: input.sourceId,
    externalId: input.externalId,
    title: input.title,
    category: input.category,
    subcategory: input.subcategory,
    sourceUrl: input.sourceUrl,
    venueName: input.venueName,
    address: input.address,
    city: input.city,
    region: input.region,
    territorialAuthority: null,
    postcode: input.postcode,
    countryCode: "NZ",
    latitude: input.latitude,
    longitude: input.longitude,
    timezone: "Pacific/Auckland",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: "SCHEDULED",
    ticketStatus: input.ticketStatus,
    impactStatus: "PENDING_EVIDENCE",
    impactScore: null,
    impactConfidence: null,
    impactEvidence: input.impactEvidence ?? { reason: "CAPACITY_OR_ATTENDANCE_EVIDENCE_REQUIRED" },
    sourceUpdatedAt: input.sourceUpdatedAt ?? null,
    metadata: { ...input.metadata, sourceEventId: input.sourceEventId },
    fixture: false,
  };
}

function rawRecords(sourceId: string, entries: RawEntry[], requestCount: number): PublicRawRecord[] {
  const fetchedAt = new Date();
  return entries.map((entry, index) => ({ sourceId, externalId: entry.externalId, payload: entry.payload, fetchedAt, fixture: false, networkRequestCount: index === 0 ? requestCount : 0 }));
}

async function fetchJson(url: string, context: AdapterContext, sourceName: string): Promise<unknown> {
  const text = await fetchText(url, context, sourceName, "application/json");
  try { return JSON.parse(text); }
  catch { throw new AdapterError("PARSING_ERROR", `${sourceName} returned invalid JSON`, false); }
}

async function fetchText(url: string, context: AdapterContext, sourceName: string, accept: string): Promise<string> {
  const response = await fetch(url, { headers: { accept, "user-agent": "TymraDataCollector/1.0" }, signal: context.signal });
  if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `${sourceName} returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
  return readBoundedText(response, context.collectionLimits?.maxBytes ?? 10_000_000);
}

async function endpointHealth(url: string, sourceName: string, context: AdapterContext): Promise<AdapterHealth> {
  const started = Date.now();
  try {
    const response = await fetch(url, { headers: { accept: "*/*", "user-agent": "TymraDataCollector/1.0" }, signal: context.signal ?? AbortSignal.timeout(10_000) });
    await response.body?.cancel();
    return { status: response.ok ? "HEALTHY" : response.status === 429 ? "DEGRADED" : "DOWN", checkedAt: new Date(), message: `${sourceName} returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
  } catch (error) {
    return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : `${sourceName} health check failed`, latencyMs: Date.now() - started, mode: context.mode };
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new AdapterError("PARSING_ERROR", `Source response exceeds ${maxBytes} bytes`, false);
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AdapterError("PARSING_ERROR", `Source response exceeds ${maxBytes} bytes`, false);
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(output);
}

function christchurchEventOverlaps(event: JsonRecord, context: AdapterContext) {
  const sessions = arrayRecords(event.event_sessions);
  if (sessions.some((session) => {
    const start = parseUtcNaive(stringValue(session.start_date));
    const end = parseUtcNaive(stringValue(session.end_date)) ?? start;
    return start && overlaps(start, end ?? start, context);
  })) return true;
  const start = parseIsoDateTime(stringValue(event.earliest_start_date)) ?? parseIsoDateTime(stringValue(event.start_date));
  return start ? overlaps(start, start, context) : false;
}

function christchurchEventUrl(item: JsonRecord, data: JsonRecord) {
  const direct = safeHttpsUrl(stringValue(data.URLValue));
  if (direct) return direct;
  const eventfindaSlug = stringValue(data.url_slug);
  if (eventfindaSlug) return `https://www.eventfinda.co.nz/${eventfindaSlug.replace(/^\/+/, "")}`;
  return "https://www.christchurchnz.com/visit/whats-on";
}

function rtoTicketStatus(data: JsonRecord) {
  if (booleanValue(data.BookingRequired) || isRecord(data.booking_web_site)) return "AVAILABLE_OR_UNKNOWN";
  return /free/i.test(stringValue(data.PriceType)) ? "FREE" : null;
}

function aucklandLiveTicketStatus(performance: JsonRecord) {
  const value = `${stringValue(performance.ticketmaster_availability)} ${stringValue(performance.buy_now_text)} ${stringValue(performance.buy_now_disabled_text)}`.toLowerCase();
  if (/sold out|none/.test(value)) return "SOLD_OUT";
  if (/available|limited|buy/.test(value) || safeHttpsUrl(stringValue(performance.buy_now_url))) return "ONSALE";
  return null;
}

function parseOurAucklandDateRange(value: string): { startsOn: string; endsOn: string } | null {
  const parts = value.split(/\s+-\s+/);
  const start = parseLongDate(parts[0] ?? "");
  const end = parseLongDate(parts[1] ?? parts[0] ?? "");
  return start && end ? { startsOn: isoDate(start), endsOn: isoDate(end) } : null;
}

function parseLongDate(value: string) {
  const match = cleanText(value).match(/^(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/);
  if (!match) return null;
  const monthName = match[2]!.toLowerCase();
  const month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].findIndex((candidate) => candidate.startsWith(monthName.slice(0, 3)));
  if (month < 0) return null;
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePortDate(value: string) {
  const match = cleanText(value).match(/^(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const date = parseLongDate(`${match[1]} ${match[2]} ${match[3]}`);
  return date ? parseNzDateTime(`${isoDate(date)}T${match[4]}:${match[5]}:00`) : null;
}

function parseCoordinates(value: unknown): { longitude: number; latitude: number } | null {
  if (isRecord(value)) {
    const latitude = finiteNumber(value.lat);
    const longitude = finiteNumber(value.lng);
    return latitude !== null && longitude !== null ? { latitude, longitude } : null;
  }
  if (typeof value !== "string") return null;
  try {
    const coordinates = JSON.parse(value.trim()) as unknown;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    const longitude = finiteNumber(coordinates[0]);
    const latitude = finiteNumber(coordinates[1]);
    return latitude !== null && longitude !== null ? { latitude, longitude } : null;
  } catch { return null; }
}

function parseUtcNaive(value: string) {
  if (!value) return null;
  return parseIsoDateTime(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`);
}

function parseIsoDateTime(value: string) {
  if (!value || /^-?0{3,4}-/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseNzDateTime(value: string) {
  if (!value) return null;
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return parseIsoDateTime(value);
  const match = value.match(/^(20\d{2})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const naive = Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!, parts[3]!, parts[4]!, parts[5] ?? 0);
  let instant = new Date(naive);
  for (let index = 0; index < 2; index += 1) instant = new Date(naive - timeZoneOffsetMs(instant, "Pacific/Auckland"));
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function timeZoneOffsetMs(value: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-NZ", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - value.getTime();
}

function nzDate(value: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function overlaps(startsAt: Date, endsAt: Date, context: AdapterContext) {
  const from = context.collectionRange?.from.getTime() ?? Number.NEGATIVE_INFINITY;
  const to = context.collectionRange?.to.getTime() ?? Number.POSITIVE_INFINITY;
  return endsAt.getTime() >= from && startsAt.getTime() <= to;
}

function maxRecords(context: AdapterContext) { return context.collectionLimits?.maxRecords ?? 5_000; }
function maxRequests(context: AdapterContext, defaultValue: number) { return context.collectionLimits?.maxRequests ?? defaultValue; }

function isNzInPersonLocation(location: JsonRecord) {
  const country = stringValue(location.country).toUpperCase();
  return country === "NZ" || Boolean(stringValue(location.city) && stringValue(location.displayName));
}

function joinAddress(location: JsonRecord) {
  const value = [location.address1, location.address2, location.city, location.region, location.postCode].map(stringValue).filter(Boolean).join(", ");
  return value || null;
}

function urlParameter(value: string, name: string) {
  try { return new URL(value).searchParams.get(name); }
  catch { return null; }
}

function isAllowedHttpsUrl(value: string, domains: string[]) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && domains.includes(url.hostname.toLowerCase());
  } catch { return false; }
}

function safeHttpsUrl(value: string) {
  if (!value) return null;
  try { return new URL(value).protocol === "https:" ? value : null; }
  catch { return null; }
}

function jsonRecord(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function arrayRecords(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : []; }
function stringValue(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function nullableString(value: unknown): string | null { const output = stringValue(value); return output || null; }
function finiteNumber(value: unknown): number | null { const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN; return Number.isFinite(number) ? number : null; }
function booleanValue(value: unknown): boolean { return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true"; }
function positiveInteger(value: unknown): number | null { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
function firstString(values: unknown[]): string | null { for (const value of values) { const output = nullableString(value); if (output) return output; } return null; }
function stableEventOrder(left: JsonRecord, right: JsonRecord, dateKey: string, identityKey: string) { return stringValue(left[dateKey]).localeCompare(stringValue(right[dateKey])) || stringValue(left[identityKey]).localeCompare(stringValue(right[identityKey])); }
function cleanText(value: string) { return value.replace(/\s+/g, " ").trim(); }
function slug(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
