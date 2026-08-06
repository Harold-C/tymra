import { createHash } from "node:crypto";

import { parseHTML } from "linkedom";

import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicDiscoveryRequest, PublicEvent, PublicRawRecord, PublicSignal } from "./adapter-types";
import { AdapterError } from "./adapter-types";

const WELLINGTON_EVENTS_URL = "https://www.wellingtonnz.com/visit/events";
const WAIKATO_EVENTS_URL = "https://www.waikatonz.com/api/events?regions=&categories=&dateFrom=&dateTo=&sort=&source=1562&currentPage=1&pageSize=100";
const QUEENSTOWN_EVENTS_URL = "https://www.queenstownnz.co.nz/things-to-do/events/event-calendar/?view=list";
const TAUPO_EVENTS_URL = "https://www.lovetaupo.com/ajax-event/4629";
const SOUTHLAND_EVENTS_URL = "https://southlandnz.com/events/?return=1";
const HAWKES_BAY_EVENTS_URL = "https://www.hawkesbaynz.com/events/whats-on?eventdate=0&eventlocation=0&genre=0";
const TARANAKI_EVENTS_URL = "https://listings.venture.org.nz/api";
const NELSON_TASMAN_EVENTS_URL = "https://www.nelsontasman.nz/explore/events/";
const TAURANGA_EVENTS_URL = "https://www.whatsontauranga.co.nz/";
const MANAWATU_EVENTS_URL = "https://manawatunz.co.nz/events/";
const NORTHLAND_EVENTS_URL = "https://www.wdc.govt.nz/Events/Whats-On";
const ROTORUA_EVENTS_URL = "https://www.rotoruanz.com/whats-on";

type RegionalEvent = {
  externalId: string;
  title: string;
  sourceUrl: string;
  venueName: string | null;
  city: string | null;
  region: string;
  startsAt: Date;
  endsAt: Date;
  metadata: Record<string, unknown>;
};

class WellingtonNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("wellingtonnz_events", "WellingtonNZ official events", ["www.wellingtonnz.com"], "OFFICIAL_PUBLIC_HTML", "wellingtonnz-html-v1");

  async discover(): Promise<string[]> { return [WELLINGTON_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const response = await sourceFetch(reference, context, "text/html,application/xhtml+xml");
    const parsed = parseWellingtonNzEvents(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), response.url);
    if (!parsed.length) throw new AdapterError("PARSING_ERROR", "WellingtonNZ page contains no supported official events", false);
    const events = parsed.filter((event) => overlaps(event, context)).slice(0, context.collectionLimits?.maxRecords ?? 500);
    return events.map((event, index) => rawRecord(this.metadata.sourceId, event, index === 0 ? 1 : 0));
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(WELLINGTON_EVENTS_URL, this.metadata.sourceName, context); }
}

class WaikatoNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("waikatonz_events", "Hamilton & Waikato Tourism official events", ["www.waikatonz.com"], "OFFICIAL_PUBLIC_JSON_PAGINATED", "waikatonz-api-v1");

  async discover(): Promise<string[]> { return [WAIKATO_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const maxRequests = Math.max(1, context.collectionLimits?.maxRequests ?? 3);
    const maxRecords = context.collectionLimits?.maxRecords ?? 500;
    const events = new Map<string, RegionalEvent>();
    let parsedAny = false;
    let requests = 0;
    for (let page = 1; page <= maxRequests && events.size < maxRecords; page += 1) {
      const url = new URL(reference);
      url.searchParams.set("currentPage", String(page));
      url.searchParams.set("pageSize", String(Math.min(100, maxRecords)));
      const response = await sourceFetch(url.href, context, "application/json");
      requests += 1;
      const parsed = parseWaikatoNzEvents(JSON.parse(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000)), response.url);
      parsedAny ||= parsed.events.length > 0;
      const before = events.size;
      for (const event of parsed.events) if (overlaps(event, context)) events.set(event.externalId, event);
      if (page >= parsed.totalPages || events.size === before) break;
    }
    if (!parsedAny) throw new AdapterError("PARSING_ERROR", "WaikatoNZ API contains no supported official events", false);
    return [...events.values()].slice(0, maxRecords).map((event, index) => ({ ...rawRecord(this.metadata.sourceId, event, index === 0 ? requests : 0), networkRequestsAvoided: index === 0 ? Math.max(0, maxRequests - requests) : 0 }));
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(WAIKATO_EVENTS_URL, this.metadata.sourceName, context); }
}

class QueenstownNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("queenstownnz_events", "Destination Queenstown official events", ["www.queenstownnz.co.nz"], "OFFICIAL_PUBLIC_JSON_DISCOVERED", "queenstownnz-simpleview-v1");

  async discover(): Promise<string[]> { return [QUEENSTOWN_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const maxRequests = Math.max(2, context.collectionLimits?.maxRequests ?? 3);
    const maxRecords = context.collectionLimits?.maxRecords ?? 500;
    const landing = await sourceFetch(reference, context, "text/html,application/xhtml+xml");
    const html = await boundedText(landing, context.collectionLimits?.maxBytes ?? 5_000_000);
    const token = html.match(/"apiToken"\s*:\s*"([a-f0-9]{32})"/i)?.[1] ?? html.match(/\\"apiToken\\"\s*:\s*\\"([a-f0-9]{32})\\"/i)?.[1];
    if (!token) throw new AdapterError("PARSING_ERROR", "QueenstownNZ page has no public event API token", false);
    const events = new Map<string, RegionalEvent>();
    let parsedAny = false;
    let requests = 1;
    for (let page = 0; page < maxRequests - 1 && events.size < maxRecords; page += 1) {
      const options = { limit: Math.min(100, maxRecords), skip: page * Math.min(100, maxRecords), sort: { date: 1, rank: 1, title_sort: 1 } };
      const url = new URL("/includes/rest_v2/plugins_events_events_by_date/find/", landing.url);
      url.searchParams.set("token", token);
      url.searchParams.set("json", JSON.stringify({ filter: { active: true }, options }));
      const response = await sourceFetch(url.href, context, "application/json");
      requests += 1;
      const pageEvents = parseQueenstownNzEvents(JSON.parse(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000)), landing.url);
      parsedAny ||= pageEvents.length > 0;
      const before = events.size;
      for (const event of pageEvents) if (overlaps(event, context)) events.set(event.externalId, event);
      if (pageEvents.length < options.limit || events.size === before) break;
    }
    if (!parsedAny) throw new AdapterError("PARSING_ERROR", "QueenstownNZ API contains no supported official events", false);
    return [...events.values()].slice(0, maxRecords).map((event, index) => ({ ...rawRecord(this.metadata.sourceId, event, index === 0 ? requests : 0), networkRequestsAvoided: index === 0 ? Math.max(0, maxRequests - requests) : 0 }));
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(QUEENSTOWN_EVENTS_URL, this.metadata.sourceName, context); }
}

class TaupoNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("tauponz_events", "Destination Great Lake Taupō official events", ["www.lovetaupo.com"], "OFFICIAL_PUBLIC_HTML_PAGINATED", "tauponz-ajax-html-v1");
  async discover(): Promise<string[]> { return [TAUPO_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const maxRequests = Math.max(1, context.collectionLimits?.maxRequests ?? 3);
    const maxRecords = context.collectionLimits?.maxRecords ?? 500;
    const events = new Map<string, RegionalEvent>();
    let parsedAny = false;
    let requests = 0;
    for (let page = 1; page <= maxRequests && events.size < maxRecords; page += 1) {
      const url = new URL(reference);
      if (page > 1) url.searchParams.set("page", String(page));
      const response = await sourceFetch(url.href, context, "text/html,application/xhtml+xml");
      requests += 1;
      const parsed = parseTaupoNzEvents(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), response.url, context.collectionRange?.from ?? new Date());
      parsedAny ||= parsed.events.length > 0;
      const before = events.size;
      for (const event of parsed.events) if (overlaps(event, context)) events.set(event.externalId, event);
      if (page >= parsed.totalPages || events.size === before) break;
    }
    if (!parsedAny) throw new AdapterError("PARSING_ERROR", "Love Taupō calendar contains no supported official events", false);
    return [...events.values()].slice(0, maxRecords).map((event, index) => ({ ...rawRecord(this.metadata.sourceId, event, index === 0 ? requests : 0), networkRequestsAvoided: index === 0 ? Math.max(0, maxRequests - requests) : 0 }));
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(TAUPO_EVENTS_URL, this.metadata.sourceName, context); }
}

class SouthlandNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("southlandnz_events", "Great South official events", ["southlandnz.com"], "OFFICIAL_PUBLIC_JSON_DISCOVERED", "southlandnz-simpleview-v1");
  async discover(): Promise<string[]> { return [SOUTHLAND_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const maxRequests = Math.max(2, context.collectionLimits?.maxRequests ?? 3);
    const maxRecords = context.collectionLimits?.maxRecords ?? 500;
    const tokenResponse = await sourceFetch(new URL("/plugins/core/get_simple_token/", reference).href, context, "text/plain");
    const token = (await boundedText(tokenResponse, 1_000)).trim();
    if (!/^[a-f0-9]{32}$/i.test(token)) throw new AdapterError("PARSING_ERROR", "Great South page returned an invalid public API token", false);
    const events = new Map<string, RegionalEvent>();
    let parsedAny = false;
    let requests = 1;
    for (let page = 0; page < maxRequests - 1 && events.size < maxRecords; page += 1) {
      const limit = Math.min(100, maxRecords);
      const url = new URL("/includes/rest_v2/plugins_events_events_by_date/find/", reference);
      url.searchParams.set("token", token);
      url.searchParams.set("json", JSON.stringify({ filter: { active: true }, options: { limit, skip: page * limit, sort: { date: 1, rank: 1, title_sort: 1 } } }));
      const response = await sourceFetch(url.href, context, "application/json");
      requests += 1;
      const pageEvents = parseSouthlandNzEvents(JSON.parse(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000)), reference);
      parsedAny ||= pageEvents.length > 0;
      const before = events.size;
      for (const event of pageEvents) if (overlaps(event, context)) events.set(event.externalId, event);
      if (pageEvents.length < limit || events.size === before) break;
    }
    if (!parsedAny) throw new AdapterError("PARSING_ERROR", "Great South API contains no supported official events", false);
    return [...events.values()].slice(0, maxRecords).map((event, index) => ({ ...rawRecord(this.metadata.sourceId, event, index === 0 ? requests : 0), networkRequestsAvoided: index === 0 ? Math.max(0, maxRequests - requests) : 0 }));
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(SOUTHLAND_EVENTS_URL, this.metadata.sourceName, context); }
}

class HawkesBayNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("hawkesbaynz_events", "Hawke's Bay Tourism official events", ["www.hawkesbaynz.com"], "OFFICIAL_PUBLIC_HTML", "hawkesbaynz-epoch-html-v1");
  async discover(): Promise<string[]> { return [HAWKES_BAY_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const response = await sourceFetch(reference, context, "text/html,application/xhtml+xml");
    const parsed = parseHawkesBayNzEvents(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), response.url);
    if (!parsed.length) throw new AdapterError("PARSING_ERROR", "Hawke's Bay Tourism calendar contains no supported official events", false);
    const events = parsed.filter((event) => overlaps(event, context)).slice(0, context.collectionLimits?.maxRecords ?? 500);
    return events.map((event, index) => rawRecord(this.metadata.sourceId, event, index === 0 ? 1 : 0));
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(HAWKES_BAY_EVENTS_URL, this.metadata.sourceName, context); }
}

class TaranakiNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("taranakienz_events", "Venture Taranaki official events", ["listings.venture.org.nz"], "OFFICIAL_PUBLIC_GRAPHQL", "taranaki-graphql-v1");
  async discover(): Promise<string[]> { return [TARANAKI_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const maxRequests = Math.max(1, context.collectionLimits?.maxRequests ?? 3);
    const maxRecords = context.collectionLimits?.maxRecords ?? 500;
    const events = new Map<string, RegionalEvent>();
    let parsedAny = false;
    let requests = 0;
    for (let page = 0; page < maxRequests && events.size < maxRecords; page += 1) {
      const limit = Math.min(100, maxRecords);
      const response = await fetch(reference, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }, body: JSON.stringify({ query: TARANAKI_EVENT_QUERY, variables: { listingType: "Events", categories: ["8192122"], tags: ["11776031"], limit, offset: page * limit } }), signal: context.signal ?? AbortSignal.timeout(context.collectionLimits?.timeoutMs ?? 30_000) });
      requests += 1;
      if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `Venture Taranaki GraphQL returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
      const parsed = parseTaranakiNzEvents(JSON.parse(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000)));
      parsedAny ||= parsed.events.length > 0;
      const before = events.size;
      for (const event of parsed.events) if (overlaps(event, context)) events.set(event.externalId, event);
      if (!parsed.hasNextPage || events.size === before) break;
    }
    if (!parsedAny) throw new AdapterError("PARSING_ERROR", "Venture Taranaki GraphQL contains no supported official events", false);
    return [...events.values()].slice(0, maxRecords).map((event, index) => ({ ...rawRecord(this.metadata.sourceId, event, index === 0 ? requests : 0), networkRequestsAvoided: index === 0 ? Math.max(0, maxRequests - requests) : 0 }));
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth("https://www.taranaki.co.nz/visit/whats-on", this.metadata.sourceName, context); }
}

class NelsonTasmanNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("nelsontasman_events", "Nelson Regional Development Agency official events", ["www.nelsontasman.nz"], "OFFICIAL_PUBLIC_HTML", "nelsontasman-featured-html-v1");
  async discover(): Promise<string[]> { return [NELSON_TASMAN_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const response = await sourceFetch(reference, context, "text/html,application/xhtml+xml");
    const parsed = parseNelsonTasmanNzEvents(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), response.url, new Date());
    if (!parsed.length) throw new AdapterError("PARSING_ERROR", "Nelson Tasman official calendar contains no supported featured events", false);
    const events = parsed.filter((event) => overlaps(event, context)).slice(0, context.collectionLimits?.maxRecords ?? 500);
    return events.map((event, index) => rawRecord(this.metadata.sourceId, event, index === 0 ? 1 : 0));
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(NELSON_TASMAN_EVENTS_URL, this.metadata.sourceName, context); }
}

class TaurangaNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("tauranga_events", "Tauranga City Council What's On events", ["www.whatsontauranga.co.nz"], "OFFICIAL_PUBLIC_HTML", "tauranga-carousel-html-v1");
  async discover(): Promise<string[]> { return [TAURANGA_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> { assertHost(reference, this.metadata.supportedDomains); const response = await sourceFetch(reference, context, "text/html,application/xhtml+xml"); const parsed = parseTaurangaNzEvents(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), response.url); if (!parsed.length) throw new AdapterError("PARSING_ERROR", "What's On Tauranga contains no supported official events", false); const events = parsed.filter((event) => overlaps(event, context)).slice(0, context.collectionLimits?.maxRecords ?? 500); return events.map((event, index) => rawRecord(this.metadata.sourceId, event, index === 0 ? 1 : 0)); }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(TAURANGA_EVENTS_URL, this.metadata.sourceName, context); }
}

class ManawatuNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("manawatunz_events", "Central Economic Development Agency official events", ["manawatunz.co.nz"], "OFFICIAL_PUBLIC_HTML_PAGINATED", "manawatu-wordpress-html-v1");
  async discover(): Promise<string[]> { return [MANAWATU_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains); const maxRequests = Math.max(1, context.collectionLimits?.maxRequests ?? 3); const maxRecords = context.collectionLimits?.maxRecords ?? 500; const events = new Map<string, RegionalEvent>(); let requests = 0; let parsedAny = false;
    for (let page = 1; page <= maxRequests && events.size < maxRecords; page += 1) { const url = page === 1 ? reference : new URL(`/explore/events/page/${page}/`, reference).href; const response = await sourceFetch(url, context, "text/html,application/xhtml+xml"); requests += 1; const parsed = parseManawatuNzEvents(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), response.url); parsedAny ||= parsed.events.length > 0; const before = events.size; for (const event of parsed.events) if (overlaps(event, context)) events.set(event.externalId, event); if (page >= parsed.totalPages || events.size === before) break; }
    if (!parsedAny) throw new AdapterError("PARSING_ERROR", "Manawatū official calendar contains no supported events", false); return [...events.values()].slice(0, maxRecords).map((event, index) => ({ ...rawRecord(this.metadata.sourceId, event, index === 0 ? requests : 0), networkRequestsAvoided: index === 0 ? Math.max(0, maxRequests - requests) : 0 }));
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(MANAWATU_EVENTS_URL, this.metadata.sourceName, context); }
}

class NorthlandNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("northland_events", "Whangārei District Council official events", ["www.wdc.govt.nz"], "OFFICIAL_PUBLIC_HTML", "whangarei-opencities-html-v1");

  async discover(): Promise<string[]> { return [NORTHLAND_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const response = await sourceFetch(reference, context, "text/html,application/xhtml+xml");
    const parsed = parseNorthlandNzEvents(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), response.url);
    if (!parsed.length) throw new AdapterError("PARSING_ERROR", "Whangārei District Council calendar contains no supported current events", false);
    const events = parsed.filter((event) => overlaps(event, context)).slice(0, context.collectionLimits?.maxRecords ?? 500);
    return events.map((event, index) => rawRecord(this.metadata.sourceId, event, index === 0 ? 1 : 0));
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(NORTHLAND_EVENTS_URL, this.metadata.sourceName, context); }
}

class RotoruaNzEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata("rotoruanz_events", "RotoruaNZ official events", ["www.rotoruanz.com"], "OFFICIAL_PUBLIC_HTML", "rotoruanz-simple-tile-html-v1");

  async discover(): Promise<string[]> { return [ROTORUA_EVENTS_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertHost(reference, this.metadata.supportedDomains);
    const response = await sourceFetch(reference, context, "text/html,application/xhtml+xml");
    const parsed = parseRotoruaNzEvents(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), response.url, context.collectionRange?.from ?? new Date());
    if (!parsed.length) throw new AdapterError("PARSING_ERROR", "RotoruaNZ What's On page contains no supported official events", false);
    const events = parsed.filter((event) => overlaps(event, context)).slice(0, context.collectionLimits?.maxRecords ?? 500);
    return events.map((event, index) => rawRecord(this.metadata.sourceId, event, index === 0 ? 1 : 0));
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap(regionalPublicEvent); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return endpointHealth(ROTORUA_EVENTS_URL, this.metadata.sourceName, context); }
}

const TARANAKI_EVENT_QUERY = `query TymraTaranakiEvents($listingType:String,$categories:[ID],$tags:[ID],$limit:Int,$offset:Int){listings(listingType:$listingType,categories:$categories,tags:$tags,limit:$limit,offset:$offset){edges{node{UUID Title URLSegment FullAddress CurrentStartDate MainCategory{Title}}}pageInfo{hasNextPage totalCount}}}`;

export function parseWellingtonNzEvents(html: string, finalUrl = WELLINGTON_EVENTS_URL): RegionalEvent[] {
  const { document } = parseHTML(html);
  const seen = new Set<string>();
  return [...document.querySelectorAll("a.featured-item--event")].flatMap((card) => {
    const title = clean(card.querySelector(".featured-item__title")?.textContent);
    const dateText = clean(card.querySelector(".featured-item__text--date")?.textContent);
    const href = card.getAttribute("href");
    const range = parseRegionalDateRange(dateText);
    if (!title || !href || !range) return [];
    const sourceUrl = new URL(href, finalUrl).href;
    const externalId = `wellingtonnz:${card.getAttribute("data-id") ?? hash(sourceUrl)}`;
    if (seen.has(externalId)) return [];
    seen.add(externalId);
    return [{ externalId, title, sourceUrl, venueName: clean(card.querySelector(".featured-item__text--info")?.textContent) || null, city: "Wellington", region: "Wellington", ...range, metadata: { publisher: "WellingtonNZ", dateText, extractionVersion: "wellingtonnz-featured-html-v1" } }];
  });
}

export function parseWaikatoNzEvents(payload: unknown, finalUrl = WAIKATO_EVENTS_URL): { events: RegionalEvent[]; totalPages: number; totalResults: number } {
  if (!isRecord(payload) || typeof payload.results !== "string") throw new AdapterError("PARSING_ERROR", "WaikatoNZ API response has no results JSON", false);
  let values: unknown;
  try { values = JSON.parse(payload.results); } catch { throw new AdapterError("PARSING_ERROR", "WaikatoNZ results JSON is malformed", false); }
  if (!Array.isArray(values)) throw new AdapterError("PARSING_ERROR", "WaikatoNZ results are not an array", false);
  const events = values.flatMap((value): RegionalEvent[] => {
    if (!isRecord(value)) return [];
    const title = stringValue(value.Name);
    const href = stringValue(value.Url);
    const dateText = stringValue(value.DateSummary);
    const range = parseRegionalDateRange(dateText);
    if (!title || !href || !range) return [];
    const regionName = stringValue(value.Regions);
    const sourceUrl = new URL(href, finalUrl).href;
    return [{ externalId: `waikatonz:${String(value.Id ?? hash(sourceUrl))}`, title, sourceUrl, venueName: null, city: regionName, region: "Waikato", ...range, metadata: { publisher: "Hamilton & Waikato Tourism", regionName, dateText, featured: value.Featured === true, extractionVersion: "waikatonz-api-listing-v1" } }];
  });
  return { events, totalPages: positiveInteger(payload.totalPages) ?? 1, totalResults: positiveInteger(payload.totalResults) ?? events.length };
}

export function parseQueenstownNzEvents(payload: unknown, finalUrl = QUEENSTOWN_EVENTS_URL): RegionalEvent[] {
  if (!isRecord(payload) || !Array.isArray(payload.docs)) throw new AdapterError("PARSING_ERROR", "QueenstownNZ API response has no docs array", false);
  return payload.docs.flatMap((value): RegionalEvent[] => {
    if (!isRecord(value)) return [];
    const title = stringValue(value.title);
    const start = isoDate(value.startDate) ?? isoDate(value.date);
    const end = isoDate(value.endDate) ?? start;
    const href = stringValue(value.url) ?? stringValue(value.absoluteUrl);
    if (!title || !start || !end || !href) return [];
    const sourceUrl = new URL(href, finalUrl).href;
    const location = stringValue(value.location);
    return [{ externalId: `queenstownnz:${String(value.recid ?? value.recId ?? hash(sourceUrl))}`, title, sourceUrl, venueName: location, city: location && /wanaka|wānaka/i.test(location) ? "Wānaka" : "Queenstown", region: "Otago", startsAt: start, endsAt: end >= start ? end : start, metadata: { publisher: "Destination Queenstown", categories: value.categories ?? null, occurrences: value.occurrences ?? null, updated: value.updated ?? null, extractionVersion: "queenstownnz-simpleview-api-v1" } }];
  });
}

export function parseTaupoNzEvents(html: string, finalUrl = TAUPO_EVENTS_URL, yearReference = new Date()): { events: RegionalEvent[]; totalPages: number } {
  const { document } = parseHTML(html);
  const currentParts = zonedDateParts(yearReference);
  const events = [...document.querySelectorAll("a.o-event-tile")].flatMap((card): RegionalEvent[] => {
    const title = clean(card.querySelector(".o-event-tile__heading")?.textContent);
    const dateText = clean(card.querySelector(".o-event-tile__date")?.textContent);
    const href = card.getAttribute("href");
    const range = parseUpcomingMonthDayRange(dateText, currentParts.year, currentParts.month);
    if (!title || !href || !range) return [];
    const sourceUrl = new URL(href, finalUrl).href;
    return [{ externalId: `tauponz:${href.split("/").filter(Boolean).pop() ?? hash(sourceUrl)}`, title, sourceUrl, venueName: null, city: "Taupō", region: "Waikato", ...range, metadata: { publisher: "Destination Great Lake Taupō", category: clean(card.querySelector(".o-event-tile__tag")?.textContent) || null, dateText, extractionVersion: "tauponz-ajax-html-v1" } }];
  });
  const pageNumbers = [...document.querySelectorAll(".js-pagination-link")].map((element) => Number(new URL(element.getAttribute("href") ?? "", finalUrl).searchParams.get("page"))).filter(Number.isFinite);
  return { events, totalPages: Math.max(1, ...pageNumbers) };
}

export function parseSouthlandNzEvents(payload: unknown, finalUrl = SOUTHLAND_EVENTS_URL): RegionalEvent[] {
  if (!isRecord(payload)) throw new AdapterError("PARSING_ERROR", "Great South API response is invalid", false);
  const docs = Array.isArray(payload.docs) ? payload.docs : isRecord(payload.docs) && Array.isArray(payload.docs.docs) ? payload.docs.docs : null;
  if (!docs) throw new AdapterError("PARSING_ERROR", "Great South API response has no docs array", false);
  return parseSimpleviewEvents(docs, finalUrl, "southlandnz", "Great South", "Southland", "Invercargill");
}

export function parseHawkesBayNzEvents(html: string, finalUrl = HAWKES_BAY_EVENTS_URL): RegionalEvent[] {
  const { document } = parseHTML(html);
  return [...document.querySelectorAll(".eventItem")].flatMap((card): RegionalEvent[] => {
    const anchor = card.querySelector("a.card");
    const title = clean(anchor?.querySelector(".info h3")?.textContent);
    const href = anchor?.getAttribute("href");
    const startSeconds = Number(card.getAttribute("data-dateStart"));
    const endSeconds = Number(card.getAttribute("data-dateEnd"));
    if (!title || !href || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) return [];
    const sourceUrl = new URL(href, finalUrl).href;
    const location = clean(card.getAttribute("data-location")) || null;
    const startsAt = new Date(startSeconds * 1_000);
    const endsAt = new Date(endSeconds * 1_000);
    return [{ externalId: `hawkesbaynz:${anchor?.getAttribute("data-item") ?? hash(sourceUrl)}`, title, sourceUrl, venueName: null, city: location, region: "Hawke's Bay", startsAt, endsAt: endsAt >= startsAt ? endsAt : startsAt, metadata: { publisher: "Hawke's Bay Tourism", category: clean(card.getAttribute("data-category")) || null, displayedDate: clean(anchor?.querySelector(".info h5")?.textContent) || null, extractionVersion: "hawkesbaynz-epoch-html-v1" } }];
  });
}

export function parseTaranakiNzEvents(payload: unknown): { events: RegionalEvent[]; hasNextPage: boolean; totalCount: number } {
  const listings = isRecord(payload) && isRecord(payload.data) && isRecord(payload.data.listings) ? payload.data.listings : null;
  if (!listings || !Array.isArray(listings.edges)) throw new AdapterError("PARSING_ERROR", "Venture Taranaki GraphQL response has no listing edges", false);
  const events = listings.edges.flatMap((edge): RegionalEvent[] => {
    const value = isRecord(edge) && isRecord(edge.node) ? edge.node : null;
    if (!value) return [];
    const id = stringValue(value.UUID);
    const title = stringValue(value.Title);
    const slug = stringValue(value.URLSegment);
    const startsAt = parseNzLocalDateTime(stringValue(value.CurrentStartDate));
    if (!id || !title || !slug || !startsAt) return [];
    return [{ externalId: `taranakienz:${id}`, title, sourceUrl: `https://www.taranaki.co.nz/visit/whats-on/${slug}`, venueName: null, city: "New Plymouth", region: "Taranaki", startsAt, endsAt: new Date(startsAt.getTime() + 4 * 3_600_000), metadata: { publisher: "Venture Taranaki", address: stringValue(value.FullAddress), category: isRecord(value.MainCategory) ? stringValue(value.MainCategory.Title) : null, extractionVersion: "taranaki-listings-graphql-v1" } }];
  });
  const pageInfo = isRecord(listings.pageInfo) ? listings.pageInfo : {};
  return { events, hasNextPage: pageInfo.hasNextPage === true, totalCount: positiveInteger(pageInfo.totalCount) ?? events.length };
}

