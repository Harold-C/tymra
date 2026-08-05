import { parseHTML } from "linkedom";
import { emptyEventImpactEvidence } from "@tymra/domain";

import type {
  AdapterContext,
  AdapterHealth,
  AdapterMetadata,
  PublicDataAdapter,
  PublicDiscoveryRequest,
  PublicEvent,
  PublicRawRecord,
  PublicSignal,
  SourceRights,
} from "./adapter-types";
import { AdapterError } from "./adapter-types";

const CCC_EVENTS_URL = "https://www.ccc.govt.nz/news-and-events/whats-on";
const ARA_CALENDAR_URL = "https://www.ara.ac.nz/about-us/academic-calendar/";
const CANTERBURY_SHOW_URL = "https://www.theshow.co.nz/";
const CHRISTCHURCH_MARATHON_URL = "https://www.christchurchmarathon.co.nz/";

type CccPage = { events: PublicEvent[]; nextUrl: string | null };

class ChristchurchCouncilEventsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata(
    "christchurch_council_events",
    "Christchurch City Council What's On",
    ["www.ccc.govt.nz"],
    "official-html-pagination-v1",
    48,
    "OFFICIAL_PUBLIC_HTML_PAGINATED",
  );

  async discover(_request: PublicDiscoveryRequest): Promise<string[]> { return [CCC_EVENTS_URL]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertAllowed(reference, this.metadata.supportedDomains);
    const requestLimit = maxRequests(context, 30);
    const recordLimit = maxRecords(context, 500);
    const events = new Map<string, PublicEvent>();
    let nextUrl: string | null = reference;
    let requests = 0;

    while (nextUrl && requests < requestLimit && events.size < recordLimit) {
      const pageUrl: string = nextUrl;
      const page = await fetchHtml(pageUrl, context, this.metadata.sourceName);
      requests += 1;
      const parsed = parseChristchurchCouncilEventsPage(page.text, page.url);
      for (const event of parsed.events) {
        if (overlaps(event.startsAt, event.endsAt, context)) events.set(event.externalId, event);
        if (events.size >= recordLimit) break;
      }
      const pageIsBeyondRange = context.collectionRange?.to
        ? parsed.events.length > 0 && parsed.events.every((event) => event.startsAt > context.collectionRange!.to)
        : false;
      nextUrl = !pageIsBeyondRange && parsed.nextUrl && parsed.nextUrl !== pageUrl ? parsed.nextUrl : null;
    }

    if (!events.size) throw new AdapterError("PARSING_ERROR", "Christchurch City Council What's On returned no events in the requested range", false);
    return eventRawRecords(this.metadata.sourceId, [...events.values()], requests);
  }

  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return rawEvents(records); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return health(CCC_EVENTS_URL, this.metadata.sourceName, context); }
  rightsMetadata(): SourceRights { return reviewRights("Christchurch City Council public What's On listing; list pages are paged without opening each event detail"); }
}

class AraAcademicCalendarAdapter implements PublicDataAdapter {
  readonly metadata = metadata("ara_academic_dates", "Ara academic calendar", ["www.ara.ac.nz"], "academic-calendar-html-v1", 4);

  async discover(): Promise<string[]> { return [ARA_CALENDAR_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertAllowed(reference, this.metadata.supportedDomains);
    const page = await fetchHtml(reference, context, this.metadata.sourceName);
    const signals = parseAraAcademicCalendar(page.text, page.url).filter((signal) => overlaps(signal.startsAt, signal.endsAt, context)).slice(0, maxRecords(context, 200));
    if (!signals.length) throw new AdapterError("PARSING_ERROR", "Ara academic calendar returned no demand-relevant dates in the requested range", false);
    return signalRawRecords(this.metadata.sourceId, signals);
  }
  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> { return rawSignals(records); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return health(ARA_CALENDAR_URL, this.metadata.sourceName, context); }
  rightsMetadata(): SourceRights { return reviewRights("Ara official academic calendar; only accommodation-demand-relevant semester, break and Christchurch graduation dates are retained"); }
}

class CanterburyMajorAnnualEventsAdapter implements PublicDataAdapter {
  readonly metadata = metadata(
    "canterbury_major_annual_events",
    "Canterbury independent major annual events",
    ["www.theshow.co.nz", "www.christchurchmarathon.co.nz"],
    "official-event-page-html-v1",
    4,
  );

