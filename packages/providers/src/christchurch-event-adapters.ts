import { parseHTML } from "linkedom";
import { nzDateKey, nzDateTime as newZealandDateTime } from "@tymra/domain";

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

const TE_PAE_URL = "https://www.tepae.co.nz/whats-on";
const VENUES_OTAUTAHI_URL = "https://venuesotautahi.co.nz/whats-on";
const VENUES_OTAUTAHI_API_URL = "https://api.storyblok.com/v2/cdn/stories";
const ISAAC_THEATRE_ROYAL_URL = "https://isaactheatreroyal.co.nz/whats-on-isaac-theatre-royal";

type ChristchurchEventRecord = {
  id: string;
  seriesId: string;
  title: string;
  sourceUrl: string;
  startsAt: string;
  endsAt: string;
  venueName: string | null;
  address: string | null;
  category: string | null;
  ticketStatus: string | null;
  description: string | null;
  imageUrl: string | null;
  advertisedDate: string | null;
  metadata: Record<string, unknown>;
};

type HtmlParser = (html: string) => ChristchurchEventRecord[];

class ChristchurchHtmlEventAdapter implements PublicDataAdapter {
  constructor(
    readonly metadata: AdapterMetadata,
    private readonly reference: string,
    private readonly parser: HtmlParser,
    private readonly venueLabel: string,
  ) {}

  async discover(_request: PublicDiscoveryRequest): Promise<string[]> { return [this.reference]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertAllowedUrl(reference, this.metadata.supportedDomains);
    const records = this.parser(await fetchText(reference, context, this.metadata.sourceName))
      .filter((event) => overlaps(new Date(event.startsAt), new Date(event.endsAt), context))
      .slice(0, maxRecords(context));
    return rawRecords(this.metadata.sourceId, records, 1, this.venueLabel);
  }

  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[], context: AdapterContext): Promise<PublicEvent[]> {
    return normaliseRecords(records, context);
  }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    return endpointHealth(this.reference, this.metadata.sourceName, context);
  }
}

class VenuesOtautahiAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "venues_otautahi_events",
    sourceName: "Venues Otautahi events",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["venuesotautahi.co.nz", "api.storyblok.com"],
    adapterKey: "public:venues-otautahi:storyblok-v1",
    accessMethod: "PUBLIC_HTML_DISCOVERED_JSON",
    concurrencyLimit: 1,
    dailyBudget: 48,
    collectorVersion: "venues-otautahi-storyblok-fetch-v1",
    parserVersion: "venues-otautahi-storyblok-json-v1",
  };

  async discover(): Promise<string[]> { return [VENUES_OTAUTAHI_URL]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertAllowedUrl(reference, ["venuesotautahi.co.nz"]);
    const indexHtml = await fetchText(reference, context, this.metadata.sourceName);
    const token = parseVenuesOtautahiToken(indexHtml);
    if (!token) throw new AdapterError("PARSING_ERROR", "Venues Otautahi page has no public event-feed token", false);

    const requestLimit = maxRequests(context, 3);
    const entries: ChristchurchEventRecord[] = [];
    let page = 1;
    let requestCount = 1;
    let total = Number.POSITIVE_INFINITY;
    while (requestCount < requestLimit && entries.length < Math.min(total, maxRecords(context))) {
      const url = venuesOtautahiApiUrl(token, page, context);
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "TymraDataCollector/1.0" },
        signal: context.signal,
      });
      if (!response.ok) throw sourceUnavailable(this.metadata.sourceName, response.status);
      const payload = JSON.parse(await readBoundedText(response, maxBytes(context))) as unknown;
      requestCount += 1;
      const parsed = parseVenuesOtautahiStories(payload);
      total = positiveInteger(response.headers.get("total")) ?? parsed.length;
      for (const event of parsed) {
        if (overlaps(new Date(event.startsAt), new Date(event.endsAt), context)) entries.push(event);
        if (entries.length >= maxRecords(context)) break;
      }
      if (parsed.length < 100 || page * 100 >= total) break;
      page += 1;
    }
    return rawRecords(this.metadata.sourceId, entries, requestCount, "Venues Otautahi");
  }

  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[], context: AdapterContext): Promise<PublicEvent[]> {
    return normaliseRecords(records, context);
  }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    return endpointHealth(VENUES_OTAUTAHI_URL, this.metadata.sourceName, context);
  }
}

