import { parse } from "csv-parse/sync";
import { parseHTML } from "linkedom";
import { nzDateKey, nzDateTime as newZealandDateTime, nzEndOfDay } from "@tymra/domain";

import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicDiscoveryRequest, PublicEvent, PublicRawRecord, PublicSignal } from "./adapter-types";
import { AdapterError } from "./adapter-types";
import { parsePlatformJsonLdEvents } from "./public-event-platform-adapters";

const CRUSADERS_URL = "https://www.crusaders.co.nz/fixtures/draw/";
const TACTIX_URL = "https://www.tactixnetball.co.nz/tactix/draw/results.html";
const CANTERBURY_CRICKET_URL = "https://www.canterburycricket.org.nz/teams/canterbury-kings/";
const UC_DATES_URL = "https://www.canterbury.ac.nz/study/study-support-info/dates-and-timetables/key-university-dates";
const ADDINGTON_URL = "https://www.addington.co.nz/racing/";
const RICCARTON_URL = "https://racing.riccartonpark.nz/";
const CRUISE_URL = "https://newzealandcruiseassociation.com/schedules/";
const AIRPORT_MONTHLY_URL = "https://www.christchurchairport.co.nz/about-us/who-we-are/facts-and-figures/monthly-passenger-arrivals-and-departures/";

type HtmlResult = { events?: PublicEvent[]; signals?: PublicSignal[]; metadata?: Record<string, unknown> };
type HtmlParser = (html: string, finalUrl: string) => HtmlResult;
type NzCruiseRow = { Ship: string; Port: string; Arrival: string; "Arrival time": string; Departure: string; "Departure time": string; Guests: string; Crew: string };

class ChristchurchDemandAdapter implements PublicDataAdapter {
  constructor(readonly metadata: AdapterMetadata, private readonly references: string[], private readonly parser: HtmlParser) {}