export function parseNelsonTasmanNzEvents(html: string, finalUrl = NELSON_TASMAN_EVENTS_URL, observedAt = new Date()): RegionalEvent[] {
  const { document } = parseHTML(html);
  const seen = new Set<string>();
  return [...document.querySelectorAll(".ElementalEvents a[href^='/events/']")].flatMap((anchor): RegionalEvent[] => {
    const href = anchor.getAttribute("href");
    const title = clean(anchor.textContent);
    const card = anchor.closest(".group");
    const dateText = clean(card?.querySelector(".me-2.flex.items-start.gap-2")?.textContent);
    const range = parseNelsonDisplayRange(dateText, observedAt);
    if (!href || !title || !range) return [];
    const sourceUrl = new URL(href, finalUrl).href;
    const externalId = `nelsontasman:${href.split("/").filter(Boolean).pop() ?? hash(sourceUrl)}`;
    if (seen.has(externalId)) return [];
    seen.add(externalId);
    const detailBlocks = card ? [...card.querySelectorAll(".flex.items-start.gap-2")].map((element) => clean(element.textContent)).filter(Boolean) : [];
    const venueName = detailBlocks.find((value) => value !== dateText) ?? null;
    return [{ externalId, title, sourceUrl, venueName, city: venueName?.match(/,\s*(Nelson|Richmond|Motueka|Murchison|Takaka|Tākaka)\b/i)?.[1] ?? "Nelson", region: "Nelson/Tasman", ...range, metadata: { publisher: "Nelson Regional Development Agency", dateText, featured: true, extractionVersion: "nelsontasman-featured-html-v1" } }];
  });
}

