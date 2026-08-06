import { parseHTML } from "linkedom";

import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicRawRecord, PublicSignal } from "./adapter-types";
import { AdapterError } from "./adapter-types";
import type { NzMajorMarketKey } from "./nz-market-coverage";

type SkiSeasonSource = { resort: string; marketKey: NzMajorMarketKey; region: string; url: string; datePattern: RegExp; yearPattern?: RegExp };
type SkiSeasonRecord = { resort: string; marketKey: NzMajorMarketKey; region: string; opensAt: string; closesAt: string; sourceUrl: string };

const SOURCES: readonly SkiSeasonSource[] = [
  { resort: "The Remarkables", marketKey: "queenstown-wanaka", region: "Queenstown Lakes", url: "https://www.theremarkables.co.nz/plan", datePattern: /(\d{1,2}\s+[A-Za-z]+)\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+)\s+(20\d{2})/i },
  { resort: "Mt Hutt", marketKey: "christchurch", region: "Canterbury", url: "https://www.mthutt.co.nz/mountain-info", datePattern: /(\d{1,2}\s+[A-Za-z]+)\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+)\s+(20\d{2})/i },
  { resort: "Whakapapa", marketKey: "taupo", region: "Central North Island", url: "https://www.whakapapa.com/winter", datePattern: /\((\d{1,2}\s+[A-Za-z]+)\)\s+through to[^()]{0,80}\((\d{1,2}\s+[A-Za-z]+)\)/i, yearPattern: /Our\s+(20\d{2})\s+winter season/i },
] as const;

export function parseSkiSeasonHtml(html: string, source: SkiSeasonSource): SkiSeasonRecord {
  const { document } = parseHTML(html);
  const text = (document.documentElement.textContent ?? document.body.textContent ?? "").replace(/\s+/g, " ").trim();
  const match = text.match(source.datePattern);
  if (!match) throw new Error(`${source.resort} page has no supported season date range`);
  const year = Number(match[3] ?? (source.yearPattern ? text.match(source.yearPattern)?.[1] : undefined));
  const opensAt = parseNzDate(match[1]!, year);
  const closesAt = parseNzDate(match[2]!, year);
  if (!opensAt || !closesAt || closesAt < opensAt) throw new Error(`${source.resort} page has an invalid season date range`);
  return { resort: source.resort, marketKey: source.marketKey, region: source.region, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString(), sourceUrl: source.url };
}

class SkiSeasonAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "ski_seasons_nz", sourceName: "Official New Zealand ski season dates", sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.theremarkables.co.nz", "www.mthutt.co.nz", "www.whakapapa.com"], adapterKey: "public:nz-ski-seasons:official-html-v1",
    accessMethod: "OFFICIAL_PUBLIC_HTML", concurrencyLimit: 1, dailyBudget: SOURCES.length,
    collectorVersion: "nz-ski-season-fetch-v1", parserVersion: "nz-ski-season-date-range-v1",
  };

  async discover(): Promise<string[]> { return SOURCES.map((source) => source.url); }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const source = SOURCES.find((candidate) => candidate.url === reference);
    if (!source) throw new AdapterError("INVALID_INPUT", "Ski season reference is not configured", false);
    const response = await fetch(reference, { headers: { accept: "text/html,application/xhtml+xml", "accept-language": "en-NZ,en;q=0.9", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }, signal: context.signal ?? AbortSignal.timeout(30_000) });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `${source.resort} returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    const html = await response.text();
    const maxBytes = context.collectionLimits?.maxBytes ?? 5_000_000;
    if (Buffer.byteLength(html) > maxBytes) throw new AdapterError("PARSING_ERROR", `${source.resort} page exceeded ${maxBytes} bytes`, false);
    let season: SkiSeasonRecord;
    try { season = parseSkiSeasonHtml(html, source); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : `${source.resort} season parsing failed`, false); }
    return [{ sourceId: "ski_seasons_nz", externalId: `ski-season:${slug(source.resort)}:${season.opensAt.slice(0, 4)}`, payload: season, fetchedAt: new Date(), fixture: false, networkRequestCount: 1 }];
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((raw): PublicSignal[] => {
      if (!isRecord(raw.payload)) return [];
      const opensAt = new Date(stringValue(raw.payload.opensAt));
      const closingDay = new Date(stringValue(raw.payload.closesAt));
      if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closingDay.getTime())) return [];
      const closesAt = new Date(closingDay.getTime() + 86_400_000);
      const resort = stringValue(raw.payload.resort);
      return [{
        sourceId: "ski_seasons_nz", externalId: raw.externalId, marketKey: stringValue(raw.payload.marketKey), type: "TOURISM_DEMAND",
        title: `${resort} ski season`, region: stringValue(raw.payload.region), startsAt: opensAt, endsAt: closesAt,
        direction: "POSITIVE", confidence: 0.8, evidenceRef: stringValue(raw.payload.sourceUrl),
        metadata: { contextSeriesKey: `ski-season:${slug(resort)}`, temporalUse: "DETERMINISTIC_SEASON_WINDOW", resort, sourceTimezone: "Pacific/Auckland", weatherDependent: true }, fixture: false,
      }];
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(SOURCES[0]!.url, { method: "HEAD", signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `Official ski-season page returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "Ski-season health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

}

export const skiSeasonAdapters: Record<string, PublicDataAdapter> = { ski_seasons_nz: new SkiSeasonAdapter() };

function parseNzDate(value: string, year: number) {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (!match || !Number.isInteger(year)) return null;
  const month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(match[2]!.toLowerCase());
  const day = Number(match[1]);
  if (month < 0 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCDate() === day ? date : null;
}

function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