  async discover(_request: PublicDiscoveryRequest): Promise<string[]> { return this.references; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    assertAllowed(reference, this.metadata.supportedDomains);
    const response = await fetch(reference, {
      headers: { accept: "text/html,application/xhtml+xml", "accept-language": "en-NZ,en;q=0.9", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" },
      signal: context.signal ?? AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw sourceError(this.metadata.sourceName, response.status);
    const parsed = this.parser(await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), response.url);
    if (!(parsed.events?.length || parsed.signals?.length || parsed.metadata)) throw new AdapterError("PARSING_ERROR", `${this.metadata.sourceName} returned no supported records`, false);
    const values = [
      ...(parsed.events ?? []).filter((event) => overlaps(event.startsAt, event.endsAt, context)).map((event) => ({ kind: "event", value: event })),
      ...(parsed.signals ?? []).filter((signal) => overlaps(signal.startsAt, signal.endsAt, context)).map((signal) => ({ kind: "signal", value: signal })),
    ];
    if (this.metadata.sourceId === "christchurch_airport_monthly") values.sort((a, b) => b.value.startsAt.getTime() - a.value.startsAt.getTime());
    values.splice(context.collectionLimits?.maxRecords ?? 500);
    if (!values.length && parsed.metadata) values.push({ kind: "metadata", value: parsed.metadata } as never);
    return values.map((entry, index) => ({
      sourceId: this.metadata.sourceId,
      externalId: "externalId" in entry.value ? String(entry.value.externalId) : `${this.metadata.sourceId}:metadata`,
      payload: { kind: entry.kind, value: entry.value, sourceUrl: response.url },
      fetchedAt: new Date(), fixture: false, networkRequestCount: index === 0 ? 1 : 0,
    }));
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((record) => isRecord(record.payload) && record.payload.kind === "signal" && isSignal(record.payload.value) ? [record.payload.value] : []);
  }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> {
    return records.flatMap((record) => isRecord(record.payload) && record.payload.kind === "event" && isEvent(record.payload.value) ? [record.payload.value] : []);
  }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return health(this.references[0]!, this.metadata.sourceName, context); }
}

class ChristchurchCruiseAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    ...metadata("christchurch_cruise", "Christchurch cruise schedule", ["newzealandcruiseassociation.com", "docs.google.com"], "nzca-published-csv-v1", 4),
    accessMethod: "OFFICIAL_PUBLIC_CSV", collectorVersion: "christchurch-cruise-nzca-csv-v1",
  };

  async discover(): Promise<string[]> { return [CRUISE_URL]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    if (reference !== CRUISE_URL) throw new AdapterError("INVALID_INPUT", "Cruise schedule reference is not approved", false);
    if ((context.collectionLimits?.maxRequests ?? 2) < 2) throw new AdapterError("INVALID_INPUT", "Cruise schedule needs a two-request budget", false);
    const page = await fetchHtml(reference, context);
    const from = context.collectionRange?.from ?? new Date();
    const [year, month] = nzDateKey(from).split("-").map(Number);
    const seasonStart = month >= 7 ? year! : year! - 1;
    const scheduleUrl = findNzCruiseScheduleCsvUrl(page.text, `${seasonStart}-${String((seasonStart + 1) % 100).padStart(2, "0")}`);
    const scheduleResponse = await fetch(scheduleUrl, {
      headers: { accept: "text/csv", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" },
      signal: context.signal ?? AbortSignal.timeout(30_000),
    });
    if (!scheduleResponse.ok) throw sourceError(this.metadata.sourceName, scheduleResponse.status);
    const events = parseNzCruiseScheduleCsv(await boundedText(scheduleResponse, context.collectionLimits?.maxBytes ?? 2_000_000), page.url)
      .filter((event) => overlaps(event.startsAt, event.endsAt, context));
    if (events.length > (context.collectionLimits?.maxRecords ?? 500)) {
      throw new AdapterError("PARSING_ERROR", "NZCA Christchurch and Akaroa schedule exceeds the bounded record limit", false);
    }
    return events.map((event, index) => ({ sourceId: this.metadata.sourceId, externalId: event.externalId,
      payload: { kind: "event", value: event, scheduleUrl: page.url, publishedCsvUrl: scheduleUrl },
      fetchedAt: new Date(), fixture: false, networkRequestCount: index === 0 ? 2 : 0 }));
  }

  async normalise(): Promise<PublicSignal[]> { return []; }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap((record) => isRecord(record.payload) && record.payload.kind === "event" && isEvent(record.payload.value) ? [record.payload.value] : []); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> { return health(CRUISE_URL, this.metadata.sourceName, context); }
}

export function parseChristchurchSports(html: string, finalUrl: string): HtmlResult {
  const host = new URL(finalUrl).hostname;
  if (host.includes("canterburycricket")) {
    return { events: parsePlatformJsonLdEvents(html, finalUrl, "christchurch_sports").filter(isChristchurchEvent).map((event) => ({ ...event, category: "Sport", metadata: { ...event.metadata, competitionSource: "Canterbury Cricket" } })) };
  }
  const { document } = parseHTML(html);
  if (host.includes("crusaders")) {
    const year = Number(clean(document.querySelector(".c-opta-data-block__heading")?.textContent ?? "").match(/\b(20\d{2})\b/)?.[1]);
    const events = [...document.querySelectorAll("table.c-fixture-table tbody tr")].flatMap((row) => {
      const cells = [...row.querySelectorAll("td")].map((cell) => clean(cell.textContent));
      if (cells.length < 4 || !/christchurch/i.test(cells[3] ?? "")) return [];
      const startsAt = parseDayMonthTime(cells[1]!, year);
      return startsAt ? [eventRecord("christchurch_sports", `crusaders:${cells[0]}:${startsAt.toISOString()}`, cells[2]!, finalUrl, startsAt, cells[3]!, "Sport", { competition: "Super Rugby Pacific", round: cells[0], score: cells[4] || null })] : [];
    });
    return { events };
  }
  const year = Number(clean(document.querySelector("h1")?.textContent ?? html).match(/\b(20\d{2})\b/)?.[1]) || Number(nzDateKey(new Date()).slice(0, 4));
  const events = [...document.querySelectorAll(".match.home-game")].flatMap((match) => {
    const day = clean(match.querySelector(".date .day")?.textContent ?? "");
    const month = clean(match.querySelector(".date .month")?.textContent ?? "");
    const round = clean(match.querySelector(".date .additional")?.textContent ?? "");
    const location = clean(match.querySelector(".details .location")?.textContent ?? "").replace(/Home Game/gi, "").trim();
    const startsAt = parseDayMonthTime(`${day} ${month} | 19:00`, year);
    if (!startsAt || !/christchurch/i.test(location)) return [];
    return [eventRecord("christchurch_sports", `tactix:${round}:${startsAt.toISOString()}`, `Mainland Tactix home game - ${round}`, finalUrl, startsAt, location, "Sport", { competition: "ANZ Premiership", round })];
  });
  return { events };
}