export function parseTaurangaNzEvents(html: string, finalUrl = TAURANGA_EVENTS_URL): RegionalEvent[] {
  const { document } = parseHTML(html); const seen = new Set<string>();
  return [...document.querySelectorAll(".event-search-results-box-carousel")].flatMap((card): RegionalEvent[] => { const anchor = card.querySelector("a.event-search-results-box-clickable"); const href = anchor?.getAttribute("href"); const title = clean(card.querySelector(".event-search-results-box-title")?.textContent); const details = [...card.querySelectorAll(".event-search-results-box-details p")].map((element) => clean(element.textContent)).filter(Boolean); const dateText = details[0] ?? ""; const range = parseRegionalDateRange(dateText); if (!href || !title || !range) return []; const sourceUrl = new URL(href, finalUrl).href; const externalId = `tauranga:${new URL(sourceUrl).searchParams.get("event") ?? hash(sourceUrl)}`; if (seen.has(externalId)) return []; seen.add(externalId); return [{ externalId, title, sourceUrl, venueName: details[1] ?? null, city: /mount maunganui|mt maunganui/i.test(details[1] ?? "") ? "Mount Maunganui" : "Tauranga", region: "Bay of Plenty", ...range, metadata: { publisher: "Tauranga City Council", dateText, extractionVersion: "tauranga-carousel-html-v1" } }]; });
}

