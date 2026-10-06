import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicRawRecord, PublicSignal } from "../adapter-types";
import { addNzCalendarDays, nzDateTime, nzStartOfDay } from "@tymra/domain";
import { AdapterError } from "../adapter-types";
import { parse } from "csv-parse/sync";
import { parseHTML } from "linkedom";
import { dateFromParts } from "./calendar";
import { isRecord, stringValue, addUtcDays, isoDate, cleanText, readBoundedText } from "./shared";

export const STATS_NZ_INTERNATIONAL_TRAVEL_URL = "https://www.stats.govt.nz/indicators/international-travel-provisional/";

export type StatsNzMetric = {
  description: string;
  rawValue: string;
  value: number;
  period: string;
  unit: "COUNT" | "PERCENT";
};

export type StatsNzInternationalTravelRecord = {
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

export class StatsNzInternationalTravelAdapter implements PublicDataAdapter {
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
    return records.map((raw): PublicSignal => {
      const record = raw.payload as StatsNzInternationalTravelRecord;
      const annualChange = record.metrics.find((metric) => metric.unit === "PERCENT" && /previous year/i.test(metric.description));
      return {
        sourceId: "stats_nz",
        externalId: record.id,
        marketKey: "new-zealand",
        type: "TOURISM_DEMAND",
        title: `Stats NZ tourism demand: ${record.name}`,
        region: "New Zealand",
        startsAt: nzStartOfDay(record.observationStart),
        endsAt: nzStartOfDay(addNzCalendarDays(record.observationEnd, 1)),
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

}

export function parseLongEnglishDate(value: string | undefined): Date | null {
  const match = value?.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/);
  return match ? dateFromParts(Number(match[3]), match[2]!, Number(match[1])) : null;
}

export function parseNewZealandLocalDate(value: string): Date | null {
  try { return nzDateTime(value.replace(" ", "T")); }
  catch { return null; }
}

export function nullableIsoInstant(value: string): string | null {
  return parseNewZealandLocalDate(value)?.toISOString() ?? null;
}

export function nullableIsoDate(value: string): string | null {
  const parsed = parseLongEnglishDate(cleanText(value));
  return parsed ? isoDate(parsed) : null;
}
