import { randomUUID } from "node:crypto";
import { parseHTML } from "linkedom";

import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicRawRecord, PublicSignal } from "./adapter-types";
import { AdapterError } from "./adapter-types";
import { parsePowerBiBootstrap } from "./christchurch-demand-adapters";

const FACTS_URL = "https://www.queenstownairport.co.nz/corporate/about-us/facts-figures/";

export type QueenstownAirportMonthlyRecord = {
  year: number;
  month: number;
  domesticPassengers: number;
  internationalPassengers: number;
  totalPassengers: number;
  annualChangePercent: number | null;
};

export function findQueenstownAirportDashboardUrl(html: string, finalUrl = FACTS_URL) {
  const { document } = parseHTML(html);
  const source = [...document.querySelectorAll("iframe[src]")].map((iframe) => iframe.getAttribute("src")).find((value) => value?.includes("app.powerbi.com/view"));
  const url = source ? new URL(source, finalUrl) : null;
  if (!url || url.protocol !== "https:" || url.hostname !== "app.powerbi.com") throw new Error("Queenstown Airport facts page has no public Power BI report");
  return url.href;
}

export function queenstownPassengerQueries(modelPayload: unknown) {
  const root = object(modelPayload);
  const section = array(object(root.exploration).sections).map(object).find((item) => item.displayName === "Pax Numbers");
  const visuals = array(section?.visualContainers).map(object);
  const queries = visuals.flatMap((visual) => typeof visual.query === "string" && visual.query.includes("Metrics: Aero.Pax") && visual.query.includes("_Date.Calendar Year") && visual.query.includes("_Date.Short Month") ? [visual.query] : []);
  const domestic = queries.find((query) => query.includes("\"Value\":\"'D'\""));
  const international = queries.find((query) => query.includes("\"Value\":\"'I'\""));
  const total = queries.find((query) => !query.includes("\"Value\":\"'D'\"") && !query.includes("\"Value\":\"'I'\""));
  const modelId = finiteNumber(array(root.models).map(object)[0]?.id);
  if (!domestic || !international || !total || modelId === null) throw new Error("Queenstown Airport report has no supported monthly passenger queries");
  return { modelId, domestic: JSON.parse(domestic) as unknown, international: JSON.parse(international) as unknown, total: JSON.parse(total) as unknown };
}

export function decodeQueenstownPassengerMatrix(payload: unknown): Map<string, number> {
  const result = object(array(object(payload).results)[0]);
  const data = object(object(result.result).data);
  const dataset = object(array(object(data.dsr).DS)[0]);
  const years = array(object(array(dataset.SH)[0]).DM2).map((row) => finiteNumber(object(row).G1)).filter((value): value is number => value !== null);
  const groups = array(dataset.PH).map(object);
  const rows = array(groups.find((group) => Array.isArray(group.DM1))?.DM1).map(object);
  const months = array(object(dataset.ValueDicts).D0).map((value) => String(value));
  if (!years.length || !rows.length || months.length < 12) throw new Error("Queenstown Airport passenger response has an unsupported matrix");
  const values = new Map<string, number>();
  for (const row of rows) {
    const month = finiteNumber(row.G0);
    if (month === null || month < 0 || month > 11 || !months[month]) continue;
    const cells = array(row.X).map(object);
    for (const [index, year] of years.entries()) {
      const count = finiteNumber(cells[index]?.M0);
      if (count !== null && count >= 0) values.set(`${year}-${month}`, count);
    }
  }
  if (!values.size) throw new Error("Queenstown Airport passenger response has no monthly values");
  return values;
}

export function combineQueenstownPassengerMatrices(domestic: Map<string, number>, international: Map<string, number>, total: Map<string, number>): QueenstownAirportMonthlyRecord[] {
  const base = [...total].flatMap(([period, totalPassengers]) => {
    const [year, month] = period.split("-").map(Number);
    const domesticPassengers = domestic.get(period);
    const internationalPassengers = international.get(period);
    if (!Number.isInteger(year) || !Number.isInteger(month) || domesticPassengers === undefined || internationalPassengers === undefined) return [];
    if (Math.abs(domesticPassengers + internationalPassengers - totalPassengers) > 2) return [];
    return [{ year: year!, month: month!, domesticPassengers, internationalPassengers, totalPassengers }];
  }).sort((left, right) => left.year - right.year || left.month - right.month);
  const byPeriod = new Map(base.map((record) => [`${record.year}-${record.month}`, record]));
  return base.map((record) => {
    const previous = byPeriod.get(`${record.year - 1}-${record.month}`);
    return { ...record, annualChangePercent: previous?.totalPassengers ? (record.totalPassengers - previous.totalPassengers) / previous.totalPassengers * 100 : null };
  });
}

class QueenstownAirportMonthlyAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "queenstown_airport_monthly", sourceName: "Queenstown Airport monthly passengers", sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.queenstownairport.co.nz", "app.powerbi.com", "wabi-australia-southeast-api.analysis.windows.net"],
    adapterKey: "public:queenstown-airport:monthly-passengers-powerbi-v1", accessMethod: "OFFICIAL_PUBLIC_HTML_POWERBI_JSON",
    concurrencyLimit: 1, dailyBudget: 6, collectorVersion: "queenstown-airport-powerbi-fetch-v1", parserVersion: "queenstown-airport-monthly-matrix-v1",
  };

  async discover(): Promise<string[]> { return [FACTS_URL]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const facts = await fetchText(reference, context);
    let dashboardUrl: string;
    try { dashboardUrl = findQueenstownAirportDashboardUrl(facts.text, facts.url); }
    catch (error) { throw parsing(error, "Queenstown Airport dashboard discovery failed"); }
    const embed = await fetchText(dashboardUrl, context);
    const bootstrap = parsePowerBiBootstrap(embed.text);
    const headers = powerBiHeaders(bootstrap.resourceKey);
    const modelResponse = await fetch(`${bootstrap.apiOrigin}/public/reports/${bootstrap.resourceKey}/modelsAndExploration?preferReadOnlySession=true`, { headers, signal: context.signal ?? AbortSignal.timeout(30_000) });
    if (!modelResponse.ok) throw unavailable(`model returned HTTP ${modelResponse.status}`, modelResponse.status);
    const modelPayload = await boundedJson(modelResponse, context.collectionLimits?.maxBytes ?? 5_000_000);
    let queries: ReturnType<typeof queenstownPassengerQueries>;
    try { queries = queenstownPassengerQueries(modelPayload); }
    catch (error) { throw parsing(error, "Queenstown Airport report query discovery failed"); }
    const matrices = await Promise.all(([queries.domestic, queries.international, queries.total] as const).map(async (query) => {
      const response = await fetch(`${bootstrap.apiOrigin}/public/reports/querydata?synchronous=true`, {
        method: "POST", headers: { ...powerBiHeaders(bootstrap.resourceKey), "content-type": "application/json" },
        body: JSON.stringify({ version: "1.0.0", queries: [{ Query: query }], cancelQueries: [], modelId: queries.modelId }),
        signal: context.signal ?? AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw unavailable(`query returned HTTP ${response.status}`, response.status);
      try { return decodeQueenstownPassengerMatrix(await boundedJson(response, context.collectionLimits?.maxBytes ?? 5_000_000)); }
      catch (error) { throw parsing(error, "Queenstown Airport passenger matrix parsing failed"); }
    }));
    const records = combineQueenstownPassengerMatrices(matrices[0], matrices[1], matrices[2]);
    if (!records.length) throw new AdapterError("PARSING_ERROR", "Queenstown Airport report has no consistent monthly passenger records", false);
    const maxRecords = context.collectionLimits?.maxRecords ?? records.length;
    return records.slice(-Math.min(13, maxRecords)).map((record, index) => ({
      sourceId: "queenstown_airport_monthly", externalId: `airport-passengers:${record.year}-${String(record.month + 1).padStart(2, "0")}`,
      payload: { record, sourceUrl: dashboardUrl }, fetchedAt: new Date(), fixture: false, networkRequestCount: index === 0 ? 6 : 0,
    }));
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((raw): PublicSignal[] => {
      const payload = raw.payload as { record?: QueenstownAirportMonthlyRecord; sourceUrl?: string };
      const record = payload.record;
      if (!record) return [];
      const startsAt = new Date(Date.UTC(record.year, record.month, 1));
      const annualChange = record.annualChangePercent;
      return [{
        sourceId: "queenstown_airport_monthly", externalId: raw.externalId, marketKey: "queenstown-wanaka", type: "TOURISM_DEMAND",
        title: `Queenstown Airport passengers - ${startsAt.toLocaleString("en-NZ", { month: "long", year: "numeric", timeZone: "UTC" })}`,
        region: "Queenstown Lakes", startsAt, endsAt: new Date(Date.UTC(record.year, record.month + 1, 1)),
        direction: annualChange === null ? "UNKNOWN" : annualChange > 2 ? "POSITIVE" : annualChange < -2 ? "NEGATIVE" : "MIXED",
        confidence: 0.9, evidenceRef: payload.sourceUrl ?? FACTS_URL,
        metadata: { contextSeriesKey: "airport-monthly-passengers", temporalUse: "LAGGED_TREND_CONTEXT", sourceTimezone: "Pacific/Auckland", ...record }, fixture: false,
      }];
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try { const response = await fetch(FACTS_URL, { method: "HEAD", signal: context.signal ?? AbortSignal.timeout(10_000) }); return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `Queenstown Airport facts page returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode }; }
    catch (error) { return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "Queenstown Airport monthly health check failed", latencyMs: Date.now() - started, mode: context.mode }; }
  }

}

export const queenstownAirportMonthlyAdapters: Record<string, PublicDataAdapter> = { queenstown_airport_monthly: new QueenstownAirportMonthlyAdapter() };

function powerBiHeaders(resourceKey: string) { return { accept: "application/json", activityid: randomUUID(), requestid: randomUUID(), "x-powerbi-resourcekey": resourceKey }; }
async function fetchText(url: string, context: AdapterContext) { const response = await fetch(url, { headers: { accept: "text/html,application/xhtml+xml", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }, signal: context.signal ?? AbortSignal.timeout(30_000) }); if (!response.ok) throw unavailable(`page returned HTTP ${response.status}`, response.status); return { text: await boundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000), url: response.url }; }
async function boundedText(response: Response, maxBytes: number) { const text = await response.text(); if (Buffer.byteLength(text) > maxBytes) throw new AdapterError("PARSING_ERROR", `Queenstown Airport response exceeds ${maxBytes} bytes`, false); return text; }
async function boundedJson(response: Response, maxBytes: number) { return JSON.parse(await boundedText(response, maxBytes)) as unknown; }
function unavailable(message: string, status: number) { return new AdapterError("SOURCE_UNAVAILABLE", `Queenstown Airport ${message}`, status === 429 || status >= 500); }
function parsing(error: unknown, fallback: string) { return new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : fallback, false); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function finiteNumber(value: unknown) { const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN; return Number.isFinite(number) ? number : null; }