export function parseManawatuNzEvents(html: string, finalUrl = MANAWATU_EVENTS_URL): { events: RegionalEvent[]; totalPages: number } {
  const { document } = parseHTML(html);
  const events = [...document.querySelectorAll(".event-block")].flatMap((card): RegionalEvent[] => { const anchor = card.querySelector("a[href*='/events/']"); const href = anchor?.getAttribute("href"); const title = clean(card.querySelector(".event--title")?.textContent); const dateText = clean(card.querySelector("[id^='text_block-548-']")?.textContent); const venueName = clean(card.querySelector("[id^='text_block-566-']")?.textContent) || null; const range = parseRegionalDateRange(dateText); if (!href || !title || !range) return []; const sourceUrl = new URL(href, finalUrl).href; return [{ externalId: `manawatunz:${new URL(sourceUrl).pathname.split("/").filter(Boolean).pop() ?? hash(sourceUrl)}`, title, sourceUrl, venueName, city: /levin|horowhenua/i.test(venueName ?? "") ? "Levin" : "Palmerston North", region: "Manawatū-Whanganui", ...range, metadata: { publisher: "Central Economic Development Agency", dateText, extractionVersion: "manawatu-wordpress-html-v1" } }]; });
  const pages = [...document.querySelectorAll("a.page-numbers")].map((anchor) => Number(anchor.textContent.trim())).filter(Number.isFinite); return { events, totalPages: Math.max(1, ...pages) };
}

export function parseNorthlandNzEvents(html: string, finalUrl = NORTHLAND_EVENTS_URL): RegionalEvent[] {
  const { document } = parseHTML(html);
  return [...document.querySelectorAll(".events-list-container .list-item-container")].flatMap((card): RegionalEvent[] => {
    const anchor = card.querySelector("article > a");
    const href = anchor?.getAttribute("href");
    const title = clean(card.querySelector(".list-item-title")?.textContent);
    const day = Number(clean(card.querySelector(".part-date")?.textContent));
    const month = monthNumber(clean(card.querySelector(".part-month")?.textContent));
    const year = Number(clean(card.querySelector(".part-year")?.textContent));
    if (!href || !title || !Number.isInteger(day) || !month || !Number.isInteger(year)) return [];
    const sourceUrl = new URL(href, finalUrl).href;
    const range = dateRange(year, month, day, year, month, day);
    if (!range) return [];
    const address = clean(card.querySelector(".list-item-address")?.textContent) || null;
    return [{
      externalId: `northland:${new URL(sourceUrl).pathname.split("/").filter(Boolean).pop() ?? hash(sourceUrl)}`,
      title,
      sourceUrl,
      venueName: address?.split(",")[0]?.trim() || null,
      city: "Whangārei",
      region: "Northland",
      ...range,
      metadata: {
        publisher: "Whangārei District Council",
        address,
        additionalDates: clean(card.querySelector(".published-on")?.textContent) || null,
        categories: clean(card.querySelector(".tagged-as-list .text")?.textContent) || null,
        extractionVersion: "whangarei-opencities-html-v1",
      },
    }];
  });
}

