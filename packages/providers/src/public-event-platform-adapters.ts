import { parseHTML } from "linkedom";

import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicDiscoveryRequest, PublicEvent, PublicRawRecord, PublicSignal } from "./adapter-types";
import { AdapterError } from "./adapter-types";

const EVENTBRITE_URL = "https://www.eventbrite.co.nz/d/new-zealand/events/";
const EVENTBRITE_CHRISTCHURCH_URL = "https://www.eventbrite.co.nz/d/new-zealand--christchurch/events/";
const HUMANITIX_URL = "https://humanitix.com/nz/events/new-zealand";
const HUMANITIX_CHRISTCHURCH_URL = "https://humanitix.com/nz/events/nz--canterbury-region--christchurch";
const CHRISTCHURCH_AIRPORT_ORIGIN = "https://www.christchurchairport.co.nz";

type JsonRecord = Record<string, unknown>;

class JsonLdEventPlatformAdapter implements PublicDataAdapter {
  constructor(readonly metadata: AdapterMetadata, private readonly listingUrl: string, private readonly christchurchUrl: string) {}

  async discover(request: PublicDiscoveryRequest): Promise<string[]> {
    return [request.marketScope.toLowerCase().includes("christchurch") ? this.christchurchUrl : this.listingUrl];
  }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const maxRequests = Math.max(1, context.collectionLimits?.maxRequests ?? 3);
    const collected = new Map<string, PublicEvent>();
    let requestCount = 0;
    let finalUrl = reference;
    for (let page = 1; page <= maxRequests; page += 1) {
      const pageUrl = new URL(reference);
      if (page > 1) pageUrl.searchParams.set("page", String(page));
      const response = await fetch(pageUrl, {
        headers: { accept: "text/html,application/xhtml+xml", "accept-language": "en-NZ,en;q=0.9", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" },
        signal: context.signal ?? AbortSignal.timeout(30_000),
      });
      requestCount += 1;
      if (!response.ok) throw responseError(this.metadata.sourceName, response.status);
      finalUrl = response.url;
      const pageEvents = parsePlatformJsonLdEvents(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), response.url, this.metadata.sourceId);
      const before = collected.size;
      for (const event of pageEvents) collected.set(event.externalId, event);
      if (!pageEvents.length || collected.size === before) break;
    }
    const events = [...collected.values()]
      .filter((event) => overlaps(event.startsAt, event.endsAt, context))
      .slice(0, context.collectionLimits?.maxRecords ?? 500);
    if (!events.length) throw new AdapterError("PARSING_ERROR", `${this.metadata.sourceName} listing contains no supported event JSON-LD`, false);
    return events.map((event, index) => ({
      sourceId: this.metadata.sourceId,
      externalId: event.externalId,
      payload: { kind: "event", event, listingUrl: finalUrl },
      fetchedAt: new Date(),
      fixture: false,
      networkRequestCount: index === 0 ? requestCount : 0,
      networkRequestsAvoided: Math.max(0, maxRequests - requestCount),
    }));
  }

  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> {
    return records.flatMap((record) => isRecord(record.payload) && record.payload.kind === "event" && isPublicEvent(record.payload.event) ? [record.payload.event] : []);
  }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(this.listingUrl, this.metadata.sourceName, context); }
}

class ChristchurchAirportAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "christchurch_airport",
    sourceName: "Christchurch Airport flights",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.christchurchairport.co.nz"],
    adapterKey: "public:christchurch-airport:flights-json-v1",
    accessMethod: "PUBLIC_JSON",
    concurrencyLimit: 1,
    dailyBudget: 192,
    collectorVersion: "christchurch-airport-http-v1",
    parserVersion: "christchurch-airport-flight-json-v1",
  };

  async discover(): Promise<string[]> {
    return ["Arrive", "Depart"].flatMap((direction) => ["Domestic", "International"].map((type) => `${CHRISTCHURCH_AIRPORT_ORIGIN}/api/flights?maxFlights=100&flightDirection=${direction}&flightType=${type}`));
  }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const response = await fetch(reference, { headers: { accept: "application/json", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }, signal: context.signal ?? AbortSignal.timeout(15_000) });
    if (!response.ok) throw responseError(this.metadata.sourceName, response.status);
    const payload: unknown = JSON.parse(await boundedText(response, context.collectionLimits?.maxBytes ?? 2_000_000));
    if (!isRecord(payload) || !Array.isArray(payload.flights)) throw new AdapterError("PARSING_ERROR", "Christchurch Airport response has no flights array", false);
    const direction = stringValue(payload.flightDirection) || new URL(reference).searchParams.get("flightDirection") || "Unknown";
    const flightType = stringValue(payload.flightType) || new URL(reference).searchParams.get("flightType") || "Unknown";
    return payload.flights.filter(isRecord).slice(0, context.collectionLimits?.maxRecords ?? 500).flatMap((flight, index) => {
      const numbers = stringArray(flight.flightNumbers);
      const scheduled = stringValue(flight.scheduled);
      if (!numbers.length || !scheduled) return [];
      const startsAt = parseFlightTime(scheduled, new Date());
      if (!startsAt) return [];
      return [{
        sourceId: this.metadata.sourceId,
        externalId: `${direction.toLowerCase()}:${flightType.toLowerCase()}:${numbers[0]}:${startsAt.toISOString()}`,
        payload: { kind: "flight", direction, flightType, lastUpdated: stringValue(payload.lastUpdated), flight, startsAt: startsAt.toISOString(), sourceUrl: reference },
        fetchedAt: new Date(), fixture: false, networkRequestCount: index === 0 ? 1 : 0,
      }];
    });
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((record) => {
      if (!isRecord(record.payload) || record.payload.kind !== "flight" || !isRecord(record.payload.flight)) return [];
      const flight = record.payload.flight;
      const startsAt = new Date(String(record.payload.startsAt));
      if (Number.isNaN(startsAt.getTime())) return [];
      const direction = stringValue(record.payload.direction) ?? "Unknown";
      const status = stringValue(flight.status) ?? "Scheduled";
      const cancelled = /cancel/i.test(status);
      const airports = stringArray(flight.airports);
      const numbers = stringArray(flight.flightNumbers);
      return [{
        sourceId: this.metadata.sourceId,
        externalId: record.externalId,
        marketKey: "christchurch",
        type: "TRANSPORT_FLOW",
        title: `${direction} ${numbers.join("/")} ${airports.join(" / ")}`.trim(),
        region: "Canterbury",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * 3_600_000),
        direction: cancelled ? "NEGATIVE" : direction === "Arrive" ? "POSITIVE" : "MIXED",
        confidence: cancelled ? 0.9 : 0.72,
        evidenceRef: String(record.payload.sourceUrl),
        metadata: { provider: "Christchurch Airport", flightDirection: direction, flightType: record.payload.flightType, status, lastUpdated: record.payload.lastUpdated, flight },
        fixture: false,
      }];
    });
  }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(`${CHRISTCHURCH_AIRPORT_ORIGIN}/api/flights?maxFlights=1&flightDirection=Arrive&flightType=Domestic`, this.metadata.sourceName, context); }
}