export function parseTePaeEvents(html: string): ChristchurchEventRecord[] {
  const { document } = parseHTML(html);
  return [...document.querySelectorAll(".event-block")].flatMap((card) => {
    const title = cleanText(card.querySelector(".content-block .h6")?.textContent ?? "");
    const advertisedDate = cleanText(card.querySelector(".content-block .p3")?.textContent ?? "");
    const range = parseAdvertisedDateRange(advertisedDate);
    if (!title || !range) return [];
    const href = card.querySelector("a.link-overlay[href]")?.getAttribute("href") ?? "";
    const sourceUrl = safeHttpsUrl(href) ?? TE_PAE_URL;
    const imageUrl = safeHttpsUrl(card.querySelector("img[src]")?.getAttribute("src") ?? "");
    return [{
      id: `te-pae:${slug(title)}:${range.startsOn}`,
      seriesId: `te-pae:${slug(title)}`,
      title,
      sourceUrl,
      startsAt: nzDateTime(range.startsOn, "00:00:00").toISOString(),
      endsAt: nzDateTime(range.endsOn, "23:59:59").toISOString(),
      venueName: "Te Pae Christchurch Convention Centre",
      address: "188 Oxford Terrace, Christchurch Central City, Christchurch 8011",
      category: "Conference, meeting or exhibition",
      ticketStatus: null,
      description: null,
      imageUrl,
      advertisedDate,
      metadata: { timePrecision: "DATE", extractionVersion: "te-pae-listing-html-v1" },
    }];
  });
}

export function parseIsaacTheatreRoyalEvents(html: string): ChristchurchEventRecord[] {
  const { document } = parseHTML(html);
  return [...document.querySelectorAll(".custom-visual-card")].flatMap((card) => {
    const title = cleanText(card.querySelector(".custom-visual-card__title")?.textContent ?? "");
    const start = dateFromEpochAttribute(card.getAttribute("data-start-date"));
    const end = dateFromEpochAttribute(card.getAttribute("data-end-date")) ?? start;
    if (!title || !start || !end) return [];
    const link = card.querySelector("a[href]")?.getAttribute("href") ?? "";
    const sourceUrl = safeHttpsUrl(link) ?? ISAAC_THEATRE_ROYAL_URL;
    const advertisedDate = cleanText(card.querySelector(".custom-visual-card__upcoming-date")?.textContent ?? "") || null;
    return [{
      id: `isaac-theatre-royal:${slug(title)}:${isoDate(start)}`,
      seriesId: `isaac-theatre-royal:${slug(title)}`,
      title,
      sourceUrl,
      startsAt: nzDateTime(isoDate(start), "00:00:00").toISOString(),
      endsAt: nzDateTime(isoDate(end), "23:59:59").toISOString(),
      venueName: "Isaac Theatre Royal",
      address: "145 Gloucester Street, Christchurch Central City, Christchurch 8011",
      category: nullableText(card.getAttribute("data-category")),
      ticketStatus: null,
      description: nullableText(card.querySelector(".custom-visual-card__description")?.textContent),
      imageUrl: safeHttpsUrl(card.querySelector("img[src]")?.getAttribute("src") ?? ""),
      advertisedDate,
      metadata: {
        location: nullableText(card.getAttribute("data-location")),
        timePrecision: "DATE",
        extractionVersion: "isaac-theatre-royal-listing-html-v1",
      },
    }];
  });
}

