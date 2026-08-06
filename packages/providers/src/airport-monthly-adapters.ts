import ExcelJS from "exceljs";
import { parseHTML } from "linkedom";

import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicRawRecord, PublicSignal } from "./adapter-types";
import { AdapterError } from "./adapter-types";

const WELLINGTON_AIRPORT_TRAFFIC_URL = "https://www.wellingtonairport.co.nz/corporate-hub/commercial-and-corporate-documents/traffic-reports/";

export type AirportMonthlyPassengerRecord = {
  year: number;
  month: number;
  domesticPassengers: number;
  internationalPassengers: number;
  totalPassengers: number;
  annualChangePercent: number | null;
};

export function findWellingtonAirportWorkbookUrl(html: string, finalUrl = WELLINGTON_AIRPORT_TRAFFIC_URL) {
  const { document } = parseHTML(html);
  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (!href || !/\.xlsx(?:$|\?)/i.test(href)) continue;
    const url = new URL(href, finalUrl);
    if (url.protocol === "https:" && url.hostname === "www.wellingtonairport.co.nz") return url.href;
  }
  throw new Error("Wellington Airport traffic page has no same-site monthly statistics workbook");
}

export async function parseWellingtonAirportMonthlyPassengers(workbookBytes: Uint8Array): Promise<AirportMonthlyPassengerRecord[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(workbookBytes).buffer);
  const sheet = workbook.getWorksheet("Monthly Traffic Stats") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("Wellington Airport workbook has no traffic worksheet");
  const base: Omit<AirportMonthlyPassengerRecord, "annualChangePercent">[] = [];
  sheet.eachRow((row) => {
    const month = monthIndex(cellScalar(row.getCell(2).value));
    const yearValue = finiteNumber(cellScalar(row.getCell(4).value));
    const internationalPassengers = finiteNumber(cellScalar(row.getCell(6).value));
    const domesticPassengers = finiteNumber(cellScalar(row.getCell(8).value));
    const totalPassengers = finiteNumber(cellScalar(row.getCell(10).value));
    if (month < 0 || yearValue === null || domesticPassengers === null || internationalPassengers === null || totalPassengers === null) return;
    const year = yearValue < 100 ? (yearValue >= 90 ? 1900 : 2000) + yearValue : yearValue;
    if (year < 1990 || year > 2100 || Math.abs(domesticPassengers + internationalPassengers - totalPassengers) > 2) return;
    base.push({ year, month, domesticPassengers, internationalPassengers, totalPassengers });
  });
  const unique = [...new Map(base.map((record) => [`${record.year}-${record.month}`, record])).values()]
    .sort((left, right) => left.year - right.year || left.month - right.month);
  const byPeriod = new Map(unique.map((record) => [`${record.year}-${record.month}`, record]));
  return unique.map((record) => {
    const previous = byPeriod.get(`${record.year - 1}-${record.month}`);
    return {
      ...record,
      annualChangePercent: previous?.totalPassengers ? (record.totalPassengers - previous.totalPassengers) / previous.totalPassengers * 100 : null,
    };
  });
}

class WellingtonAirportMonthlyAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "wellington_airport_monthly",
    sourceName: "Wellington Airport monthly passenger statistics",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.wellingtonairport.co.nz"],
    adapterKey: "public:wellington-airport:monthly-passengers-xlsx-v1",
    accessMethod: "OFFICIAL_PUBLIC_HTML_XLSX",
    concurrencyLimit: 1,
    dailyBudget: 4,
    collectorVersion: "wellington-airport-monthly-http-v1",
    parserVersion: "wellington-airport-monthly-xlsx-v1",
  };

  async discover(): Promise<string[]> { return [WELLINGTON_AIRPORT_TRAFFIC_URL]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const page = await fetch(reference, { headers: requestHeaders("text/html,application/xhtml+xml"), signal: context.signal ?? AbortSignal.timeout(30_000) });
    if (!page.ok) throw sourceError(`traffic page returned HTTP ${page.status}`, page.status);
    const html = await boundedText(page, context.collectionLimits?.maxBytes ?? 5_000_000);
    let workbookUrl: string;
    try { workbookUrl = findWellingtonAirportWorkbookUrl(html, page.url); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : "Wellington Airport workbook discovery failed", false); }
    const response = await fetch(workbookUrl, { headers: requestHeaders("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), signal: context.signal ?? AbortSignal.timeout(30_000) });
    if (!response.ok) throw sourceError(`monthly workbook returned HTTP ${response.status}`, response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const maxBytes = context.collectionLimits?.maxBytes ?? 5_000_000;
    if (bytes.byteLength > maxBytes) throw new AdapterError("PARSING_ERROR", `Wellington Airport workbook exceeds ${maxBytes} bytes`, false);
    let records: AirportMonthlyPassengerRecord[];
    try { records = await parseWellingtonAirportMonthlyPassengers(bytes); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : "Wellington Airport workbook parsing failed", false); }
    if (!records.length) throw new AdapterError("PARSING_ERROR", "Wellington Airport workbook has no valid monthly passenger records", false);
    const maxRecords = context.collectionLimits?.maxRecords ?? records.length;
    return records.slice(-maxRecords).map((record, index) => ({
      sourceId: "wellington_airport_monthly",
      externalId: `airport-passengers:${record.year}-${String(record.month + 1).padStart(2, "0")}`,
      payload: { record, sourceUrl: workbookUrl },
      fetchedAt: new Date(),
      fixture: false,
      networkRequestCount: index === 0 ? 2 : 0,
    }));
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((raw): PublicSignal[] => {
      const payload = raw.payload as { record?: AirportMonthlyPassengerRecord; sourceUrl?: string };
      const record = payload.record;
      if (!record) return [];
      const startsAt = new Date(Date.UTC(record.year, record.month, 1));
      const endsAt = new Date(Date.UTC(record.year, record.month + 1, 1));
      const annualChange = record.annualChangePercent;
      return [{
        sourceId: "wellington_airport_monthly",
        externalId: raw.externalId,
        marketKey: "wellington",
        type: "TOURISM_DEMAND",
        title: `Wellington Airport passengers - ${startsAt.toLocaleString("en-NZ", { month: "long", year: "numeric", timeZone: "UTC" })}`,
        region: "Wellington",
        startsAt,
        endsAt,
        direction: annualChange === null ? "UNKNOWN" : annualChange > 2 ? "POSITIVE" : annualChange < -2 ? "NEGATIVE" : "MIXED",
        confidence: 0.9,
        evidenceRef: payload.sourceUrl ?? WELLINGTON_AIRPORT_TRAFFIC_URL,
        metadata: { contextSeriesKey: "airport-monthly-passengers", ...record, sourceTimezone: "Pacific/Auckland", temporalUse: "LAGGED_TREND_CONTEXT" },
        fixture: false,
      }];
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(WELLINGTON_AIRPORT_TRAFFIC_URL, { method: "HEAD", signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `Wellington Airport traffic page returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "Wellington Airport traffic health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

}

export const airportMonthlyAdapters: Record<string, PublicDataAdapter> = {
  wellington_airport_monthly: new WellingtonAirportMonthlyAdapter(),
};

function requestHeaders(accept: string) { return { accept, "accept-language": "en-NZ,en;q=0.9", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)" }; }

async function boundedText(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new AdapterError("PARSING_ERROR", `Wellington Airport response exceeds ${maxBytes} bytes`, false);
  const text = await response.text();
  if (Buffer.byteLength(text) > maxBytes) throw new AdapterError("PARSING_ERROR", `Wellington Airport response exceeds ${maxBytes} bytes`, false);
  return text;
}

function sourceError(message: string, status: number) { return new AdapterError("SOURCE_UNAVAILABLE", `Wellington Airport ${message}`, status >= 500 || status === 429); }

function monthIndex(value: unknown) {
  if (typeof value !== "string") return -1;
  const key = value.trim().slice(0, 3).toLowerCase();
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(key);
}

function cellScalar(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === "object" && "result" in value) return value.result;
  return value;
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}