  async discover(): Promise<string[]> { return [CANTERBURY_SHOW_URL, CHRISTCHURCH_MARATHON_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertAllowed(reference, this.metadata.supportedDomains);
    const page = await fetchHtml(reference, context, this.metadata.sourceName);
    const parsed = parseCanterburyMajorAnnualEvent(page.text, page.url);
    if (!parsed.length) throw new AdapterError("PARSING_ERROR", `${new URL(reference).hostname} returned no supported annual event`, false);
    const events = parsed.filter((event) => overlaps(event.startsAt, event.endsAt, context)).slice(0, maxRecords(context, 20));
    return eventRawRecords(this.metadata.sourceId, events, 1);
  }
  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return rawEvents(records); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return health(CANTERBURY_SHOW_URL, this.metadata.sourceName, context); }
  rightsMetadata(): SourceRights { return reviewRights("Official pages for selected independent annual events with stable dates and published demand evidence"); }
}

export function parseChristchurchCouncilEventsPage(html: string, finalUrl = CCC_EVENTS_URL): CccPage {
  const { document } = parseHTML(html);
  const events = [...document.querySelectorAll(".event-card .card-event")].flatMap((card): PublicEvent[] => {
    const title = clean(card.querySelector(".card-title")?.textContent ?? "");
    const advertisedDate = clean(card.querySelector("time.card-pre-heading")?.textContent ?? "");
    const range = parseCccDateRange(advertisedDate);
    const href = card.querySelector("a[href]")?.getAttribute("href") ?? "";
    const sourceUrl = cccEventUrl(href, finalUrl);
    if (!title || !range || !sourceUrl) return [];
    const seriesId = `ccc-whats-on:${slug(new URL(sourceUrl).pathname.split("/").at(-1) || title)}`;
    return [event({
      sourceId: "christchurch_council_events",
      externalId: `${seriesId}:${isoDate(range.start)}`,
      seriesId,
      title,
      sourceUrl,
      startsAt: startOfNzDay(range.start),
      endsAt: endOfNzDay(range.end),
      venueName: null,
      address: null,
      category: "Council event listing",
      impactEvidence: { reason: "ATTENDANCE_OR_CAPACITY_REQUIRED" },
      metadata: {
        advertisedDate,
        imageUrl: safeUrl(card.querySelector("img[src]")?.getAttribute("src") ?? null, finalUrl),
        extractionVersion: "ccc-whats-on-listing-v1",
      },
    })];
  });
  const nextHref = [...document.querySelectorAll("a.next-prev-link[href]")]
    .find((link) => /next/i.test(link.textContent ?? ""))?.getAttribute("href");
  return { events, nextUrl: safeUrl(nextHref ?? null, finalUrl) };
}

export function parseAraAcademicCalendar(html: string, finalUrl = ARA_CALENDAR_URL): PublicSignal[] {
  const { document } = parseHTML(html);
  const signals: PublicSignal[] = [];
  for (const section of document.querySelectorAll(".wysiwygBlock")) {
    let year = 0;
    for (const node of section.querySelectorAll("h2, h3, h4, table")) {
      const headingYear = Number(clean(node.textContent ?? "").match(/^20\d{2}$/)?.[0]);
      if (headingYear) { year = headingYear; continue; }
      if (!year || node.tagName.toLowerCase() !== "table") continue;
      for (const row of node.querySelectorAll("tbody tr")) {
        const cells = [...row.querySelectorAll("td,th")];
        const advertisedDate = clean(cells[0]?.textContent ?? "");
        const title = clean(cells[1]?.querySelector("p")?.textContent ?? cells[1]?.textContent ?? "");
        if (!isAraDemandDate(title)) continue;
        const range = parseDayMonthRange(advertisedDate, year);
        if (!range) continue;
        const direction = /break|ends/i.test(title) ? "MIXED" as const : "POSITIVE" as const;
        signals.push({
          sourceId: "ara_academic_dates",
          externalId: `ara:${slug(title)}:${isoDate(range.start)}`,
          marketKey: "christchurch",
          type: "TOURISM_DEMAND",
          title: `Ara - ${title}`,
          region: "Canterbury",
          startsAt: startOfNzDay(range.start),
          endsAt: endOfNzDay(range.end),
          direction,
          confidence: /graduation/i.test(title) ? 0.9 : 0.78,
          evidenceRef: finalUrl,
          metadata: { institution: "Ara Institute of Canterbury", advertisedDate, extractionVersion: "ara-academic-calendar-v1" },
          fixture: false,
        });
      }
    }
  }
  return signals;
}

export function parseCanterburyMajorAnnualEvent(html: string, finalUrl: string): PublicEvent[] {
  const { document } = parseHTML(html);
  const text = clean(document.documentElement?.textContent || document.textContent || html);
  const host = new URL(finalUrl).hostname.toLowerCase();
  if (host === "www.theshow.co.nz") {
    const match = text.match(/(?:Wed(?:nesday)?\s+)?(\d{1,2})\s*-\s*(?:Fri(?:day)?\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})/i);
    if (!match) return [];
    const start = namedDate(Number(match[4]), match[3]!, Number(match[1]));
    const end = namedDate(Number(match[4]), match[3]!, Number(match[2]));
    if (!start || !end) return [];
    const attendance = numberNearLabel(text, /([\d,]+)\s*Annual\s*Visitors/i);
    const observedAt = new Date();
    return [event({
      sourceId: "canterbury_major_annual_events",
      externalId: `canterbury-ap-show:${match[4]}`,
      seriesId: "canterbury-ap-show",
      title: "Ravensdown Canterbury A&P Show",
      sourceUrl: finalUrl,
      startsAt: startOfNzDay(start),
      endsAt: endOfNzDay(end),
      venueName: "Canterbury Agricultural Park",
      address: "102 Curletts Road, Wigram, Christchurch 8042",
      category: "Agricultural show",
      impactEvidence: attendance ? {
        ...emptyEventImpactEvidence(),
        items: [{
          evidenceType: "EXPECTED_ATTENDANCE",
          value: attendance,
          unit: "people",
          sourceUrl: finalUrl,
          observedAt: observedAt.toISOString(),
          confidence: 0.96,
          notes: "Official annual visitors published for the three-day show",
        }],
      } : emptyEventImpactEvidence(["ATTENDANCE_REQUIRED"]),
      impactScore: attendance && attendance >= 50_000 ? 0.95 : null,
      impactConfidence: attendance ? 0.96 : null,
      metadata: {
        annualVisitors: attendance,
        tradeSites: numberNearLabel(text, /([\d,]+)\s*Trade\s*Sites/i),
        showEventsAndCompetitions: numberNearLabel(text, /([\d,]+)\s*Show\s*Events/i),
        advertisedDate: match[0],
        extractionVersion: "canterbury-ap-show-page-v1",
      },
    })];
  }
  if (host === "www.christchurchmarathon.co.nz") {
    const match = text.match(/ASICS Christchurch Marathon\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})/i);
    if (!match) return [];
    const date = namedDate(Number(match[3]), match[2]!, Number(match[1]));
    if (!date) return [];
    return [event({
      sourceId: "canterbury_major_annual_events",
      externalId: `christchurch-marathon:${match[3]}`,
      seriesId: "christchurch-marathon",
      title: "ASICS Christchurch Marathon",
      sourceUrl: finalUrl,
      startsAt: startOfNzDay(date),
      endsAt: endOfNzDay(date),
      venueName: "Hagley Park",
      address: "Hagley Park, Christchurch Central City, Christchurch 8011",
      category: "Mass participation sport",
      impactEvidence: { reason: "CURRENT_YEAR_ATTENDANCE_REQUIRED" },
      metadata: { advertisedDate: `${match[1]} ${match[2]} ${match[3]}`, extractionVersion: "christchurch-marathon-page-v1" },
    })];
  }
  return [];
}