export function parseVenuesOtautahiToken(html: string): string | null {
  const { document } = parseHTML(html);
  const props = [...document.querySelectorAll("astro-island")]
    .find((island) => island.getAttribute("component-url")?.includes("EventIndexClient"))
    ?.getAttribute("props") ?? "";
  return props.match(/"token":\[0,"([A-Za-z0-9_-]+)"\]/)?.[1] ?? null;
}

export function parseVenuesOtautahiStories(payload: unknown): ChristchurchEventRecord[] {
  if (!isRecord(payload) || !Array.isArray(payload.stories)) throw new AdapterError("PARSING_ERROR", "Venues Otautahi event feed has no stories array", false);
  return payload.stories.filter(isRecord).flatMap((story) => {
    const content = recordValue(story.content);
    const title = stringValue(content.title) || stringValue(story.name);
    const startsAt = parseNzSourceDate(stringValue(content.event_start_date));
    const parsedEnd = parseNzSourceDate(stringValue(content.event_end_date));
    const endsAt = parsedEnd && startsAt && parsedEnd >= startsAt ? parsedEnd : startsAt;
    if (!title || !startsAt || !endsAt) return [];
    const slugValue = stringValue(story.full_slug).replace(/^\/+/, "");
    const venue = venueForStoryblokLocation(content.event_location);
    const status = stringValue(content.status);
    return [{
      id: `venues-otautahi:${stringValue(story.uuid) || stringValue(story.id)}:${startsAt.toISOString()}`,
      seriesId: `venues-otautahi:${stringValue(story.uuid) || stringValue(story.id)}`,
      title,
      sourceUrl: slugValue ? `https://venuesotautahi.co.nz/${slugValue}` : VENUES_OTAUTAHI_URL,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      venueName: venue?.name ?? null,
      address: venue?.address ?? null,
      category: nullableText(content.category),
      ticketStatus: /sold out/i.test(status) ? "SOLD_OUT" : status ? "AVAILABLE_OR_UNKNOWN" : null,
      description: richTextValue(content.event_description),
      imageUrl: safeHttpsUrl(stringValue(recordValue(content.tile_image).filename)),
      advertisedDate: null,
      metadata: {
        status: status || null,
        ticketsUrl: safeHttpsUrl(stringValue(recordValue(content.tickets_url).url)),
        eventLocation: content.event_location ?? null,
        sourceUpdatedAt: nullableText(story.published_at) ?? nullableText(story.updated_at),
        extractionVersion: "venues-otautahi-storyblok-json-v1",
      },
    }];
  });
}

export const christchurchEventAdapters: Record<string, PublicDataAdapter> = {
  te_pae_events: new ChristchurchHtmlEventAdapter({
    sourceId: "te_pae_events", sourceName: "Te Pae Christchurch events", sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.tepae.co.nz"], adapterKey: "public:te-pae-events:html-v1", accessMethod: "OFFICIAL_PUBLIC_HTML",
    concurrencyLimit: 1, dailyBudget: 24, collectorVersion: "te-pae-events-fetch-v1", parserVersion: "te-pae-events-html-v1",
  }, TE_PAE_URL, parseTePaeEvents, "Te Pae Christchurch"),
  venues_otautahi_events: new VenuesOtautahiAdapter(),
  isaac_theatre_royal_events: new ChristchurchHtmlEventAdapter({
    sourceId: "isaac_theatre_royal_events", sourceName: "Isaac Theatre Royal events", sourceType: "PUBLIC_DATA",
    supportedDomains: ["isaactheatreroyal.co.nz"], adapterKey: "public:isaac-theatre-royal-events:html-v1", accessMethod: "OFFICIAL_PUBLIC_HTML",
    concurrencyLimit: 1, dailyBudget: 48, collectorVersion: "isaac-theatre-royal-events-fetch-v1", parserVersion: "isaac-theatre-royal-events-html-v1",
  }, ISAAC_THEATRE_ROYAL_URL, parseIsaacTheatreRoyalEvents, "Isaac Theatre Royal"),
};