export function parsePlatformJsonLdEvents(html: string, finalUrl: string, sourceId: string): PublicEvent[] {
  const { document } = parseHTML(html);
  const values: JsonRecord[] = [];
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    try { flatten(JSON.parse(script.textContent), values); } catch { /* Ignore malformed unrelated blocks. */ }
  }
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (!isSchemaEvent(value)) return [];
    const title = stringValue(value.name);
    const start = parseDate(value.startDate);
    const sourceUrl = safeUrl(stringValue(value.url), finalUrl);
    if (!title || !start || !sourceUrl) return [];
    const location = recordValue(value.location);
    const address = recordValue(location.address);
    const end = parseDate(value.endDate) ?? start;
    const id = schemaEventId(sourceId, sourceUrl, start);
    if (seen.has(id)) return [];
    seen.add(id);
    const statusName = schemaName(value.eventStatus);
    const offers = asArray(value.offers).filter(isRecord);
    return [{
      sourceId, externalId: id, title, category: schemaName(value["@type"]), subcategory: null, sourceUrl,
      venueName: stringValue(location.name),
      address: [stringValue(address.streetAddress), stringValue(address.addressLocality), stringValue(address.postalCode)].filter(Boolean).join(", ") || null,
      city: stringValue(address.addressLocality), region: stringValue(address.addressRegion), territorialAuthority: null,
      postcode: stringValue(address.postalCode), countryCode: "NZ", latitude: numberValue(recordValue(location.geo).latitude), longitude: numberValue(recordValue(location.geo).longitude),
      timezone: "Pacific/Auckland", startsAt: start, endsAt: end >= start ? end : start,
      status: statusName === "EventCancelled" ? "CANCELLED" : statusName === "EventPostponed" ? "POSTPONED" : statusName === "EventRescheduled" ? "RESCHEDULED" : "SCHEDULED",
      ticketStatus: offers.some((offer) => schemaName(offer.availability) === "SoldOut") ? "SOLD_OUT" : offers.length ? "ONSALE" : null,
      impactStatus: "PENDING_EVIDENCE", impactScore: null, impactConfidence: null, impactEvidence: { reason: "VENUE_CAPACITY_OR_ATTENDANCE_REQUIRED" }, sourceUpdatedAt: null,
      metadata: { description: stringValue(value.description), imageUrls: imageUrls(value.image), offers, organizer: value.organizer ?? null, performers: value.performer ?? null, extractionVersion: "platform-jsonld-listing-v1" }, fixture: false,
    } satisfies PublicEvent];
  });
}

export function parseFlightTime(value: string, now: Date): Date | null {
  const match = value.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
  if (!match) return null;
  const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const target = weekdays.indexOf(match[1]!.toLowerCase());
  let hour = Number(match[2]) % 12;
  if (match[4]!.toUpperCase() === "PM") hour += 12;
  const parts = zonedParts(now, "Pacific/Auckland");
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  let days = (target - localDate.getUTCDay() + 7) % 7;
  const minutesNow = parts.hour * 60 + parts.minute;
  const minutesTarget = hour * 60 + Number(match[3]);
  if (days === 0 && minutesTarget < minutesNow - 360) days = 7;
  const localWallClock = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, hour, Number(match[3]), 0, 0));
  return new Date(localWallClock.getTime() - timezoneOffsetMs(localWallClock, "Pacific/Auckland"));
}

export const publicEventPlatformAdapters: Record<string, PublicDataAdapter> = {
  eventbrite_events: new JsonLdEventPlatformAdapter({ sourceId: "eventbrite_events", sourceName: "Eventbrite New Zealand events", sourceType: "PUBLIC_DATA", supportedDomains: ["www.eventbrite.co.nz", "eventbrite.co.nz"], adapterKey: "public:eventbrite:jsonld-listing-v2", accessMethod: "PUBLIC_HTML_JSONLD_PAGINATED", concurrencyLimit: 1, dailyBudget: 24, collectorVersion: "eventbrite-http-v2", parserVersion: "platform-jsonld-listing-v1" }, EVENTBRITE_URL, EVENTBRITE_CHRISTCHURCH_URL),
  humanitix_events: new JsonLdEventPlatformAdapter({ sourceId: "humanitix_events", sourceName: "Humanitix New Zealand events", sourceType: "PUBLIC_DATA", supportedDomains: ["humanitix.com", "events.humanitix.com"], adapterKey: "public:humanitix:jsonld-listing-v2", accessMethod: "PUBLIC_HTML_JSONLD_PAGINATED", concurrencyLimit: 1, dailyBudget: 24, collectorVersion: "humanitix-http-v2", parserVersion: "platform-jsonld-listing-v1" }, HUMANITIX_URL, HUMANITIX_CHRISTCHURCH_URL),
  christchurch_airport: new ChristchurchAirportAdapter(),
};