export const christchurchPriorityAdapters: Record<string, PublicDataAdapter> = {
  christchurch_council_events: new ChristchurchCouncilEventsAdapter(),
  ara_academic_dates: new AraAcademicCalendarAdapter(),
  canterbury_major_annual_events: new CanterburyMajorAnnualEventsAdapter(),
};

function event(input: {
  sourceId: string; externalId: string; seriesId: string; title: string; sourceUrl: string; startsAt: Date; endsAt: Date;
  venueName: string | null; address: string | null; category: string; impactEvidence: Record<string, unknown>;
  impactScore?: number | null; impactConfidence?: number | null; metadata: Record<string, unknown>;
}): PublicEvent {
  return {
    sourceId: input.sourceId, externalId: input.externalId, title: input.title, category: input.category, subcategory: null,
    sourceUrl: input.sourceUrl, venueName: input.venueName, address: input.address, city: "Christchurch", region: "Canterbury",
    territorialAuthority: "Christchurch City", postcode: input.address?.match(/\b(\d{4})\b/)?.[1] ?? null, countryCode: "NZ",
    latitude: null, longitude: null, timezone: "Pacific/Auckland", startsAt: input.startsAt, endsAt: input.endsAt,
    status: "SCHEDULED", ticketStatus: null,
    impactStatus: input.impactScore !== undefined && input.impactScore !== null ? "PROMOTED" : "PENDING_EVIDENCE",
    impactScore: input.impactScore ?? null, impactConfidence: input.impactConfidence ?? null, impactEvidence: input.impactEvidence,
    sourceUpdatedAt: null, metadata: { ...input.metadata, sourceEventId: input.seriesId, seriesUrl: input.sourceUrl }, fixture: false,
  };
}