export function parseUcKeyDates(html: string, finalUrl: string): HtmlResult {
  const { document } = parseHTML(html);
  const signals: PublicSignal[] = [];
  let year = 0;
  for (const element of document.querySelectorAll("#2026, #2027, .cmp-timeline-ordered-item")) {
    if (element.id && /^20\d{2}$/.test(element.id)) { year = Number(element.id); continue; }
    if (!year || !element.classList.contains("cmp-timeline-ordered-item")) continue;
    const advertised = clean(element.querySelector(".cmp-timeline-ordered-item__title-ctn")?.textContent ?? "");
    const title = clean(element.querySelector(".cmp-timeline-ordered-item__content-ctn")?.textContent ?? "").replace(/(?:More info\.?)?\s*Add to calendar/gi, "").trim();
    const range = parseDateRange(advertised, year);
    if (!range || !isDemandRelevantUniversityDate(title)) continue;
    signals.push(signalRecord("christchurch_university_dates", `uc:${slug(title)}:${range.start.toISOString()}`, title, finalUrl, range.start, endOfDay(range.end), "UNIVERSITY_CALENDAR", 0.88, { institution: "University of Canterbury", advertisedDate: advertised }));
  }
  return { signals };
}

export function parseChristchurchRacing(html: string, finalUrl: string): HtmlResult {
  const { document } = parseHTML(html);
  if (new URL(finalUrl).hostname.includes("addington")) {
    const events = [...document.querySelectorAll("a.racing-button")].flatMap((link) => {
      const advertised = clean(link.querySelector(".date")?.textContent ?? "").replace(/Race$/i, "").trim();
      const time = clean(link.querySelector(".time")?.textContent ?? "") || "12:00pm";
      const startsAt = parseLongDateTime(`${advertised} ${time}`);
      const sourceUrl = safeUrl(link.getAttribute("href"), finalUrl);
      if (!startsAt || !sourceUrl) return [];
      return [eventRecord("christchurch_racing", `addington:${startsAt.toISOString()}`, `Addington race meeting - ${advertised}`, sourceUrl, startsAt, "Addington Raceway, Christchurch", "Horse racing", { venue: "Addington Raceway", advertisedDate: advertised })];
    });
    return { events };
  }
  const title = clean([...document.querySelectorAll("h1")].find((heading) => /Cup Week 20\d{2}/i.test(heading.textContent))?.textContent ?? "");
  const dateText = clean([...document.querySelectorAll(".feature-tile--icon-info")].find((node) => /November 20\d{2}/i.test(node.textContent))?.textContent ?? "");
  const year = Number(dateText.match(/\b(20\d{2})\b/)?.[1]);
  const days = dateText.match(/^([\d,\s]+)\s+November/i)?.[1]?.split(",").map(Number).filter(Number.isFinite) ?? [];
  return { events: days.map((day) => {
    const startsAt = nzDate(year, 10, day, 11, 0);
    return eventRecord("christchurch_racing", `riccarton-cup-week:${year}-${day}`, `${title} - Day ${day}`, finalUrl, startsAt, "Riccarton Park Racecourse, Christchurch", "Horse racing", { venue: "Riccarton Park", series: title, advertisedDate: dateText });
  }) };
}

