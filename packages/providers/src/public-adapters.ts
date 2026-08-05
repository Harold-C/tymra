import type {
  AdapterContext,
  AdapterHealth,
  AdapterMetadata,
  PublicDataAdapter,
  PublicDiscoveryRequest,
  PublicRawRecord,
  PublicSignal,
  SourceRights,
} from "./adapter-types";
import { AdapterError } from "./adapter-types";
import { officialNzSourceAdapters } from "./official-nz-adapters";
import { christchurchEventAdapters } from "./christchurch-event-adapters";
import { christchurchDemandAdapters } from "./christchurch-demand-adapters";
import { christchurchPriorityAdapters } from "./christchurch-priority-adapters";
import { publicEventPlatformAdapters } from "./public-event-platform-adapters";
import { parse } from "csv-parse/sync";
import { DOMParser, parseHTML } from "linkedom";

const MBIE_ADP_URL = "https://teic.mbie.govt.nz/assets/adp/ADP_All_Measures.csv";
const RBNZ_B1_URL = "https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index";
const STATS_NZ_INTERNATIONAL_TRAVEL_URL = "https://www.stats.govt.nz/indicators/international-travel-provisional/";
const NZTA_DELAYS_URL = "https://www.journeys.nzta.govt.nz/assets/map-data-cache/delays.json";
const METSERVICE_CAP_RSS_URL = "https://alerts.metservice.com/cap/rss";

type CalendarRecord = {
  id: string;
  title: string;
  region: string;
  startsAt: string;
  endsAt: string;
  type: "PUBLIC_HOLIDAY" | "ANNIVERSARY_DAY" | "SCHOOL_HOLIDAY";
};

type CalendarParser = (html: string) => CalendarRecord[];

class OfficialHtmlCalendarAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata;

  constructor(
    sourceId: string,
    sourceName: string,
    private readonly sourceUrl: string,
    private readonly parser: CalendarParser,
  ) {
    this.metadata = {
      sourceId,
      sourceName,
      sourceType: "PUBLIC_DATA",
      supportedDomains: [new URL(sourceUrl).hostname],
      adapterKey: `public:${sourceId}:calendar-v1`,
      accessMethod: "OFFICIAL_PUBLIC_HTML",
      concurrencyLimit: 1,
      dailyBudget: 10,
      collectorVersion: "official-html-fetch-v1",
      parserVersion: "official-calendar-html-v1",
    };
  }

  async discover(_request: PublicDiscoveryRequest, _context: AdapterContext): Promise<string[]> {
    return [this.sourceUrl];
  }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const response = await fetch(reference, { headers: { accept: "text/html", "user-agent": "TymraLocalAcceptance/1.0" }, signal: context.signal });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `${this.metadata.sourceName} returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    const html = await readBoundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000);
    let records: CalendarRecord[];
    try { records = this.parser(html); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : `${this.metadata.sourceName} calendar parsing failed`, false); }
    const from = context.collectionRange?.from.getTime() ?? Number.NEGATIVE_INFINITY;
    const to = context.collectionRange?.to.getTime() ?? Number.POSITIVE_INFINITY;
    return records
      .filter((record) => new Date(`${record.endsAt}T00:00:00.000Z`).getTime() >= from && new Date(`${record.startsAt}T00:00:00.000Z`).getTime() <= to)
      .slice(0, context.collectionLimits?.maxRecords ?? records.length)
      .map((record) => ({ sourceId: this.metadata.sourceId, externalId: record.id, payload: record, fetchedAt: new Date(), fixture: false }));
  }

  async normalise(records: PublicRawRecord[], _context: AdapterContext): Promise<PublicSignal[]> {
    return records.map((record) => {
      const value = record.payload as CalendarRecord;
      return {
        sourceId: this.metadata.sourceId,
        externalId: value.id,
        type: value.type,
        title: value.title,
        region: value.region,
        startsAt: new Date(`${value.startsAt}T00:00:00.000Z`),
        endsAt: new Date(`${value.endsAt}T00:00:00.000Z`),
        direction: "POSITIVE",
        confidence: 1,
        evidenceRef: `${this.sourceUrl}#${value.id}`,
        fixture: false,
      };
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(this.sourceUrl, { method: "HEAD", signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `Official calendar returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "Official calendar health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

  rightsMetadata(): SourceRights {
    return allowedPublicRights("Official New Zealand calendar facts with source attribution");
  }
}

export function parseEmploymentPublicHolidays(html: string): CalendarRecord[] {
  const { document } = parseHTML(html);
  const heading = [...document.querySelectorAll("h2")].find((element) => /\b\d{4}\s+public holiday and anniversary dates/i.test(element.textContent));
  const year = Number(heading?.textContent.match(/\b(20\d{2})\b/)?.[1]);
  if (!heading || !Number.isInteger(year)) throw new Error("Employment NZ page has no current public-holiday heading");
  const tables: Element[] = [];
  for (let element = heading.nextElementSibling; element && tables.length < 2; element = element.nextElementSibling) {
    if (element.tagName === "H2") break;
    if (element.tagName === "TABLE") tables.push(element);
  }
  if (tables.length < 2) throw new Error("Employment NZ page has no public-holiday and anniversary tables");
  return [
    ...calendarTableRows(tables[0]!).map(([title, , observed]) => calendarRecord(year, title, "New Zealand", observed, "PUBLIC_HOLIDAY")),
    ...calendarTableRows(tables[1]!).map(([region, , observed]) => calendarRecord(year, `${region} Anniversary Day`, region, observed, "ANNIVERSARY_DAY")),
  ].filter((record): record is CalendarRecord => record !== null);
}

export function parseEducationSchoolHolidays(html: string): CalendarRecord[] {
  const { document } = parseHTML(html);
  const heading = [...document.querySelectorAll("h2")].find((element) => /\b20\d{2}\s+school holidays/i.test(element.textContent));
  const year = Number(heading?.textContent.match(/\b(20\d{2})\b/)?.[1]);
  if (!heading || !Number.isInteger(year)) throw new Error("Ministry of Education page has no current school-holiday heading");
  const records: CalendarRecord[] = [];
  for (let element = heading.nextElementSibling; element; element = element.nextElementSibling) {
    if (element.tagName === "H2") break;
    if (element.tagName !== "H3") continue;
    const label = cleanText(element.textContent.replace("#", ""));
    const description = cleanText(element.nextElementSibling?.tagName === "P" ? element.nextElementSibling.textContent : "");
    const range = parseDateRange(description, year);
    if (!range) continue;
    records.push({ id: `school-holiday:${year}:${slug(label)}`, title: `New Zealand school holiday after ${label}`, region: "New Zealand", startsAt: isoDate(range.start), endsAt: isoDate(addUtcDays(range.end, 1)), type: "SCHOOL_HOLIDAY" });
  }
  if (!records.length) throw new Error("Ministry of Education page has no exact school-holiday ranges");
  return records;
}

class GeoNetAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "geonet",
    sourceName: "GeoNet",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["api.geonet.org.nz"],
    adapterKey: "public:geonet:quake-v2",
    accessMethod: "OFFICIAL_OPEN_API",
    concurrencyLimit: 2,
    dailyBudget: 2_000,
    collectorVersion: "geonet-fetch-v1",
    parserVersion: "geonet-geojson-v2",
  };

  async discover(_request: PublicDiscoveryRequest, _context: AdapterContext): Promise<string[]> {
    return ["https://api.geonet.org.nz/quake?MMI=3"];
  }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const response = await fetch(reference, { headers: { accept: "application/vnd.geo+json;version=2" }, signal: context.signal });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `GeoNet returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    const payload = await response.json() as { features?: Array<{ properties?: Record<string, unknown> }> };
    if (!Array.isArray(payload.features)) throw new AdapterError("PARSING_ERROR", "GeoNet response did not contain GeoJSON features", false);
    const maxRecords = context.collectionLimits?.maxRecords ?? 100;
    return payload.features.slice(0, maxRecords).map((feature, index) => ({ sourceId: "geonet", externalId: String(feature.properties?.publicID ?? `quake-${index}`), payload: feature, fetchedAt: new Date(), fixture: false }));
  }

  async normalise(records: PublicRawRecord[], _context: AdapterContext): Promise<PublicSignal[]> {
    return records.map((record) => {
      const feature = record.payload as { properties?: Record<string, unknown> };
      const properties = feature.properties ?? {};
      const time = new Date(String(properties.time ?? record.fetchedAt.toISOString()));
      const mmi = Number(properties.mmi ?? properties.MMI ?? 0);
      return {
        sourceId: "geonet",
        externalId: record.externalId,
        type: "WEATHER_OR_ACCESS_DISRUPTION",
        title: `GeoNet earthquake: ${String(properties.locality ?? "New Zealand")}`,
        region: String(properties.locality ?? "New Zealand"),
        startsAt: time,
        endsAt: new Date(time.getTime() + 24 * 60 * 60 * 1_000),
        direction: mmi >= 5 ? "MIXED" : "UNKNOWN",
        confidence: Number.isFinite(mmi) ? Math.min(1, Math.max(0.2, mmi / 8)) : 0.2,
        evidenceRef: `https://api.geonet.org.nz/quake/${record.externalId}`,
        fixture: false,
      };
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch("https://api.geonet.org.nz/quake/stats", { headers: { accept: "application/json;version=2" }, signal: context.signal });
      return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: response.ok ? "Official GeoNet API is reachable" : `GeoNet returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "GeoNet health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

  rightsMetadata(): SourceRights {
    return allowedPublicRights("GeoNet data policy and CC BY 3.0 NZ attribution requirements apply");
  }
}

type MbieMeasure = { value: number | string; flag: string | null };
type MbieAccommodationRecord = {
  id: string;
  period: string;
  areaType: string;
  area: string;
  property: string;
  measures: Record<string, MbieMeasure>;
};

export function parseMbieAccommodationTail(content: string): MbieAccommodationRecord[] {
  const firstNewline = content.indexOf("\n");
  const body = content.startsWith("Month,Area type,Area,Property,Measure,Value,Flag")
    ? content
    : firstNewline >= 0 ? content.slice(firstNewline + 1) : "";
  if (!body.trim()) throw new Error("MBIE ADP response contains no complete CSV rows");
  const input = body.startsWith("Month,Area type,Area,Property,Measure,Value,Flag")
    ? body
    : `Month,Area type,Area,Property,Measure,Value,Flag\n${body}`;
  const rows = parse(input, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Array<Record<string, string>>;
  const datedRows = rows.flatMap((row) => {
    const period = parseMbieMonth(row.Month);
    return period ? [{ row, period }] : [];
  });
  if (!datedRows.length) throw new Error("MBIE ADP response contains no valid monthly rows");
  const latest = new Date(Math.max(...datedRows.map(({ period }) => period.getTime())));
  const periodKey = isoDate(latest);
  const grouped = new Map<string, MbieAccommodationRecord>();
  for (const { row, period } of datedRows) {
    if (period.getTime() !== latest.getTime()) continue;
    const areaType = cleanText(row["Area type"] ?? "");
    const area = cleanText(row.Area ?? "");
    const property = cleanText(row.Property ?? "");
    const measure = cleanText(row.Measure ?? "");
    const rawValue = cleanText(row.Value ?? "");
    if (!areaType || !area || !property || !measure || !rawValue || !["RTO", "TA"].includes(areaType)) continue;
    const key = `${periodKey}|${areaType}|${area}|${property}`;
    const record = grouped.get(key) ?? {
      id: `adp:${periodKey}:${areaType.toLowerCase()}:${slug(area)}:${slug(property)}`,
      period: periodKey,
      areaType,
      area,
      property,
      measures: {},
    };
    const numeric = Number(rawValue);
    record.measures[measure] = {
      value: Number.isFinite(numeric) ? numeric : rawValue,
      flag: cleanText(row.Flag ?? "") || null,
    };
    grouped.set(key, record);
  }
  const records = [...grouped.values()].filter((record) => Object.keys(record.measures).length > 0);
  if (!records.length) throw new Error("MBIE ADP response contains no supported latest-month accommodation rows");
  return records.sort((left, right) => {
    const propertyOrder = Number(right.property === "Total") - Number(left.property === "Total");
    return propertyOrder || left.areaType.localeCompare(right.areaType) || left.area.localeCompare(right.area) || left.property.localeCompare(right.property);
  });
}

class MbieAccommodationAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "mbie",
    sourceName: "MBIE Accommodation Data Programme",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["teic.mbie.govt.nz"],
    adapterKey: "public:mbie:adp-csv-v1",
    accessMethod: "OFFICIAL_PUBLIC_CSV_RANGE",
    concurrencyLimit: 1,
    dailyBudget: 4,
    collectorVersion: "mbie-adp-range-fetch-v1",
    parserVersion: "mbie-adp-grouped-v1",
  };

  async discover(_request: PublicDiscoveryRequest, _context: AdapterContext): Promise<string[]> {
    return [MBIE_ADP_URL];
  }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const maxBytes = Math.min(context.collectionLimits?.maxBytes ?? 2_000_000, 2_000_000);
    const response = await fetch(reference, {
      headers: {
        accept: "text/csv",
        range: `bytes=-${maxBytes}`,
        "user-agent": "TymraMarketCollector/1.0",
      },
      signal: context.signal,
    });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `MBIE ADP returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    const content = await readBoundedText(response, maxBytes);
    let records: MbieAccommodationRecord[];
    try { records = parseMbieAccommodationTail(content); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : "MBIE ADP parsing failed", false); }
    const maxRecords = context.collectionLimits?.maxRecords ?? records.length;
    const fetchedAt = new Date();
    const contentRange = response.headers.get("content-range");
    return records.slice(0, maxRecords).map((record) => ({
      sourceId: "mbie",
      externalId: record.id,
      payload: { ...record, sourceUrl: MBIE_ADP_URL, contentRange },
      fetchedAt,
      fixture: false,
    }));
  }

  async normalise(records: PublicRawRecord[], _context: AdapterContext): Promise<PublicSignal[]> {
    return records.map((raw) => {
      const record = raw.payload as MbieAccommodationRecord & { sourceUrl?: string; contentRange?: string | null };
      const startsAt = new Date(`${record.period}T00:00:00.000Z`);
      const endsAt = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth() + 1, 1));
      const occupancy = numericMeasure(record.measures, "Occupancy rate");
      const quality = String(record.measures["Quality indicator"]?.value ?? "Unknown");
      return {
        sourceId: "mbie",
        externalId: record.id,
        marketKey: marketKeyForMbieArea(record.area),
        type: "TOURISM_DEMAND",
        title: `MBIE accommodation demand: ${record.area} (${record.property})`,
        region: record.area,
        startsAt,
        endsAt,
        direction: occupancy === null ? "UNKNOWN" : occupancy >= 0.7 ? "POSITIVE" : occupancy <= 0.35 ? "NEGATIVE" : "MIXED",
        confidence: quality === "High" ? 0.9 : quality === "Medium" ? 0.75 : quality === "Low" ? 0.55 : 0.3,
        evidenceRef: `${MBIE_ADP_URL}#${record.id}`,
        metadata: {
          dataset: "Accommodation Data Programme (ADP) All Measures",
          period: record.period,
          areaType: record.areaType,
          property: record.property,
          measures: record.measures,
          contentRange: record.contentRange ?? null,
        },
        fixture: false,
      };
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(MBIE_ADP_URL, { method: "HEAD", signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `MBIE ADP CSV returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "MBIE ADP health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

  rightsMetadata(): SourceRights {
    return reviewPublicRights("Official MBIE Tourism Evidence and Insights Centre ADP CSV; production use remains subject to source-governance approval");
  }
}

class RbnzFxBrowserAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "fx_rates",
    sourceName: "Reserve Bank of New Zealand B1 exchange rates",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.rbnz.govt.nz", "rbnz.govt.nz"],
    adapterKey: "public:fx_rates:rbnz-browser-v1",
    accessMethod: "OFFICIAL_PUBLIC_HTML_BROWSER",
    concurrencyLimit: 1,
    dailyBudget: 4,
    collectorVersion: "rbnz-browser-fetch-v1",
    parserVersion: "rbnz-b1-table-v1",
  };

  async discover(): Promise<string[]> {
    throw new AdapterError("CONFIGURATION_ERROR", "RBNZ B1 collection is orchestrated by Argus", false);
  }

  async fetch(): Promise<PublicRawRecord[]> {
    throw new AdapterError("CONFIGURATION_ERROR", "RBNZ B1 collection is orchestrated by Argus", false);
  }

  async normalise(): Promise<PublicSignal[]> { return []; }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(new URL("/robots.txt", RBNZ_B1_URL), { headers: { accept: "text/plain" }, signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok || response.status === 403 ? "DEGRADED" : "DOWN", checkedAt: new Date(), message: `RBNZ public web returned HTTP ${response.status}; browser collection is required`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "RBNZ public web health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

  rightsMetadata(): SourceRights {
    return reviewPublicRights("Official RBNZ B1 public statistics page and data-file index; production use remains subject to source-governance approval");
  }
}

type StatsNzMetric = {
  description: string;
  rawValue: string;
  value: number;
  period: string;
  unit: "COUNT" | "PERCENT";
};

type StatsNzInternationalTravelRecord = {
  id: string;
  name: string;
  observationStart: string;
  observationEnd: string;
  pageDate: string | null;
  lastUpdatedDate: string | null;
  nextUpdatedDate: string | null;
  metrics: StatsNzMetric[];
  indicator: Record<string, unknown>;
  pageData: Record<string, unknown>;
};

export function parseStatsNzInternationalTravel(html: string): StatsNzInternationalTravelRecord {
  const { document } = parseHTML(html);
  const serialized = document.querySelector("#pageViewData")?.getAttribute("data-value");
  if (!serialized) throw new Error("Stats NZ page has no pageViewData payload");
  let pageData: Record<string, unknown>;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!isRecord(parsed)) throw new Error("pageViewData is not an object");
    pageData = parsed;
  } catch (error) {
    throw new Error(`Stats NZ pageViewData is invalid JSON: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const indicator = isRecord(pageData.FeaturedMedia) ? pageData.FeaturedMedia : null;
  if (!indicator) throw new Error("Stats NZ page has no featured international-travel indicator");
  const name = cleanText(stringValue(indicator.Name));
  const period = cleanText(stringValue(indicator.Period));
  const periodEnd = parseLongEnglishDate(period.match(/ended\s+(\d{1,2}\s+[A-Za-z]+\s+20\d{2})/i)?.[1]);
  if (!name || !periodEnd) throw new Error("Stats NZ international-travel indicator has no supported name or period");
  const metrics = [1, 2, 3].flatMap((index): StatsNzMetric[] => {
    const suffix = index === 1 ? "" : String(index);
    const rawValue = cleanText(stringValue(indicator[`Value${suffix}`]));
    const description = cleanText(stringValue(indicator[`IndicatorDescription${suffix}`]));
    const metricPeriod = cleanText(stringValue(indicator[`Period${suffix}`]));
    const numeric = Number(rawValue.replace(/[% ,]/g, ""));
    if (!rawValue || !description || !metricPeriod || !Number.isFinite(numeric)) return [];
    return [{ description, rawValue, value: numeric, period: metricPeriod, unit: rawValue.includes("%") ? "PERCENT" : "COUNT" }];
  });
  if (!metrics.length) throw new Error("Stats NZ international-travel indicator has no numeric metrics");
  const observationStart = addUtcDays(periodEnd, -27);
  return {
    id: `international-travel:${isoDate(periodEnd)}:overseas-visitor-arrivals`,
    name,
    observationStart: isoDate(observationStart),
    observationEnd: isoDate(periodEnd),
    pageDate: nullableIsoInstant(stringValue(pageData.PageDate)),
    lastUpdatedDate: nullableIsoDate(stringValue(indicator.LastUpdatedDate)),
    nextUpdatedDate: nullableIsoDate(stringValue(indicator.NextUpdatedDate)),
    metrics,
    indicator,
    pageData,
  };
}

class StatsNzInternationalTravelAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "stats_nz",
    sourceName: "Stats NZ international travel (provisional)",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.stats.govt.nz", "stats.govt.nz"],
    adapterKey: "public:stats_nz:international-travel-v1",
    accessMethod: "OFFICIAL_PUBLIC_HTML_EMBEDDED_JSON",
    concurrencyLimit: 1,
    dailyBudget: 8,
    collectorVersion: "stats-nz-html-fetch-v1",
    parserVersion: "stats-nz-international-travel-v1",
  };

  async discover(): Promise<string[]> { return [STATS_NZ_INTERNATIONAL_TRAVEL_URL]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const response = await fetch(reference, { headers: { accept: "text/html", "user-agent": "TymraMarketCollector/1.0" }, signal: context.signal });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `Stats NZ returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    const html = await readBoundedText(response, Math.min(context.collectionLimits?.maxBytes ?? 2_000_000, 2_000_000));
    let record: StatsNzInternationalTravelRecord;
    try { record = parseStatsNzInternationalTravel(html); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : "Stats NZ parsing failed", false); }
    return [{ sourceId: "stats_nz", externalId: record.id, payload: { ...record, sourceUrl: STATS_NZ_INTERNATIONAL_TRAVEL_URL }, fetchedAt: new Date(), fixture: false }];
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.map((raw) => {
      const record = raw.payload as StatsNzInternationalTravelRecord;
      const annualChange = record.metrics.find((metric) => metric.unit === "PERCENT" && /previous year/i.test(metric.description));
      return {
        sourceId: "stats_nz",
        externalId: record.id,
        marketKey: "new-zealand",
        type: "TOURISM_DEMAND",
        title: `Stats NZ tourism demand: ${record.name}`,
        region: "New Zealand",
        startsAt: new Date(`${record.observationStart}T00:00:00.000Z`),
        endsAt: addUtcDays(new Date(`${record.observationEnd}T00:00:00.000Z`), 1),
        direction: !annualChange ? "UNKNOWN" : annualChange.value > 0 ? "POSITIVE" : annualChange.value < 0 ? "NEGATIVE" : "MIXED",
        confidence: 0.85,
        evidenceRef: `${STATS_NZ_INTERNATIONAL_TRAVEL_URL}#featured-indicator`,
        metadata: {
          dataset: "International travel (provisional)",
          observationStart: record.observationStart,
          observationEnd: record.observationEnd,
          pageDate: record.pageDate,
          lastUpdatedDate: record.lastUpdatedDate,
          nextUpdatedDate: record.nextUpdatedDate,
          metrics: record.metrics,
          indicator: record.indicator,
        },
        fixture: false,
      };
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(STATS_NZ_INTERNATIONAL_TRAVEL_URL, { method: "HEAD", signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `Stats NZ indicator returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "Stats NZ health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

  rightsMetadata(): SourceRights {
    return reviewPublicRights("Official Stats NZ international-travel indicator; production use remains subject to source-governance approval and attribution review");
  }
}

type NztaDelayFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: Record<string, unknown> | null;
};

type NztaDelayRecord = {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
  feature: NztaDelayFeature;
};

export function parseNztaDelays(payload: unknown, range?: { from: Date; to: Date }): NztaDelayRecord[] {
  if (!isRecord(payload) || payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error("NZTA Journey Planner response is not a GeoJSON FeatureCollection");
  }
  const records = payload.features.flatMap((candidate): NztaDelayRecord[] => {
    if (!isRecord(candidate) || candidate.type !== "Feature" || !isRecord(candidate.properties)) return [];
    const status = cleanText(stringValue(candidate.properties.Status));
    if (status && !["Active", "Scheduled"].includes(status)) return [];
    const externalId = stringValue(candidate.properties.ExternalId ?? candidate.properties.id ?? candidate.properties.uniq);
    if (!externalId) return [];
    const startsAt = parseNewZealandLocalDate(stringValue(candidate.properties.StartDate));
    const endsAt = parseNewZealandLocalDate(stringValue(candidate.properties.EndDate ?? candidate.properties.ExpectedResolutionDate));
    if (range && startsAt && startsAt > range.to) return [];
    if (range && endsAt && endsAt < range.from) return [];
    const geometry = candidate.geometry === null || isRecord(candidate.geometry) ? candidate.geometry as Record<string, unknown> | null : null;
    return [{
      id: `nzta-road-event:${externalId}`,
      startsAt: startsAt?.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
      feature: { type: "Feature", properties: candidate.properties, geometry },
    }];
  });
  if (!records.length) throw new Error("NZTA Journey Planner response has no supported active or scheduled road events");
  return records.sort((left, right) => nztaPriority(right) - nztaPriority(left)
    || String(right.feature.properties.LastEdited ?? "").localeCompare(String(left.feature.properties.LastEdited ?? ""))
    || left.id.localeCompare(right.id));
}

class NztaJourneyPlannerAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "nzta",
    sourceName: "NZTA Journey Planner road events",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.journeys.nzta.govt.nz", "journeys.nzta.govt.nz"],
    adapterKey: "public:nzta:journey-planner-delays-v1",
    accessMethod: "OFFICIAL_PUBLIC_GEOJSON",
    concurrencyLimit: 1,
    dailyBudget: 96,
    collectorVersion: "nzta-journey-planner-fetch-v1",
    parserVersion: "nzta-delays-geojson-v1",
  };

  async discover(): Promise<string[]> { return [NZTA_DELAYS_URL]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const maxBytes = Math.min(context.collectionLimits?.maxBytes ?? 2_000_000, 2_000_000);
    const response = await fetch(reference, { headers: { accept: "application/geo+json,application/json", "user-agent": "TymraMarketCollector/1.0" }, signal: context.signal });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `NZTA Journey Planner returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    const content = await readBoundedText(response, maxBytes);
    let records: NztaDelayRecord[];
    try { records = parseNztaDelays(JSON.parse(content) as unknown, context.collectionRange); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : "NZTA Journey Planner parsing failed", false); }
    const maxRecords = context.collectionLimits?.maxRecords ?? records.length;
    const fetchedAt = new Date();
    return records.slice(0, maxRecords).map((record) => ({ sourceId: "nzta", externalId: record.id, payload: { ...record, sourceUrl: NZTA_DELAYS_URL }, fetchedAt, fixture: false }));
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.map((raw) => {
      const record = raw.payload as NztaDelayRecord;
      const properties = record.feature.properties;
      const startsAt = record.startsAt ? new Date(record.startsAt) : raw.fetchedAt;
      const parsedEnd = record.endsAt ? new Date(record.endsAt) : null;
      const endsAt = parsedEnd && parsedEnd > startsAt ? parsedEnd : addUtcDays(startsAt, 1);
      const eventType = cleanText(stringValue(properties.EventType ?? properties.type));
      const impact = cleanText(stringValue(properties.Impact));
      const isCritical = Number(properties.IsCritical ?? 0) === 1;
      return {
        sourceId: "nzta",
        externalId: record.id,
        marketKey: "new-zealand",
        type: "WEATHER_OR_ACCESS_DISRUPTION",
        title: cleanText(stringValue(properties.Name)) || `NZTA road event: ${eventType || "traffic disruption"}`,
        region: cleanText(stringValue(properties.EventIsland)) || "New Zealand",
        startsAt,
        endsAt,
        direction: eventType === "News" ? "UNKNOWN" : "NEGATIVE",
        confidence: isCritical ? 0.95 : String(properties.Status) === "Scheduled" || Number(properties.IsPlanned ?? 0) === 1 ? 0.8 : 0.9,
        evidenceRef: `${NZTA_DELAYS_URL}#${record.id}`,
        metadata: {
          sourceDataset: "NZTA Journey Planner delays",
          eventType,
          impact,
          status: properties.Status ?? null,
          isCritical,
          isPlanned: Number(properties.IsPlanned ?? 0) === 1,
          properties,
          geometry: record.feature.geometry,
          sourceTimezone: "Pacific/Auckland",
        },
        fixture: false,
      };
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(NZTA_DELAYS_URL, { method: "HEAD", signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `NZTA Journey Planner GeoJSON returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "NZTA Journey Planner health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

  rightsMetadata(): SourceRights {
    return reviewPublicRights("Official NZTA Journey Planner public GeoJSON; production use remains subject to source-governance approval and attribution review");
  }
}

type MetServiceCapFeedItem = {
  title: string;
  link: string;
  description: string | null;
  pubDate: string | null;
  guid: string | null;
};

type MetServiceCapFeed = {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  lastBuildDate: string | null;
  copyright: string | null;
  items: MetServiceCapFeedItem[];
};

export function metServiceFeedItemVersion(item: Pick<MetServiceCapFeedItem, "guid" | "pubDate">) {
  return `${item.guid ?? ""}|${item.pubDate ?? ""}`;
}

export function changedMetServiceFeedItems(items: MetServiceCapFeedItem[], knownReferenceVersions: Readonly<Record<string, string>> = {}) {
  return items.filter((item) => knownReferenceVersions[item.link] !== metServiceFeedItemVersion(item));
}

type MetServiceCapInfo = {
  language: string | null;
  category: string[];
  event: string;
  responseType: string[];
  urgency: string | null;
  severity: string | null;
  certainty: string | null;
  effective: string | null;
  onset: string | null;
  expires: string | null;
  senderName: string | null;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  web: string | null;
  parameters: Record<string, string[]>;
  areas: Array<{ areaDesc: string; polygons: string[] }>;
};

type MetServiceCapAlert = {
  identifier: string;
  sender: string;
  sent: string;
  status: string;
  msgType: string;
  scope: string;
  references: string | null;
  infos: MetServiceCapInfo[];
};

export function parseMetServiceCapFeed(xml: string): MetServiceCapFeed {
  const document = parseXml(xml, "MetService CAP RSS");
  const channel = document.querySelector("channel");
  if (!channel) throw new Error("MetService CAP RSS has no channel");
  const items = [...channel.querySelectorAll("item")].flatMap((item): MetServiceCapFeedItem[] => {
    const title = xmlText(item, "title");
    const link = xmlText(item, "link");
    if (!title || !isAllowedHttpsUrl(link, ["alerts.metservice.com"])) return [];
    return [{
      title,
      link,
      description: xmlText(item, "description") || null,
      pubDate: nullableIsoTimestamp(xmlText(item, "pubDate")),
      guid: xmlText(item, "guid") || null,
    }];
  });
  return {
    title: xmlText(channel, "title") || "MetService New Zealand Weather Warnings",
    link: xmlText(channel, "link") || "https://alerts.metservice.com/",
    description: xmlText(channel, "description"),
    pubDate: nullableIsoTimestamp(xmlText(channel, "pubDate")),
    lastBuildDate: nullableIsoTimestamp(xmlText(channel, "lastBuildDate")),
    copyright: xmlText(channel, "copyright") || null,
    items,
  };
}

export function parseMetServiceCapAlert(xml: string): MetServiceCapAlert {
  const document = parseXml(xml, "MetService CAP alert");
  const alert = document.querySelector("alert");
  if (!alert) throw new Error("MetService CAP document has no alert");
  const identifier = xmlText(alert, "identifier");
  const sender = xmlText(alert, "sender");
  const sent = requiredIsoTimestamp(xmlText(alert, "sent"), "sent");
  const status = xmlText(alert, "status");
  const msgType = xmlText(alert, "msgType");
  const scope = xmlText(alert, "scope");
  if (!identifier || !sender || !status || !msgType || !scope) throw new Error("MetService CAP alert is missing required identity fields");
  const infos = [...alert.querySelectorAll("info")].flatMap((info): MetServiceCapInfo[] => {
    const event = xmlText(info, "event");
    if (!event) return [];
    const parameters: Record<string, string[]> = {};
    for (const parameter of info.querySelectorAll("parameter")) {
      const name = xmlText(parameter, "valueName");
      const value = xmlText(parameter, "value");
      if (!name || !value) continue;
      parameters[name] = [...(parameters[name] ?? []), value];
    }
    const areas = [...info.querySelectorAll("area")].flatMap((area) => {
      const areaDesc = xmlText(area, "areaDesc");
      return areaDesc ? [{ areaDesc, polygons: xmlTexts(area, "polygon") }] : [];
    });
    return [{
      language: xmlText(info, "language") || null,
      category: xmlTexts(info, "category"),
      event,
      responseType: xmlTexts(info, "responseType"),
      urgency: xmlText(info, "urgency") || null,
      severity: xmlText(info, "severity") || null,
      certainty: xmlText(info, "certainty") || null,
      effective: nullableIsoTimestamp(xmlText(info, "effective")),
      onset: nullableIsoTimestamp(xmlText(info, "onset")),
      expires: nullableIsoTimestamp(xmlText(info, "expires")),
      senderName: xmlText(info, "senderName") || null,
      headline: xmlText(info, "headline") || null,
      description: xmlText(info, "description") || null,
      instruction: xmlText(info, "instruction") || null,
      web: safeOptionalHttpsUrl(xmlText(info, "web")),
      parameters,
      areas,
    }];
  });
  if (!infos.length) throw new Error("MetService CAP alert has no supported info block");
  return { identifier, sender, sent, status, msgType, scope, references: xmlText(alert, "references") || null, infos };
}

class MetServiceCapAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "metservice",
    sourceName: "MetService Common Alerting Protocol feed",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["alerts.metservice.com", "www.metservice.com", "metservice.com"],
    adapterKey: "public:metservice:cap-rss-v1",
    accessMethod: "OFFICIAL_PUBLIC_CAP_RSS",
    concurrencyLimit: 1,
    dailyBudget: 288,
    collectorVersion: "metservice-cap-rss-fetch-v1",
    parserVersion: "metservice-cap-1.2-v1",
  };

  async discover(): Promise<string[]> { return [METSERVICE_CAP_RSS_URL]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const maxBytes = Math.min(context.collectionLimits?.maxBytes ?? 2_000_000, 2_000_000);
    const response = await fetch(reference, { headers: { accept: "application/rss+xml,application/xml,text/xml", "user-agent": "TymraMarketCollector/1.0" }, signal: context.signal });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `MetService CAP RSS returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    const xml = await readBoundedText(response, maxBytes);
    let feed: MetServiceCapFeed;
    try { feed = parseMetServiceCapFeed(xml); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : "MetService CAP RSS parsing failed", false); }
    const fetchedAt = new Date();
    const records: PublicRawRecord[] = [{
      sourceId: "metservice",
      externalId: `cap-feed:${feed.lastBuildDate ?? feed.pubDate ?? isoDate(fetchedAt)}`,
      payload: { kind: "cap_feed", sourceUrl: METSERVICE_CAP_RSS_URL, feed, rawXml: xml },
      fetchedAt,
      fixture: false,
      networkRequestCount: 1,
    }];
    const detailBudget = context.collectionLimits ? Math.max(0, context.collectionLimits.maxRequests - 1) : feed.items.length;
    const maxRecords = context.collectionLimits?.maxRecords ?? Number.POSITIVE_INFINITY;
    const candidates = changedMetServiceFeedItems(feed.items, context.collectionState?.knownReferenceVersions);
    records[0]!.networkRequestsAvoided = feed.items.length - candidates.length;
    for (const item of candidates.slice(0, Math.min(detailBudget, Math.max(0, maxRecords - 1)))) {
      const detailResponse = await fetch(item.link, { headers: { accept: "application/cap+xml,application/xml,text/xml", "user-agent": "TymraMarketCollector/1.0" }, signal: context.signal });
      if (!detailResponse.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `MetService CAP alert returned HTTP ${detailResponse.status}`, detailResponse.status >= 500 || detailResponse.status === 429);
      const alertXml = await readBoundedText(detailResponse, maxBytes);
      let alert: MetServiceCapAlert;
      try { alert = parseMetServiceCapAlert(alertXml); }
      catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : "MetService CAP alert parsing failed", false); }
      records.push({ sourceId: "metservice", externalId: `cap-alert:${alert.identifier}`, payload: { kind: "cap_alert", sourceUrl: item.link, feedItem: item, alert, rawXml: alertXml }, fetchedAt, fixture: false, networkRequestCount: 1 });
    }
    return records;
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((raw): PublicSignal[] => {
      if (!isRecord(raw.payload) || raw.payload.kind !== "cap_alert" || !isRecord(raw.payload.alert)) return [];
      const alert = raw.payload.alert as unknown as MetServiceCapAlert;
      const info = alert.infos[0];
      if (!info) return [];
      const startsAt = parseIsoTimestamp(info.onset ?? info.effective ?? alert.sent) ?? raw.fetchedAt;
      const parsedEnd = parseIsoTimestamp(info.expires);
      const endsAt = parsedEnd && parsedEnd > startsAt ? parsedEnd : addUtcDays(startsAt, 1);
      const region = info.areas.map((area) => area.areaDesc).join("; ") || "New Zealand";
      return [{
        sourceId: "metservice",
        externalId: `cap-alert:${alert.identifier}`,
        marketKey: "new-zealand",
        type: "WEATHER_OR_ACCESS_DISRUPTION",
        title: info.headline || info.event,
        region,
        startsAt,
        endsAt,
        direction: "NEGATIVE",
        confidence: metServiceConfidence(info.severity, info.certainty),
        evidenceRef: stringValue(raw.payload.sourceUrl) || METSERVICE_CAP_RSS_URL,
        metadata: {
          sourceFormat: "OASIS CAP 1.2",
          attribution: info.senderName || alert.sender,
          alert,
          feedItem: isRecord(raw.payload.feedItem) ? raw.payload.feedItem : null,
        },
        fixture: false,
      }];
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(METSERVICE_CAP_RSS_URL, { headers: { accept: "application/rss+xml,application/xml,text/xml" }, signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `MetService CAP RSS returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "MetService CAP RSS health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

  rightsMetadata(): SourceRights {
    return reviewPublicRights("Official MetService CAP RSS feed, licensed CC BY 4.0 and subject to the New Zealand CAP Code of Practice");
  }
}

class EventfindaWebAdapter implements PublicDataAdapter {
  readonly metadata = {
    sourceId: "eventfinda",
    sourceName: "Eventfinda New Zealand",
    sourceType: "PUBLIC_DATA" as const,
    supportedDomains: ["www.eventfinda.co.nz", "eventfinda.co.nz"],
    adapterKey: "public:eventfinda:http-v1",
    accessMethod: "PUBLIC_HTTP_HTML_JSONLD",
    concurrencyLimit: 1,
    dailyBudget: 2_500,
    collectorVersion: "eventfinda-http-v1",
    parserVersion: "eventfinda-jsonld-v1",
  };

  async discover(): Promise<string[]> {
    throw new AdapterError("CONFIGURATION_ERROR", "Eventfinda discovery is orchestrated by the HTTP crawl frontier", false);
  }

  async fetch(): Promise<PublicRawRecord[]> {
    throw new AdapterError("CONFIGURATION_ERROR", "Eventfinda fetch is orchestrated by the HTTP crawl frontier", false);
  }

  async normalise(): Promise<PublicSignal[]> { return []; }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch("https://www.eventfinda.co.nz/robots.txt", { headers: { accept: "text/plain" }, signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : response.status === 429 ? "DEGRADED" : "DOWN", checkedAt: new Date(), message: `Eventfinda public web returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "Eventfinda public web health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

  rightsMetadata(): SourceRights {
    return reviewPublicRights("Nationwide discovery and bounded detail persistence are verified in development; production activation and long-running stability acceptance remain separate gates");
  }
}

class TicketmasterWebAdapter implements PublicDataAdapter {
  readonly metadata = {
    sourceId: "ticketmaster",
    sourceName: "Ticketmaster New Zealand",
    sourceType: "PUBLIC_DATA" as const,
    supportedDomains: ["www.ticketmaster.co.nz", "ticketmaster.co.nz"],
    adapterKey: "public:ticketmaster:http-listing-argus-detail-v1",
    accessMethod: "PUBLIC_HTTP_LISTING_ARGUS_DETAIL",
    concurrencyLimit: 1,
    dailyBudget: 20,
    collectorVersion: "ticketmaster-hybrid-v1",
    parserVersion: "ticketmaster-jsonld-v1",
  };

  async discover(): Promise<string[]> {
    throw new AdapterError("CONFIGURATION_ERROR", "Ticketmaster discovery is orchestrated by the HTTP crawl frontier", false);
  }

  async fetch(): Promise<PublicRawRecord[]> {
    throw new AdapterError("CONFIGURATION_ERROR", "Ticketmaster listing capture is orchestrated by the hybrid crawl frontier", false);
  }

  async normalise(): Promise<PublicSignal[]> { return []; }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch("https://www.ticketmaster.co.nz/robots.txt", { headers: { accept: "text/plain" }, signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : response.status === 429 ? "DEGRADED" : "DOWN", checkedAt: new Date(), message: `Ticketmaster public web returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "Ticketmaster public web health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

  rightsMetadata(): SourceRights {
    return reviewPublicRights("Direct HTTP city-listing collection is implemented; Argus is used only for selectively required detail pages; production remains gated by source review and explicit activation");
  }
}

class ArgusEventWebAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata;

  constructor(
    sourceId: "school_sport_nz" | "school_sport_canterbury" | "ticketek_events",
    sourceName: string,
    supportedDomains: string[],
    private readonly healthUrl: string,
    connector: "sporty-school-sport-public" | "ticketek-public",
    dailyBudget: number,
  ) {
    this.metadata = {
      sourceId,
      sourceName,
      sourceType: "PUBLIC_DATA",
      supportedDomains,
      adapterKey: `public:${sourceId}:argus-v1`,
      accessMethod: "PUBLIC_WEB_ARGUS_READ_ONLY",
      concurrencyLimit: 1,
      dailyBudget,
      collectorVersion: `${connector}-1.0.0`,
      parserVersion: `${connector}-1.0.0`,
    };
  }

  async discover(): Promise<string[]> {
    throw new AdapterError("CONFIGURATION_ERROR", `${this.metadata.sourceName} collection is orchestrated by Argus`, false);
  }

  async fetch(): Promise<PublicRawRecord[]> {
    throw new AdapterError("CONFIGURATION_ERROR", `${this.metadata.sourceName} collection is orchestrated by Argus`, false);
  }

  async normalise(): Promise<PublicSignal[]> { return []; }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(this.healthUrl, { method: "HEAD", redirect: "manual", signal: context.signal ?? AbortSignal.timeout(10_000) });
      const reachable = response.status > 0 && response.status < 500;
      return {
        status: reachable ? "DEGRADED" : "DOWN",
        checkedAt: new Date(),
        message: `${this.metadata.sourceName} public route returned HTTP ${response.status}; Argus readiness is authoritative`,
        latencyMs: Date.now() - started,
        mode: context.mode,
      };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : `${this.metadata.sourceName} health check failed`, latencyMs: Date.now() - started, mode: context.mode };
    }
  }

  rightsMetadata(): SourceRights {
    return reviewPublicRights(`${this.metadata.sourceName} uses a fixed, read-only Argus connector; production use remains subject to source-governance approval`);
  }
}

export const publicDataAdapters: Record<string, PublicDataAdapter> = {
  public_holidays_nz: new OfficialHtmlCalendarAdapter("public_holidays_nz", "Employment New Zealand public holidays", "https://www.employment.govt.nz/leave-and-holidays/public-holidays/public-holidays-and-anniversary-dates", parseEmploymentPublicHolidays),
  school_holidays_nz: new OfficialHtmlCalendarAdapter("school_holidays_nz", "Ministry of Education school holidays", "https://www.education.govt.nz/school/school-terms-and-holidays", parseEducationSchoolHolidays),
  geonet: new GeoNetAdapter(),
  mbie: new MbieAccommodationAdapter(),
  stats_nz: new StatsNzInternationalTravelAdapter(),
  nzta: new NztaJourneyPlannerAdapter(),
  metservice: new MetServiceCapAdapter(),
  fx_rates: new RbnzFxBrowserAdapter(),
  ticketmaster: new TicketmasterWebAdapter(),
  eventfinda: new EventfindaWebAdapter(),
  school_sport_nz: new ArgusEventWebAdapter("school_sport_nz", "School Sport New Zealand", ["www.sporty.co.nz"], "https://www.sporty.co.nz/SSNZ/Sport-1/Events", "sporty-school-sport-public", 4),
  school_sport_canterbury: new ArgusEventWebAdapter("school_sport_canterbury", "School Sport Canterbury", ["www.sporty.co.nz", "teamup.com"], "https://www.sporty.co.nz/sscanterbury", "sporty-school-sport-public", 4),
  ticketek_events: new ArgusEventWebAdapter("ticketek_events", "Ticketek New Zealand Events", ["www.ticketek.co.nz", "premier.ticketek.co.nz"], "https://premier.ticketek.co.nz/shows/whatson.aspx", "ticketek-public", 20),
  ...officialNzSourceAdapters,
  ...christchurchEventAdapters,
  ...christchurchDemandAdapters,
  ...christchurchPriorityAdapters,
  ...publicEventPlatformAdapters,
};

function calendarTableRows(table: Element): string[][] {
  return [...table.querySelectorAll("tr")].slice(1).map((row) => [...row.querySelectorAll("th,td")].map((cell) => cleanText(cell.textContent))).filter((row) => row.length >= 3 && row[0] && row[2]);
}

function calendarRecord(year: number, title: string, region: string, observed: string, type: CalendarRecord["type"]): CalendarRecord | null {
  const start = parseObservedDate(observed, year);
  if (!start) return null;
  return {
    id: `${type.toLowerCase()}:${year}:${slug(`${region}:${title}`)}`,
    title,
    region,
    startsAt: isoDate(start),
    endsAt: isoDate(addUtcDays(start, 1)),
    type,
  };
}

function parseDateRange(value: string, year: number): { start: Date; end: Date } | null {
  const match = value.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+([A-Za-z]+)\s+to\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+([A-Za-z]+)(?:\s+(20\d{2}))?/i);
  if (!match) return null;
  const effectiveYear = Number(match[5] ?? year);
  const start = dateFromParts(effectiveYear, match[2]!, Number(match[1]));
  const end = dateFromParts(effectiveYear, match[4]!, Number(match[3]));
  return start && end ? { start, end } : null;
}

function parseObservedDate(value: string, year: number): Date | null {
  const match = cleanText(value).match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+([A-Za-z]+)/i);
  return match ? dateFromParts(year, match[2]!, Number(match[1])) : null;
}

function dateFromParts(year: number, monthName: string, day: number): Date | null {
  const month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(monthName.toLowerCase());
  if (month < 0 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}

function parseMbieMonth(value: string | undefined): Date | null {
  const match = value?.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLongEnglishDate(value: string | undefined): Date | null {
  const match = value?.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/);
  return match ? dateFromParts(Number(match[3]), match[2]!, Number(match[1])) : null;
}

function parseNewZealandLocalDate(value: string): Date | null {
  const match = value.match(/^(20\d{2})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const naive = Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!, parts[3]!, parts[4]!, parts[5]!);
  let instant = new Date(naive);
  for (let index = 0; index < 2; index += 1) instant = new Date(naive - timeZoneOffsetMs(instant, "Pacific/Auckland"));
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function timeZoneOffsetMs(value: Date, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-NZ", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - value.getTime();
}

function nullableIsoInstant(value: string): string | null {
  return parseNewZealandLocalDate(value)?.toISOString() ?? null;
}

function nullableIsoDate(value: string): string | null {
  const parsed = parseLongEnglishDate(cleanText(value));
  return parsed ? isoDate(parsed) : null;
}

function nztaPriority(record: NztaDelayRecord): number {
  const properties = record.feature.properties;
  if (Number(properties.IsCritical ?? 0) === 1) return 5;
  if (/closed/i.test(stringValue(properties.Impact))) return 4;
  if (/delay|restriction/i.test(stringValue(properties.Impact))) return 3;
  if (String(properties.Status) === "Active") return 2;
  return 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseXml(xml: string, sourceName: string) {
  const document = new DOMParser().parseFromString(xml, "text/xml");
  if (!document || document.querySelector("parsererror")) throw new Error(`${sourceName} is not valid XML`);
  return document;
}

type XmlParent = {
  querySelector(selector: string): { textContent: string | null } | null;
  querySelectorAll(selector: string): Iterable<{ textContent: string | null }>;
};

function xmlText(parent: unknown, tagName: string): string {
  return cleanText((parent as XmlParent).querySelector(tagName)?.textContent ?? "");
}

function xmlTexts(parent: unknown, tagName: string): string[] {
  return [...(parent as XmlParent).querySelectorAll(tagName)].map((element) => cleanText(element.textContent ?? "")).filter(Boolean);
}

function parseIsoTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function requiredIsoTimestamp(value: string, field: string): string {
  const parsed = parseIsoTimestamp(value);
  if (!parsed) throw new Error(`MetService CAP alert has invalid ${field}`);
  return parsed.toISOString();
}

function nullableIsoTimestamp(value: string): string | null {
  return parseIsoTimestamp(value)?.toISOString() ?? null;
}

function safeOptionalHttpsUrl(value: string): string | null {
  if (!value) return null;
  try { return new URL(value).protocol === "https:" ? value : null; }
  catch { return null; }
}

function isAllowedHttpsUrl(value: string, hosts: string[]): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hosts.includes(url.hostname.toLowerCase());
  } catch { return false; }
}

function metServiceConfidence(severity: string | null, certainty: string | null): number {
  const severityScore: Record<string, number> = { Extreme: 0.98, Severe: 0.95, Moderate: 0.85, Minor: 0.7, Unknown: 0.5 };
  const certaintyAdjustment: Record<string, number> = { Observed: 0.02, Likely: 0, Possible: -0.1, Unlikely: -0.2, Unknown: -0.25 };
  return Math.max(0.2, Math.min(1, (severityScore[severity ?? "Unknown"] ?? 0.5) + (certaintyAdjustment[certainty ?? "Unknown"] ?? -0.1)));
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function numericMeasure(measures: Record<string, MbieMeasure>, name: string): number | null {
  const value = measures[name]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function marketKeyForMbieArea(area: string): string {
  return slug(area.replace(/\s+(RTO|District|City|Territory)$/i, "")) || "new-zealand";
}

function addUtcDays(value: Date, days: number) { return new Date(value.getTime() + days * 86_400_000); }
function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function cleanText(value: string) { return value.replace(/\s+/g, " ").trim(); }
function slug(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

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

function allowedPublicRights(basis: string): SourceRights {
  return {
    internalApprovalStatus: "APPROVED",
    legalRightsStatus: "ALLOWED",
    lifecycle: "PILOT",
    environments: ["DEVELOPMENT", "TEST", "PILOT"],
    allowedUsage: ["COLLECTION", "NORMALISATION", "DERIVED_ANALYSIS", "ATTRIBUTED_DISPLAY"],
    displayPermission: true,
    derivedAnalysisPermission: true,
    retentionPolicy: { rawHours: 72, parserFailureHours: 168, normalizedDays: null },
    basis,
  };
}

function reviewPublicRights(basis: string): SourceRights {
  return {
    internalApprovalStatus: "PENDING",
    legalRightsStatus: "REVIEW",
    lifecycle: "RESEARCH",
    environments: ["DEVELOPMENT", "TEST"],
    allowedUsage: ["HEALTH_CHECK", "FIXTURE_CONTRACT_TEST"],
    displayPermission: false,
    derivedAnalysisPermission: false,
    retentionPolicy: { rawHours: 72, parserFailureHours: 168, normalizedDays: null },
    basis,
  };
}