export function parseRotoruaNzEvents(html: string, finalUrl = ROTORUA_EVENTS_URL, yearReference = new Date()): RegionalEvent[] {
  const { document } = parseHTML(html);
  const currentParts = zonedDateParts(yearReference);
  return [...document.querySelectorAll(".simple-tile")].flatMap((tile): RegionalEvent[] => {
    const body = tile.querySelector(".simple-tile__body");
    const title = clean(body?.querySelector("h4")?.textContent);
    const paragraphs = [...(body?.querySelectorAll("p") ?? [])].map((paragraph) => clean(paragraph.textContent)).filter(Boolean);
    const dateText = paragraphs[0] ?? "";
    const normalizedDate = dateText.replace(/\s*\([^)]*\)\s*$/u, "").trim();
    const range = parseRegionalDateRange(normalizedDate) ?? parseUpcomingMonthDayRange(normalizedDate, currentParts.year, currentParts.month);
    if (!title || !range) return [];
    const href = body?.querySelector("a[href]")?.getAttribute("href");
    const sourceUrl = href ? new URL(href, finalUrl).href : finalUrl;
    const venueName = paragraphs[1] && !/^more info$/iu.test(paragraphs[1]) ? paragraphs[1] : null;
    const description = paragraphs.slice(2).filter((value) => !/^more info$/iu.test(value)).join(" ") || null;
    return [{
      externalId: `rotoruanz:${hash(`${title}:${dateText}:${sourceUrl}`)}`,
      title,
      sourceUrl,
      venueName,
      city: "Rotorua",
      region: "Bay of Plenty",
      ...range,
      metadata: { publisher: "RotoruaNZ", listingUrl: finalUrl, dateText, description, extractionVersion: "rotoruanz-simple-tile-html-v1" },
    }];
  });
}

export const regionalMarketAdapters: Record<string, PublicDataAdapter> = {
  wellingtonnz_events: new WellingtonNzEventsAdapter(),
  waikatonz_events: new WaikatoNzEventsAdapter(),
  queenstownnz_events: new QueenstownNzEventsAdapter(),
  tauponz_events: new TaupoNzEventsAdapter(),
  southlandnz_events: new SouthlandNzEventsAdapter(),
  hawkesbaynz_events: new HawkesBayNzEventsAdapter(),
  taranakienz_events: new TaranakiNzEventsAdapter(),
  nelsontasman_events: new NelsonTasmanNzEventsAdapter(),
  tauranga_events: new TaurangaNzEventsAdapter(),
  manawatunz_events: new ManawatuNzEventsAdapter(),
  northland_events: new NorthlandNzEventsAdapter(),
  rotoruanz_events: new RotoruaNzEventsAdapter(),
};

function regionalPublicEvent(record: PublicRawRecord): PublicEvent[] {
  if (!isRecord(record.payload) || record.payload.kind !== "regional_event" || !isRegionalEvent(record.payload.event)) return [];
  const event = record.payload.event;
  return [{ sourceId: record.sourceId, externalId: event.externalId, title: event.title, category: "Event", subcategory: null, sourceUrl: event.sourceUrl, venueName: event.venueName, address: null, city: event.city, region: event.region, territorialAuthority: null, postcode: null, countryCode: "NZ", latitude: null, longitude: null, timezone: "Pacific/Auckland", timePrecision: "DATE", startsAt: event.startsAt, endsAt: event.endsAt, status: "SCHEDULED", ticketStatus: null, impactStatus: "PENDING_EVIDENCE", impactScore: null, impactConfidence: null, impactEvidence: { reason: "VENUE_CAPACITY_OR_ATTENDANCE_REQUIRED" }, sourceUpdatedAt: null, metadata: event.metadata, fixture: false }];
}

function parseRegionalDateRange(value: string | null): { startsAt: Date; endsAt: Date } | null {
  if (!value) return null;
  const normalized = value.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const range = normalized.match(/^(\d{1,2})(?:\s+([A-Za-z]+))?\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/);
  const single = normalized.match(/^(?:[A-Za-z]{3,9}\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/);
  if (range) {
    const endYear = Number(range[5]);
    const endMonth = monthNumber(range[4]!);
    const startMonth = monthNumber(range[2] ?? range[4]!);
    if (!startMonth || !endMonth) return null;
    const startYear = startMonth > endMonth ? endYear - 1 : endYear;
    return dateRange(startYear, startMonth, Number(range[1]), endYear, endMonth, Number(range[3]));
  }
  if (!single) return null;
  const month = monthNumber(single[2]!);
  return month ? dateRange(Number(single[3]), month, Number(single[1]), Number(single[3]), month, Number(single[1])) : null;
}

function dateRange(startYear: number, startMonth: number, startDay: number, endYear: number, endMonth: number, endDay: number) {
  const startsAt = nzLocalDate(startYear, startMonth, startDay);
  const endsAt = new Date(nzLocalDate(endYear, endMonth, endDay + 1).getTime() - 1);
  return Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) ? null : { startsAt, endsAt };
}

function parseUpcomingMonthDayRange(value: string, currentYear: number, currentMonth: number) {
  const normalized = value.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const range = normalized.match(/^(\d{1,2})(?:\s+([A-Za-z]+))?\s*-\s*(\d{1,2})\s+([A-Za-z]+)$/);
  const single = normalized.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (!range && !single) return null;
  const startDay = Number(range?.[1] ?? single?.[1]);
  const endDay = Number(range?.[3] ?? single?.[1]);
  const startMonth = monthNumber(range?.[2] ?? range?.[4] ?? single?.[2] ?? "");
  const endMonth = monthNumber(range?.[4] ?? single?.[2] ?? "");
  if (!startMonth || !endMonth) return null;
  const startYear = startMonth < currentMonth - 4 ? currentYear + 1 : currentYear;
  const endYear = endMonth < startMonth ? startYear + 1 : startYear;
  return dateRange(startYear, startMonth, startDay, endYear, endMonth, endDay);
}

function parseSimpleviewEvents(docs: unknown[], finalUrl: string, prefix: string, publisher: string, region: string, defaultCity: string): RegionalEvent[] {
  return docs.flatMap((value): RegionalEvent[] => {
    if (!isRecord(value)) return [];
    const title = stringValue(value.title);
    const start = isoDate(value.startDate) ?? isoDate(value.date);
    const end = isoDate(value.endDate) ?? start;
    const href = stringValue(value.url) ?? stringValue(value.absoluteUrl);
    if (!title || !start || !end || !href) return [];
    const sourceUrl = new URL(href, finalUrl).href;
    const location = stringValue(value.location);
    return [{ externalId: `${prefix}:${String(value.recid ?? value.recId ?? hash(sourceUrl))}`, title, sourceUrl, venueName: location, city: defaultCity, region, startsAt: start, endsAt: end >= start ? end : start, metadata: { publisher, categories: value.categories ?? null, occurrences: value.occurrences ?? null, updated: value.updated ?? null, extractionVersion: `${prefix}-simpleview-api-v1` } }];
  });
}