export function findNzCruiseScheduleCsvUrl(html: string, season: string): string {
  if (!/^20\d{2}-\d{2}$/.test(season)) throw new AdapterError("INVALID_INPUT", "Cruise season is invalid", false);
  const urls = [...html.matchAll(/'(20\d{2}-\d{2})'\s*:\s*'(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^']+)'/g)];
  const published = urls.find((match) => match[1] === season)?.[2];
  if (!published) throw new AdapterError("PARSING_ERROR", `NZCA has no published ${season} cruise schedule`, false);
  const url = new URL(published.replaceAll("&amp;", "&"));
  const documentId = url.pathname.match(/^\/spreadsheets\/d\/e\/(2PACX-[A-Za-z0-9_-]+)\/pubhtml\/sheet$/)?.[1];
  const gid = url.searchParams.get("gid");
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !documentId || !gid || !/^\d+$/.test(gid)) {
    throw new AdapterError("PARSING_ERROR", "NZCA published schedule link has an unsupported format", false);
  }
  return `https://docs.google.com/spreadsheets/d/e/${documentId}/pub?gid=${gid}&single=true&output=csv`;
}

export function parsePowerBiBootstrap(html: string) {
  const cluster = html.match(/resolvedClusterUri\s*=\s*'([^']+)'/)?.[1];
  const resourceKey = html.match(/resourceDescriptor\s*=\s*JSON\.parse\('\{\\"k\\":\\"([^"\\]+)\\"/)?.[1];
  if (!cluster || !resourceKey) throw new AdapterError("PARSING_ERROR", "Power BI embed has no public report bootstrap", false);
  const url = new URL(cluster);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".analysis.windows.net")) throw new AdapterError("INVALID_INPUT", "Power BI cluster host is not allowed", false);
  const labels = url.hostname.split(".");
  labels[0] = `${labels[0]!.replace("-redirect", "").replace("global-", "")}-api`;
  return { resourceKey, apiOrigin: `${url.protocol}//${labels.join(".")}` };
}

export function parseNzCruiseScheduleCsv(csv: string, sourceUrl: string): PublicEvent[] {
  let rows: NzCruiseRow[];
  try {
    rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true, trim: true }) as NzCruiseRow[];
  } catch {
    throw new AdapterError("PARSING_ERROR", "NZCA published cruise schedule is not valid CSV", false);
  }
  const header = csv.split(/\r?\n/, 1)[0]?.replace(/^\uFEFF/, "") ?? "";
  if (header !== "Ship,Port,Arrival,Arrival time,Departure,Departure time,Guests,Crew") {
    throw new AdapterError("PARSING_ERROR", "NZCA published cruise schedule columns changed", false);
  }
  const events = rows.flatMap((row) => {
    const port = row.Port === "Christchurch" ? "Lyttelton" : row.Port === "Akaroa" ? "Akaroa" : null;
    if (!port) return [];
    const ship = clean(row.Ship);
    const arrival = nzcaCruiseDate(row.Arrival);
    const departure = nzcaCruiseDate(row.Departure);
    const arrivalTime = nzcaCruiseTime(row["Arrival time"]);
    const departureTime = nzcaCruiseTime(row["Departure time"]);
    if (!ship || !arrival || !departure || arrivalTime === undefined || departureTime === undefined) {
      throw new AdapterError("PARSING_ERROR", "NZCA Christchurch or Akaroa call has an invalid ship or date", false);
    }
    const dateOnly = arrivalTime === null || departureTime === null;
    const startsAt = dateOnly ? nzDate(arrival.year, arrival.month, arrival.day, 0, 0)
      : nzDate(arrival.year, arrival.month, arrival.day, arrivalTime.hour, arrivalTime.minute);
    const endsAt = dateOnly ? nzEndOfDay(nzDateKey(nzDate(departure.year, departure.month, departure.day, 0, 0)))
      : nzDate(departure.year, departure.month, departure.day, departureTime.hour, departureTime.minute);
    if (endsAt <= startsAt) throw new AdapterError("PARSING_ERROR", "NZCA cruise call has an invalid date range", false);
    const localDay = nzDateKey(startsAt);
    const guests = nzcaCruiseCount(row.Guests);
    const crew = nzcaCruiseCount(row.Crew);
    const event = eventRecord("christchurch_cruise", `cruise:${slug(port)}:${slug(ship)}:${localDay}`,
      `${ship} at ${port}`, sourceUrl, startsAt,
      port === "Lyttelton" ? "Lyttelton Cruise Berth" : "Akaroa Harbour anchorage", "Cruise ship",
      { port, sourcePortLabel: row.Port, ship, guestCapacity: guests, crewCapacity: crew,
        scheduleSource: "New Zealand Cruise Association", timingIndicative: true, timePrecision: dateOnly ? "DATE" : "DATETIME" });
    event.endsAt = endsAt;
    event.city = port;
    event.timePrecision = dateOnly ? "DATE" : "DATETIME";
    event.impactEvidence = { reason: guests !== null ? "PUBLISHED_GUEST_CAPACITY" : "GUEST_CAPACITY_NOT_PUBLISHED", guestCapacity: guests };
    return [event];
  });
  if (!events.length) throw new AdapterError("PARSING_ERROR", "NZCA schedule contains no Christchurch or Akaroa calls", false);
  const ids = events.map((event) => event.externalId);
  if (new Set(ids).size !== ids.length) throw new AdapterError("PARSING_ERROR", "NZCA schedule contains ambiguous duplicate cruise calls", false);
  return events;
}