function parseCccDateRange(value: string) {
  const year = Number(value.match(/\b(20\d{2})\b/)?.[1]);
  if (!year) return null;
  const stripped = value.replace(/\b20\d{2}\b/, "").trim();
  const [startText, endText = startText] = stripped.split(/\s+to\s+/i);
  const endParts = endText?.match(/(\d{1,2})\s+([A-Za-z]+)/);
  const startParts = startText?.match(/(\d{1,2})(?:\s+([A-Za-z]+))?/);
  const endMonth = monthIndex(endParts?.[2] ?? "");
  const startMonth = monthIndex(startParts?.[2] ?? "") >= 0 ? monthIndex(startParts?.[2] ?? "") : endMonth;
  if (!startParts || !endParts || startMonth < 0 || endMonth < 0) return null;
  return { start: new Date(Date.UTC(year, startMonth, Number(startParts[1]))), end: new Date(Date.UTC(year, endMonth, Number(endParts[1]))) };
}

function parseDayMonthRange(value: string, year: number) {
  const matches = [...value.matchAll(/(\d{1,2})(?:\s+([A-Za-z]+))?/g)];
  const endMonthName = value.match(/([A-Za-z]+)\s*$/)?.[1] ?? "";
  const endMonth = monthIndex(endMonthName);
  const startMonth = monthIndex(matches[0]?.[2] ?? "") >= 0 ? monthIndex(matches[0]?.[2] ?? "") : endMonth;
  if (!matches.length || startMonth < 0 || endMonth < 0) return null;
  return { start: new Date(Date.UTC(year, startMonth, Number(matches[0]![1]))), end: new Date(Date.UTC(year, endMonth, Number(matches.at(-1)![1]))) };
}

function isAraDemandDate(title: string) {
  if (/Timaru|registrations close|campus(?:es)? closed|Whakatau/i.test(title)) return false;
  return /semester\s+\d+\s+(?:starts|ends)|mid-year break|graduation\s*-\s*Christchurch/i.test(title);
}

function cccEventUrl(href: string, base: string) {
  const absolute = safeUrl(href, base);
  if (!absolute) return null;
  const redirect = new URL(absolute).searchParams.get("url");
  return safeUrl(redirect, base) ?? absolute;
}

function namedDate(year: number, monthName: string, day: number) {
  const month = monthIndex(monthName);
  return month < 0 ? null : new Date(Date.UTC(year, month, day));
}
function startOfNzDay(date: Date) { return nzDateTime(isoDate(date), "00:00:00"); }
function endOfNzDay(date: Date) { return nzDateTime(isoDate(date), "23:59:59"); }
function nzDateTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, second!));
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(guess).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return new Date(guess.getTime() - (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - guess.getTime()));
}

function eventRawRecords(sourceId: string, events: PublicEvent[], requests: number): PublicRawRecord[] {
  return events.map((value, index) => ({ sourceId, externalId: value.externalId, payload: { kind: "event", value }, fetchedAt: new Date(), fixture: false, networkRequestCount: index === 0 ? requests : 0 }));
}
function signalRawRecords(sourceId: string, signals: PublicSignal[]): PublicRawRecord[] {
  return signals.map((value, index) => ({ sourceId, externalId: value.externalId, payload: { kind: "signal", value }, fetchedAt: new Date(), fixture: false, networkRequestCount: index === 0 ? 1 : 0 }));
}
function rawEvents(records: PublicRawRecord[]) { return records.flatMap((record) => isRecord(record.payload) && record.payload.kind === "event" && isEvent(record.payload.value) ? [record.payload.value] : []); }
function rawSignals(records: PublicRawRecord[]) { return records.flatMap((record) => isRecord(record.payload) && record.payload.kind === "signal" && isSignal(record.payload.value) ? [record.payload.value] : []); }