function flatten(value: unknown, output: JsonRecord[]): void { if (Array.isArray(value)) { value.forEach((item) => flatten(item, output)); return; } if (!isRecord(value)) return; if (value["@type"]) output.push(value); Object.values(value).forEach((item) => { if (typeof item === "object") flatten(item, output); }); }
function isSchemaEvent(value: JsonRecord) { return asArray(value["@type"]).some((item) => { const type = schemaName(item); return type === "Festival" || type === "Hackathon" || type === "CourseInstance" || Boolean(type?.endsWith("Event")); }); }
function schemaEventId(sourceId: string, url: string, start: Date) { const slug = new URL(url).pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() ?? url; return `${sourceId}:${slug}:${start.toISOString()}`; }
function isPublicEvent(value: unknown): value is PublicEvent { return isRecord(value) && typeof value.externalId === "string" && value.startsAt instanceof Date; }
function overlaps(start: Date, end: Date, context: AdapterContext) { const range = context.collectionRange; return !range || (end >= range.from && start <= range.to); }
function parseDate(value: unknown) { const text = stringValue(value); if (!text) return null; const date = new Date(text); return Number.isNaN(date.getTime()) ? null : date; }
function safeUrl(value: string | null, base: string) { try { return new URL(value ?? base, base).href; } catch { return null; } }
function imageUrls(value: unknown) { return asArray(value).flatMap((item) => typeof item === "string" ? [item] : isRecord(item) && typeof item.url === "string" ? [item.url] : []); }
function asArray(value: unknown): unknown[] { return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function recordValue(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []; }
function numberValue(value: unknown) { const number = typeof value === "number" ? value : Number(value); return Number.isFinite(number) ? number : null; }
function schemaName(value: unknown) { const text = stringValue(value); return text?.split(/[\/#]/).pop() ?? null; }
function assertHost(value: string, allowed: string[]) { let url: URL; try { url = new URL(value); } catch { throw new AdapterError("INVALID_INPUT", "Source reference is not a URL", false); } if (url.protocol !== "https:" || !allowed.includes(url.hostname.toLowerCase())) throw new AdapterError("INVALID_INPUT", `Unsupported source host ${url.hostname}`, false); }
function responseError(name: string, status: number) { return new AdapterError(status === 429 ? "RATE_LIMITED" : "SOURCE_UNAVAILABLE", `${name} returned HTTP ${status}`, status === 429 || status >= 500); }
async function boundedText(response: Response, maxBytes: number) { const length = Number(response.headers.get("content-length") ?? 0); if (length > maxBytes) throw new AdapterError("PARSING_ERROR", "Source response exceeded the configured byte limit", false); const text = await response.text(); if (Buffer.byteLength(text) > maxBytes) throw new AdapterError("PARSING_ERROR", "Source response exceeded the configured byte limit", false); return text; }
async function endpointHealth(url: string, name: string, context: AdapterContext): Promise<AdapterHealth> { const started = Date.now(); try { const response = await fetch(url, { method: "GET", headers: { accept: "text/html,application/json", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }, signal: context.signal ?? AbortSignal.timeout(10_000) }); return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `${name} returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode }; } catch (error) { return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : `${name} health check failed`, latencyMs: Date.now() - started, mode: context.mode }; } }
function timezoneOffsetMs(date: Date, timeZone: string) { const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); const asUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)); return asUtc - date.getTime(); }
function zonedParts(date: Date, timeZone: string) { const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value])); return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute) }; }