function nzcaCruiseDate(value: string) {
  const match = value.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2})$/);
  if (!match) return null;
  const month = monthIndex(match[3]!);
  const day = Number(match[2]);
  const year = 2000 + Number(match[4]);
  if (month < 0 || day < 1 || day > 31) return null;
  const actual = nzDate(year, month, day, 0, 0);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(year, month, day)).getUTCDay()];
  return nzDateKey(actual) === `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    && weekday === match[1] ? { year, month, day } : null;
}

function nzcaCruiseTime(value: string): { hour: number; minute: number } | null | undefined {
  if (!value.trim()) return null;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return undefined;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function nzcaCruiseCount(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d{1,3}(?:,\d{3})*$|^\d+$/.test(value)) throw new AdapterError("PARSING_ERROR", "NZCA cruise capacity is malformed", false);
  return Number(value.replaceAll(",", ""));
}

export function parseAirportMonthlyPassengers(html: string, finalUrl: string): HtmlResult {
  const { document } = parseHTML(html);
  const records: Array<{ year: number; month: number; monthName: string; domestic: number; international: number; total: number }> = [];
  for (const heading of document.querySelectorAll("h4")) {
    const year = Number(clean(heading.textContent));
    const table = heading.nextElementSibling;
    if (!Number.isInteger(year) || table?.tagName !== "TABLE") continue;
    for (const row of table.querySelectorAll("tr")) {
      const cells = [...row.querySelectorAll("td")].map((cell) => clean(cell.textContent));
      const month = monthIndex(cells[0] ?? "");
      const domestic = parseCount(cells[1]);
      const international = parseCount(cells[2]);
      const total = parseCount(cells[3]);
      if (month < 0 || domestic === null || international === null || total === null) continue;
      records.push({ year, month, monthName: cells[0]!, domestic, international, total });
    }
  }
  const byPeriod = new Map(records.map((record) => [`${record.year}-${record.month}`, record]));
  const signals = records.map((record) => {
    const previous = byPeriod.get(`${record.year - 1}-${record.month}`);
    const annualChangePercent = previous?.total ? (record.total - previous.total) / previous.total * 100 : null;
    const startsAt = nzDate(record.year, record.month, 1, 0, 0);
    const endsAt = record.month === 11
      ? nzDate(record.year + 1, 0, 1, 0, 0)
      : nzDate(record.year, record.month + 1, 1, 0, 0);
    const signal = signalRecord("christchurch_airport_monthly", `airport-passengers:${record.year}-${String(record.month + 1).padStart(2, "0")}`, `Christchurch Airport passengers - ${record.monthName} ${record.year}`, finalUrl, startsAt, endsAt, "TOURISM_DEMAND", 0.9, { contextSeriesKey: "airport-monthly-passengers", domesticPassengers: record.domestic, internationalPassengers: record.international, totalPassengers: record.total, annualChangePercent });
    signal.direction = annualChangePercent === null ? "UNKNOWN" : annualChangePercent > 2 ? "POSITIVE" : annualChangePercent < -2 ? "NEGATIVE" : "MIXED";
    return signal;
  });
  return { signals };
}

export const christchurchDemandAdapters: Record<string, PublicDataAdapter> = {
  christchurch_sports: new ChristchurchDemandAdapter(metadata("christchurch_sports", "Christchurch official sports fixtures", ["www.crusaders.co.nz", "www.tactixnetball.co.nz", "www.canterburycricket.org.nz"], "events-v1", 24), [CRUSADERS_URL, TACTIX_URL, CANTERBURY_CRICKET_URL], parseChristchurchSports),
  christchurch_university_dates: new ChristchurchDemandAdapter(metadata("christchurch_university_dates", "Christchurch university demand dates", ["www.canterbury.ac.nz", "www.lincoln.ac.nz"], "key-dates-v2", 4), [UC_DATES_URL], parseUcKeyDates),
  christchurch_racing: new ChristchurchDemandAdapter(metadata("christchurch_racing", "Christchurch racing and Cup Week", ["www.addington.co.nz", "racing.riccartonpark.nz"], "racing-v1", 12), [ADDINGTON_URL, RICCARTON_URL], parseChristchurchRacing),
  christchurch_cruise: new ChristchurchCruiseAdapter(),
  christchurch_airport_monthly: new ChristchurchDemandAdapter(metadata("christchurch_airport_monthly", "Christchurch Airport monthly passengers", ["www.christchurchairport.co.nz"], "passenger-table-v1", 4), [AIRPORT_MONTHLY_URL], parseAirportMonthlyPassengers),
};

function metadata(sourceId: string, sourceName: string, supportedDomains: string[], suffix: string, dailyBudget: number): AdapterMetadata { return { sourceId, sourceName, sourceType: "PUBLIC_DATA", supportedDomains, adapterKey: `public:${sourceId}:${suffix}`, accessMethod: "OFFICIAL_PUBLIC_HTML", concurrencyLimit: 1, dailyBudget, collectorVersion: `${sourceId}-http-v1`, parserVersion: suffix }; }
function eventRecord(sourceId: string, externalId: string, title: string, sourceUrl: string, startsAt: Date, venueName: string, category: string, metadataValue: Record<string, unknown>): PublicEvent { return { sourceId, externalId, title, category, subcategory: null, sourceUrl, venueName, address: null, city: "Christchurch", region: "Canterbury", territorialAuthority: "Christchurch City", postcode: null, countryCode: "NZ", latitude: null, longitude: null, timezone: "Pacific/Auckland", startsAt, endsAt: new Date(startsAt.getTime() + 3 * 3_600_000), status: "SCHEDULED", ticketStatus: null, impactStatus: "PENDING_EVIDENCE", impactScore: null, impactConfidence: null, impactEvidence: { reason: "ATTENDANCE_OR_CAPACITY_REQUIRED" }, sourceUpdatedAt: null, metadata: metadataValue, fixture: false }; }
function signalRecord(sourceId: string, externalId: string, title: string, evidenceRef: string, startsAt: Date, endsAt: Date, type: string, confidence: number, metadataValue: Record<string, unknown>): PublicSignal { return { sourceId, externalId, marketKey: "christchurch", type, title, region: "Canterbury", startsAt, endsAt, direction: "POSITIVE", confidence, evidenceRef, metadata: metadataValue, fixture: false }; }
async function fetchHtml(url: string, context: AdapterContext) { const response = await fetch(url, { headers: { accept: "text/html,application/xhtml+xml", "accept-language": "en-NZ,en;q=0.9", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }, signal: context.signal ?? AbortSignal.timeout(30_000) }); if (!response.ok) throw sourceError("Christchurch cruise schedule", response.status); return { text: await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), url: response.url }; }
function isChristchurchEvent(event: PublicEvent) { return /christchurch|hagley oval/i.test([event.city, event.address, event.venueName].filter(Boolean).join(" ")); }
function isDemandRelevantUniversityDate(title: string) { return /graduation|open day|lectures (?:start|resume|end)|examination period|mid-year break|mid-semester lecture break|summer break/i.test(title); }
function parseDateRange(value: string, year: number) { const matches = [...value.matchAll(/(\d{1,2})(?:\s+([A-Za-z]+))?/g)]; if (!matches.length) return null; const endMonth = monthIndex(value.match(/([A-Za-z]+)\s*$/)?.[1] ?? ""); const startMonth = monthIndex(matches[0]?.[2] ?? "") >= 0 ? monthIndex(matches[0]![2]!) : endMonth; if (startMonth < 0 || endMonth < 0) return null; return { start: nzDate(year, startMonth, Number(matches[0]![1]), 0, 0), end: nzDate(year, endMonth, Number(matches.at(-1)![1]), 0, 0) }; }
function parseDayMonthTime(value: string, year: number) { const match = value.match(/(?:[A-Za-z]{3}\s+)?(\d{1,2})\s+([A-Za-z]{3,9})\s*\|\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i); if (!match || !year) return null; let hour = Number(match[3]); if (match[5]?.toLowerCase() === "pm" && hour < 12) hour += 12; if (match[5]?.toLowerCase() === "am" && hour === 12) hour = 0; const month = monthIndex(match[2]!); return month < 0 ? null : nzDate(year, month, Number(match[1]), hour, Number(match[4])); }
function parseLongDateTime(value: string) { const match = value.match(/(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\s+(\d{1,2}):(\d{2})(am|pm)/i); if (!match) return null; let hour = Number(match[4]) % 12; if (match[6]!.toLowerCase() === "pm") hour += 12; const month = monthIndex(match[2]!); return month < 0 ? null : nzDate(Number(match[3]), month, Number(match[1]), hour, Number(match[5])); }
function nzDate(year: number, month: number, day: number, hour: number, minute: number) { return newZealandDateTime(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`); }
function endOfDay(date: Date) { return nzEndOfDay(nzDateKey(date)); }
function monthIndex(value: string) { const token = value?.trim().toLowerCase().slice(0, 3); return token ? ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].findIndex((month) => month.startsWith(token)) : -1; }
function parseCount(value?: string) { if (!value) return null; const number = Number(value.replace(/,/g, "")); return Number.isFinite(number) ? number : null; }
function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
function slug(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80); }
function safeUrl(value: string | null, base: string) { try { return value ? new URL(value, base).href : null; } catch { return null; } }
function overlaps(start: Date, end: Date, context: AdapterContext) { return !context.collectionRange || (end >= context.collectionRange.from && start <= context.collectionRange.to); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function recordValue(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function arrayValue(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function finiteNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function isEvent(value: unknown): value is PublicEvent { return isRecord(value) && typeof value.externalId === "string" && value.startsAt instanceof Date; }
function isSignal(value: unknown): value is PublicSignal { return isRecord(value) && typeof value.externalId === "string" && value.startsAt instanceof Date; }
function assertAllowed(value: string, domains: string[]) { let url: URL; try { url = new URL(value); } catch { throw new AdapterError("INVALID_INPUT", "Source reference is not a URL", false); } if (url.protocol !== "https:" || !domains.includes(url.hostname.toLowerCase())) throw new AdapterError("INVALID_INPUT", `Unsupported source host ${url.hostname}`, false); }
function sourceError(name: string, status: number) { return new AdapterError(status === 429 ? "RATE_LIMITED" : "SOURCE_UNAVAILABLE", `${name} returned HTTP ${status}`, status === 429 || status >= 500); }
async function boundedText(response: Response, maxBytes: number) { const length = Number(response.headers.get("content-length") ?? 0); if (length > maxBytes) throw new AdapterError("PARSING_ERROR", "Source response exceeded the configured byte limit", false); const text = await response.text(); if (Buffer.byteLength(text) > maxBytes) throw new AdapterError("PARSING_ERROR", "Source response exceeded the configured byte limit", false); return text; }
async function health(url: string, name: string, context: AdapterContext): Promise<AdapterHealth> { const started = Date.now(); try { const response = await fetch(url, { headers: { "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }, signal: context.signal ?? AbortSignal.timeout(10_000) }); return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `${name} returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode }; } catch (error) { return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : `${name} health check failed`, latencyMs: Date.now() - started, mode: context.mode }; } }