function nzLocalDate(year: number, month: number, day: number) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day));
  return new Date(utcGuess.getTime() - timezoneOffsetMs(utcGuess, "Pacific/Auckland"));
}

function timezoneOffsetMs(date: Date, timeZone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - date.getTime();
}
function zonedDateParts(date: Date) { const values = Object.fromEntries(new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", year: "numeric", month: "numeric" }).formatToParts(date).map((part) => [part.type, part.value])); return { year: Number(values.year), month: Number(values.month) }; }

function metadata(sourceId: string, sourceName: string, supportedDomains: string[], accessMethod: string, parserVersion: string): AdapterMetadata { return { sourceId, sourceName, sourceType: "PUBLIC_DATA", supportedDomains, adapterKey: `public:${sourceId}:${parserVersion}`, accessMethod, concurrencyLimit: 1, dailyBudget: 24, collectorVersion: `${sourceId}-http-v1`, parserVersion }; }
function rawRecord(sourceId: string, event: RegionalEvent, networkRequestCount: number): PublicRawRecord { return { sourceId, externalId: event.externalId, payload: { kind: "regional_event", event }, fetchedAt: new Date(), fixture: false, networkRequestCount }; }
function overlaps(event: RegionalEvent, context: AdapterContext) { const range = context.collectionRange; return !range || (event.endsAt >= range.from && event.startsAt <= range.to); }
function isRegionalEvent(value: unknown): value is RegionalEvent { return isRecord(value) && typeof value.externalId === "string" && value.startsAt instanceof Date && value.endsAt instanceof Date; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function clean(value: string | null | undefined) { return value?.replace(/\s+/g, " ").trim() ?? ""; }
function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function positiveInteger(value: unknown) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : null; }
function isoDate(value: unknown) { const text = stringValue(value); if (!text) return null; const date = new Date(text); return Number.isNaN(date.getTime()) ? null : date; }
function parseNzLocalDateTime(value: string | null) { const match = value?.match(/^(20\d{2})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/); if (!match) return null; const guess = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0))); return new Date(guess.getTime() - timezoneOffsetMs(guess, "Pacific/Auckland")); }
function parseNelsonDisplayRange(value: string, observedAt: Date) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const relative = normalized.match(/^Tomorrow\s+(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (relative) { const parts = zonedFullDateParts(new Date(observedAt.getTime() + 86_400_000)); return localTimedRange(parts.year, parts.month, parts.day, relative); }
  const exact = normalized.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\s+(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!exact) return null;
  const month = monthNumber(exact[2]!);
  return month ? localTimedRange(Number(exact[3]), month, Number(exact[1]), [exact[0], exact[4], exact[5], exact[6], exact[7], exact[8], exact[9]]) : null;
}
function localTimedRange(year: number, month: number, day: number, match: RegExpMatchArray | string[]) { const startHour = twelveHour(Number(match[1]), String(match[3])); const endHour = twelveHour(Number(match[4]), String(match[6])); const startGuess = new Date(Date.UTC(year, month - 1, day, startHour, Number(match[2]))); const endGuess = new Date(Date.UTC(year, month - 1, day + (endHour * 60 + Number(match[5]) < startHour * 60 + Number(match[2]) ? 1 : 0), endHour, Number(match[5]))); return { startsAt: new Date(startGuess.getTime() - timezoneOffsetMs(startGuess, "Pacific/Auckland")), endsAt: new Date(endGuess.getTime() - timezoneOffsetMs(endGuess, "Pacific/Auckland")) }; }
function twelveHour(hour: number, marker: string) { return hour % 12 + (/pm/i.test(marker) ? 12 : 0); }
function zonedFullDateParts(date: Date) { const values = Object.fromEntries(new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date).map((part) => [part.type, part.value])); return { year: Number(values.year), month: Number(values.month), day: Number(values.day) }; }
function monthNumber(value: string) { const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(value.trim().slice(0, 3).toLowerCase()) + 1; return month > 0 ? month : null; }
function hash(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 16); }
function assertHost(value: string, allowed: string[]) { let url: URL; try { url = new URL(value); } catch { throw new AdapterError("INVALID_INPUT", "Source reference is not a URL", false); } if (url.protocol !== "https:" || !allowed.includes(url.hostname.toLowerCase())) throw new AdapterError("INVALID_INPUT", `Unsupported source host ${url.hostname}`, false); }
async function sourceFetch(reference: string, context: AdapterContext, accept: string) { const response = await fetch(reference, { headers: { accept, "accept-language": "en-NZ,en;q=0.9", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }, signal: context.signal ?? AbortSignal.timeout(context.collectionLimits?.timeoutMs ?? 30_000) }); if (!response.ok) throw new AdapterError(response.status === 429 ? "RATE_LIMITED" : "SOURCE_UNAVAILABLE", `Official regional source returned HTTP ${response.status}`, response.status === 429 || response.status >= 500); return response; }
async function boundedText(response: Response, maxBytes: number) { const length = Number(response.headers.get("content-length") ?? 0); if (length > maxBytes) throw new AdapterError("PARSING_ERROR", "Source response exceeded the configured byte limit", false); const text = await response.text(); if (Buffer.byteLength(text) > maxBytes) throw new AdapterError("PARSING_ERROR", "Source response exceeded the configured byte limit", false); return text; }
async function endpointHealth(url: string, name: string, context: AdapterContext): Promise<AdapterHealth> { const started = Date.now(); try { const response = await fetch(url, { headers: { accept: "text/html,application/json", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }, signal: context.signal ?? AbortSignal.timeout(10_000) }); return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `${name} returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode }; } catch (error) { return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : `${name} health check failed`, latencyMs: Date.now() - started, mode: context.mode }; } }
