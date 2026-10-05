import { randomUUID } from "node:crypto";
import { parseHTML } from "linkedom";
import { addNzCalendarMonths, nzStartOfDay } from "@tymra/domain";

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
  const legacyQueries = visuals.flatMap((visual) => typeof visual.query === "string" && visual.query.includes("Metrics: Aero.Pax") && visual.query.includes("_Date.Calendar Year") && visual.query.includes("_Date.Short Month") ? [visual.query] : []);
  const documentText = object(object(root.exploration).explorationContent).explorationDocument;
  const document = typeof documentText === "string" ? object(JSON.parse(documentText)) : object(documentText);
  const pages = array(object(document.pages).pages).map(object);
  const pbirQueries = pages.filter((page) => object(page.content).displayName === "Pax Numbers").flatMap((page) => array(page.visualContainers).map(object).flatMap((container) => {
    const content = object(container.content);
    const visual = object(content.visual);
    if (visual.visualType !== "pivotTable") return [];
    const state = object(object(visual.query).queryState);
    const projections = ["Rows", "Columns", "Values"].map((role) => array(object(state[role]).projections).map(object));
    if (projections.some((items) => items.length !== 1)
      || projections[0]?.[0]?.queryRef !== "_Date.Short Month"
      || projections[1]?.[0]?.queryRef !== "_Date.Calendar Year"
      || projections[2]?.[0]?.queryRef !== "Metrics: Aero.Pax") return [];
    const from = new Map<string, string>();
    const alias = (entity: string) => {
      if (!from.has(entity)) from.set(entity, `s${from.size}`);
      return from.get(entity)!;
    };
    function rebind(value: unknown, sources: Record<string, string> = {}): unknown {
      if (Array.isArray(value)) return value.map((entry) => rebind(entry, sources));
      const record = object(value);
      if (!Object.keys(record).length) return value;
      return Object.fromEntries(Object.entries(record).map(([key, entry]) => {
        if (key === "SourceRef") {
          const ref = object(entry);
          const entity = typeof ref.Entity === "string" ? ref.Entity : typeof ref.Source === "string" ? sources[ref.Source] : undefined;
          if (!entity) throw new Error("Queenstown Airport PBIR query has an unbound source");
          return [key, { Source: alias(entity) }];
        }
        return [key, rebind(entry, sources)];
      }));
    }
    const select = projections.map((items) => ({ ...object(rebind(items[0]!.field)), Name: items[0]!.queryRef }));
    const where = array(object(content.filterConfig).filters).map(object).flatMap((item) => {
      if (!item.filter) return [];
      const filter = object(item.filter);
      const sources = Object.fromEntries(array(filter.From).map(object).map((entry) => [String(entry.Name), String(entry.Entity)]));
      if (!Array.isArray(filter.Where)) throw new Error("Queenstown Airport PBIR filter is unsupported");
      return filter.Where.map((condition) => rebind(condition, sources));
    });
    const query = { Commands: [{ SemanticQueryDataShapeCommand: {
      Query: { Version: 2, From: [...from].map(([Entity, Name]) => ({ Name, Entity, Type: 0 })), Select: select, Where: where },
      Binding: { Version: 1, Primary: { Groupings: [{ Projections: [0, 2] }] }, Secondary: { Groupings: [{ Projections: [1] }] }, DataReduction: { DataVolume: 3, Primary: { Window: { Count: 100 } }, Secondary: { Top: { Count: 100 } } } },
      ExecutionMetricsKind: 1,
    } }] };
    return [JSON.stringify(query)];
  }));
  const queries = legacyQueries.length ? legacyQueries : pbirQueries;
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
  const expressions = object(object(data.descriptor).Expressions);
  const yearGroup = array(object(expressions.Secondary).Groupings).map(object).find((group) => array(group.Keys).some((key) => object(object(key).Source).Property === "Calendar Year"));
  const monthGroup = array(object(expressions.Primary).Groupings).map(object).find((group) => array(group.Keys).some((key) => object(object(key).Source).Property === "Short Month"));
  const yearMember = typeof yearGroup?.Member === "string" ? yearGroup.Member : "DM2";
  const monthMember = typeof monthGroup?.Member === "string" ? monthGroup.Member : "DM1";
  const years = array(array(dataset.SH).map(object).find((group) => Array.isArray(group[yearMember]))?.[yearMember]).map((row) => finiteNumber(object(row).G1)).filter((value): value is number => value !== null);
  const groups = array(dataset.PH).map(object);
  const rows = array(groups.find((group) => Array.isArray(group[monthMember]))?.[monthMember]).map(object);
  const months = array(object(dataset.ValueDicts).D0).map((value) => String(value));
  if (!years.length || !rows.length || months.length < 12) throw new Error("Queenstown Airport passenger response has an unsupported matrix");
  const values = new Map<string, number>();
  for (const row of rows) {
    const monthIndex = finiteNumber(row.G0);
    if (monthIndex === null || monthIndex < 0 || !months[monthIndex]) continue;
    const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(months[monthIndex]!);
    if (month < 0) continue;
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
    concurrencyLimit: 1, dailyBudget: 6, collectorVersion: "queenstown-airport-powerbi-fetch-v1", parserVersion: "queenstown-airport-monthly-matrix-pbir-v2",
  };

  async discover(): Promise<string[]> { return [FACTS_URL]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    if (context.collectionLimits && context.collectionLimits.maxRequests < 6) throw new AdapterError("REQUEST_BUDGET_EXHAUSTED", "Queenstown Airport discovery, model and three passenger matrices require six requests", false);
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
    const matrices: Map<string, number>[] = [];
    for (const query of [queries.domestic, queries.international, queries.total]) {
      const response = await fetch(`${bootstrap.apiOrigin}/public/reports/querydata?synchronous=true`, {
        method: "POST", headers: { ...powerBiHeaders(bootstrap.resourceKey), "content-type": "application/json" },
        body: JSON.stringify({ version: "1.0.0", queries: [{ Query: query }], cancelQueries: [], modelId: queries.modelId }),
        signal: context.signal ?? AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw unavailable(`query returned HTTP ${response.status}`, response.status);
      try { matrices.push(decodeQueenstownPassengerMatrix(await boundedJson(response, context.collectionLimits?.maxBytes ?? 5_000_000))); }
      catch (error) { throw parsing(error, "Queenstown Airport passenger matrix parsing failed"); }
    }
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
      const period = `${record.year}-${String(record.month + 1).padStart(2, "0")}-01`;
      const startsAt = nzStartOfDay(period);
      const annualChange = record.annualChangePercent;
      return [{
        sourceId: "queenstown_airport_monthly", externalId: raw.externalId, marketKey: "queenstown-wanaka", type: "TOURISM_DEMAND",
        title: `Queenstown Airport passengers - ${startsAt.toLocaleString("en-NZ", { month: "long", year: "numeric", timeZone: "Pacific/Auckland" })}`,
        region: "Queenstown Lakes", startsAt, endsAt: nzStartOfDay(addNzCalendarMonths(period, 1)),
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