function metadata(sourceId: string, sourceName: string, supportedDomains: string[], parserVersion: string, dailyBudget: number, accessMethod = "OFFICIAL_PUBLIC_HTML"): AdapterMetadata {
  return { sourceId, sourceName, sourceType: "PUBLIC_DATA", supportedDomains, adapterKey: `public:${sourceId}:${parserVersion}`, accessMethod, concurrencyLimit: 1, dailyBudget, collectorVersion: `${sourceId}-http-v1`, parserVersion };
}
async function fetchHtml(url: string, context: AdapterContext, sourceName: string) {
  const response = await fetch(url, { headers: { accept: "text/html,application/xhtml+xml", "accept-language": "en-NZ,en;q=0.9", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }, signal: context.signal ?? AbortSignal.timeout(context.collectionLimits?.timeoutMs ?? 30_000) });
  if (!response.ok) throw new AdapterError(response.status === 429 ? "RATE_LIMITED" : "SOURCE_UNAVAILABLE", `${sourceName} returned HTTP ${response.status}`, response.status === 429 || response.status >= 500);
  const maxBytes = context.collectionLimits?.maxBytes ?? 5_000_000;
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new AdapterError("PARSING_ERROR", `${sourceName} response exceeded the configured byte limit`, false);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new AdapterError("PARSING_ERROR", `${sourceName} response exceeded the configured byte limit`, false);
  return { text, url: response.url };
}
async function health(url: string, name: string, context: AdapterContext): Promise<AdapterHealth> {
  const started = Date.now();
  try {
    const response = await fetch(url, { headers: { "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }, signal: context.signal ?? AbortSignal.timeout(10_000) });
    await response.body?.cancel();
    return { status: response.ok ? "HEALTHY" : response.status === 429 ? "DEGRADED" : "DOWN", checkedAt: new Date(), message: `${name} returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
  } catch (error) {
    return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : `${name} health check failed`, latencyMs: Date.now() - started, mode: context.mode };
  }
}
function reviewRights(basis: string): SourceRights { return { internalApprovalStatus: "PENDING", legalRightsStatus: "REVIEW", lifecycle: "RESEARCH", environments: ["DEVELOPMENT", "TEST", "PILOT"], allowedUsage: ["HEALTH_CHECK", "FIXTURE_TEST"], displayPermission: false, derivedAnalysisPermission: false, retentionPolicy: { rawHours: 168, parserFailureHours: 720, normalizedDays: null }, basis }; }
function assertAllowed(value: string, domains: string[]) { let url: URL; try { url = new URL(value); } catch { throw new AdapterError("INVALID_INPUT", "Source reference is not a URL", false); } if (url.protocol !== "https:" || !domains.includes(url.hostname.toLowerCase())) throw new AdapterError("INVALID_INPUT", `Unsupported source host ${url.hostname}`, false); }
function overlaps(start: Date, end: Date, context: AdapterContext) { return !context.collectionRange || (end >= context.collectionRange.from && start <= context.collectionRange.to); }
function safeUrl(value: string | null, base: string) { try { return value ? new URL(value, base).href : null; } catch { return null; } }
function numberNearLabel(value: string, pattern: RegExp) { const match = value.match(pattern); return match ? Number(match[1]!.replace(/,/g, "")) : null; }
function monthIndex(value: string) { return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(value.trim().toLowerCase().slice(0, 3)); }
function maxRequests(context: AdapterContext, fallback: number) { return Math.max(1, context.collectionLimits?.maxRequests ?? fallback); }
function maxRecords(context: AdapterContext, fallback: number) { return Math.max(1, context.collectionLimits?.maxRecords ?? fallback); }
function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
function slug(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100); }
function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isEvent(value: unknown): value is PublicEvent { return isRecord(value) && typeof value.externalId === "string" && value.startsAt instanceof Date; }
function isSignal(value: unknown): value is PublicSignal { return isRecord(value) && typeof value.externalId === "string" && value.startsAt instanceof Date; }