function normaliseRecords(records: PublicRawRecord[], context: AdapterContext): PublicEvent[] {
  return records.flatMap((record): PublicEvent[] => {
    const event = recordValue(recordValue(record.payload).event);
    const startsAt = new Date(stringValue(event.startsAt));
    const endsAt = new Date(stringValue(event.endsAt));
    if (!stringValue(event.title) || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || !overlaps(startsAt, endsAt, context)) return [];
    return [{
      sourceId: record.sourceId,
      externalId: record.externalId,
      title: stringValue(event.title),
      category: nullableText(event.category),
      subcategory: null,
      sourceUrl: stringValue(event.sourceUrl),
      venueName: nullableText(event.venueName),
      address: nullableText(event.address),
      city: "Christchurch",
      region: "Canterbury",
      territorialAuthority: "Christchurch City",
      postcode: postcodeFromAddress(stringValue(event.address)),
      countryCode: "NZ",
      latitude: null,
      longitude: null,
      timezone: "Pacific/Auckland",
      startsAt,
      endsAt,
      status: "SCHEDULED",
      ticketStatus: nullableText(event.ticketStatus),
      impactStatus: "PENDING_EVIDENCE",
      impactScore: null,
      impactConfidence: null,
      impactEvidence: { reason: "CAPACITY_OR_ATTENDANCE_EVIDENCE_REQUIRED" },
      sourceUpdatedAt: parseOptionalDate(recordValue(event.metadata).sourceUpdatedAt),
      metadata: {
        ...recordValue(event.metadata),
        description: nullableText(event.description),
        imageUrl: nullableText(event.imageUrl),
        advertisedDate: nullableText(event.advertisedDate),
        sourceEventId: stringValue(event.seriesId) || record.externalId,
        seriesUrl: stringValue(event.sourceUrl),
      },
      fixture: false,
    }];
  }).slice(0, maxRecords(context));
}

function rawRecords(sourceId: string, events: ChristchurchEventRecord[], requestCount: number, provider: string): PublicRawRecord[] {
  const fetchedAt = new Date();
  return events.map((event, index) => ({
    sourceId,
    externalId: event.id,
    payload: { provider, event },
    fetchedAt,
    fixture: false,
    networkRequestCount: index === 0 ? requestCount : 0,
  }));
}

function venuesOtautahiApiUrl(token: string, page: number, context: AdapterContext) {
  const url = new URL(VENUES_OTAUTAHI_API_URL);
  url.searchParams.set("token", token);
  url.searchParams.set("version", "published");
  url.searchParams.set("content_type", "event");
  url.searchParams.set("sort_by", "content.event_start_date:asc");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  url.searchParams.set("filter_query[event_end_date][gt_date]", storyblokDate(context.collectionRange?.from ?? new Date()));
  if (context.collectionRange?.to) url.searchParams.set("filter_query[event_start_date][lt_date]", storyblokDate(context.collectionRange.to));
  return url.href;
}

function venueForStoryblokLocation(value: unknown): { name: string; address: string } | null {
  const first = Array.isArray(value) ? value[0] : value;
  const uuid = typeof first === "string" ? first : stringValue(recordValue(first).uuid);
  return ({
    "e3979aea-e7d0-4f4d-b890-4436b7995e48": { name: "One NZ Stadium", address: "95 Jack Hinton Drive, Addington, Christchurch 8024" },
    "7cfee769-a9e3-464f-883c-af60ccd09d55": { name: "Christchurch Town Hall", address: "86 Kilmore Street, Christchurch Central City, Christchurch 8013" },
    "1de453b2-a5c9-4af8-a115-fcbdab3a2fa8": { name: "Hagley Oval", address: "63 Riccarton Avenue, Hagley Park, Christchurch 8011" },
    "1b0da827-6ca2-4710-b80d-83537f675651": { name: "Air Force Museum of New Zealand", address: "45 Harvard Avenue, Wigram, Christchurch 8042" },
    "90a80bee-1c39-495f-8199-4ba69e95ea38": { name: "Wolfbrook Arena", address: "55 Jack Hinton Drive, Addington, Christchurch 8024" },
  } as Record<string, { name: string; address: string }>)[uuid] ?? null;
}

function parseAdvertisedDateRange(value: string): { startsOn: string; endsOn: string } | null {
  const parts = value.split(/\s+-\s+/);
  const start = parseLongDate(parts[0] ?? "");
  const end = parseLongDate(parts[1] ?? parts[0] ?? "");
  return start && end ? { startsOn: isoDate(start), endsOn: isoDate(end) } : null;
}

function parseLongDate(value: string): Date | null {
  const match = cleanText(value).match(/^(?:[A-Za-z]{3}\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/);
  if (!match) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(match[2]!.slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNzSourceDate(value: string): Date | null {
  const match = value.match(/^(20\d{2})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  return match ? nzDateTime(`${match[1]}-${match[2]}-${match[3]}`, `${match[4]}:${match[5]}:${match[6] ?? "00"}`) : null;
}

function nzDateTime(date: string, time: string): Date {
  return newZealandDateTime(`${date}T${time}`);
}

function richTextValue(value: unknown): string | null {
  const texts: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!isRecord(node)) return;
    if (typeof node.text === "string") texts.push(node.text);
    for (const child of Object.values(node)) visit(child);
  };
  visit(value);
  return nullableText(texts.join(" "));
}

async function fetchText(url: string, context: AdapterContext, sourceName: string) {
  const response = await fetch(url, { headers: { accept: "text/html", "user-agent": "TymraDataCollector/1.0" }, signal: context.signal });
  if (!response.ok) throw sourceUnavailable(sourceName, response.status);
  return readBoundedText(response, maxBytes(context));
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

async function readBoundedText(response: Response, limit: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new AdapterError("PARSING_ERROR", `Source response exceeds ${limit} bytes`, false);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > limit) throw new AdapterError("PARSING_ERROR", `Source response exceeds ${limit} bytes`, false);
  return text;
}

function sourceUnavailable(sourceName: string, status: number) {
  return new AdapterError("SOURCE_UNAVAILABLE", `${sourceName} returned HTTP ${status}`, status === 429 || status >= 500);
}

function assertAllowedUrl(value: string, hosts: string[]) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && hosts.includes(url.hostname.toLowerCase())) return;
  } catch { /* handled below */ }
  throw new AdapterError("INVALID_INPUT", "Event source reference host is not allowed", false);
}

function overlaps(startsAt: Date, endsAt: Date, context: AdapterContext) {
  return endsAt.getTime() >= (context.collectionRange?.from.getTime() ?? Number.NEGATIVE_INFINITY)
    && startsAt.getTime() <= (context.collectionRange?.to.getTime() ?? Number.POSITIVE_INFINITY);
}
function dateFromEpochAttribute(value: string | null) { const date = new Date(Number(value)); return value && !Number.isNaN(date.getTime()) ? date : null; }
function parseOptionalDate(value: unknown) { const date = new Date(stringValue(value)); return Number.isNaN(date.getTime()) ? null : date; }
function safeHttpsUrl(value: string) { try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; } }
function recordValue(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function stringValue(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function nullableText(value: unknown) { const text = cleanText(stringValue(value)); return text || null; }
function cleanText(value: string) { return value.replace(/\s+/g, " ").trim(); }
function slug(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function isoDate(value: Date) { return nzDateKey(value); }
function postcodeFromAddress(value: string) { return value.match(/\b(\d{4})\b/)?.[1] ?? null; }
function maxRecords(context: AdapterContext) { return context.collectionLimits?.maxRecords ?? 5_000; }
function maxRequests(context: AdapterContext, defaultValue: number) { return context.collectionLimits?.maxRequests ?? defaultValue; }
function maxBytes(context: AdapterContext) { return context.collectionLimits?.maxBytes ?? 10_000_000; }
function positiveInteger(value: unknown) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
function storyblokDate(value: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
