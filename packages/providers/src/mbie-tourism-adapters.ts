import ExcelJS from "exceljs";
import { addNzCalendarDays, addNzCalendarMonths, nzStartOfDay } from "@tymra/domain";

import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicRawRecord, PublicSignal } from "./adapter-types";
import { AdapterError } from "./adapter-types";
import { marketKeysForMbieArea } from "./public-adapters";

const TVF_MONTHLY_URL = "https://teic.mbie.govt.nz/assets/tv&f/Volumes_monthly_unique_counts.xlsx";
const MRTE_SUMMARY_URL = "https://teic.mbie.govt.nz/assets/mrte/Summary.xlsx";
const IVS_ANNUAL_SUMMARY_URL = "https://teic.mbie.govt.nz/ste/data/views/theEconomy/demand/IVSAnnual/ivsAnnualSummary.json";

export type TourismFlowsRecord = {
  destination: string;
  destinationCode: string;
  populationSegment: string;
  period: string;
  monthlyUniqueCount: number;
  annualChangePercent: number | null;
};

export type MrteRecord = {
  rto: string;
  period: string;
  domesticSpendMillions: number;
  internationalSpendMillions: number;
  totalSpendMillions: number;
  annualChangePercent: number | null;
};

export type IvsAnnualRecord = {
  periodEnd: string;
  totalSpendNzd: number;
  meanSpendPerVisitorNzd: number | null;
  medianLengthOfStayDays: number | null;
  annualChangePercent: number | null;
  publishedAt: string | null;
};

export function parseIvsAnnualSummary(payload: unknown): IvsAnnualRecord[] {
  if (!Array.isArray(payload)) throw new Error("MBIE IVS summary is not an array");
  const metadata = payload.find((item) => item && typeof item === "object" && "publisher" in item) as { publishingDate?: unknown } | undefined;
  const wrapper = payload.find((item) => item && typeof item === "object" && "data" in item) as { data?: Record<string, unknown> } | undefined;
  const data = wrapper?.data;
  if (!data) throw new Error("MBIE IVS summary has no data object");
  const spend = data["Total spend"] as Record<string, unknown> | undefined;
  if (!spend || typeof spend !== "object") throw new Error("MBIE IVS summary has no total-spend series");
  const meanSpend = data["Mean spend per visitor"] as Record<string, unknown> | undefined;
  const medianStay = data["Median length of stay"] as Record<string, unknown> | undefined;
  const base = Object.keys(spend).sort().flatMap((periodEnd) => {
    const totalSpendNzd = categoryValue(spend[periodEnd], "Country", "All countries");
    if (totalSpendNzd === null || !/^20\d{2}-\d{2}-\d{2}$/.test(periodEnd)) return [];
    return [{
      periodEnd, totalSpendNzd,
      meanSpendPerVisitorNzd: categoryValue(meanSpend?.[periodEnd], "Country", "All countries"),
      medianLengthOfStayDays: categoryValue(medianStay?.[periodEnd], "Country", "All countries"),
      publishedAt: clean(metadata?.publishingDate) || null,
    }];
  });
  if (!base.length) throw new Error("MBIE IVS summary has no all-country annual records");
  const byPeriod = new Map(base.map((record) => [record.periodEnd, record]));
  return base.map((record) => {
    const date = new Date(`${record.periodEnd}T00:00:00.000Z`);
    const previousPeriod = `${date.getUTCFullYear() - 1}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    const previous = byPeriod.get(previousPeriod);
    return { ...record, annualChangePercent: previous?.totalSpendNzd ? (record.totalSpendNzd - previous.totalSpendNzd) / previous.totalSpendNzd * 100 : null };
  });
}

export async function parseTourismFlowsMonthly(workbookBytes: Uint8Array): Promise<TourismFlowsRecord[]> {
  const workbook = await loadWorkbook(workbookBytes);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("MBIE Tourism Volumes & Flows workbook has no worksheet");
  const records: Omit<TourismFlowsRecord, "annualChangePercent">[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || clean(cell(row, 1)) !== "RTO") return;
    const destination = clean(cell(row, 2));
    const destinationCode = clean(cell(row, 3));
    const populationSegment = clean(cell(row, 4));
    const date = parseDate(cell(row, 5));
    const monthlyUniqueCount = number(cell(row, 6));
    if (!destination || !destinationCode || populationSegment !== "Total visitor" || !date || monthlyUniqueCount === null) return;
    const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
    records.push({ destination, destinationCode, populationSegment, period, monthlyUniqueCount });
  });
  if (!records.length) throw new Error("MBIE Tourism Volumes & Flows workbook has no RTO total-visitor records");
  const unique = [...new Map(records.map((record) => [`${record.destinationCode}:${record.period}`, record])).values()]
    .sort((left, right) => left.period.localeCompare(right.period) || left.destination.localeCompare(right.destination));
  const bySeriesPeriod = new Map(unique.map((record) => [`${record.destinationCode}:${record.period}`, record]));
  return unique.map((record) => {
    const previousPeriod = `${Number(record.period.slice(0, 4)) - 1}${record.period.slice(4)}`;
    const previous = bySeriesPeriod.get(`${record.destinationCode}:${previousPeriod}`);
    return { ...record, annualChangePercent: previous?.monthlyUniqueCount ? (record.monthlyUniqueCount - previous.monthlyUniqueCount) / previous.monthlyUniqueCount * 100 : null };
  });
}

export async function parseMrteSummary(workbookBytes: Uint8Array): Promise<MrteRecord[]> {
  const workbook = await loadWorkbook(workbookBytes);
  const sheet = workbook.getWorksheet("RTO table");
  if (!sheet) throw new Error("MBIE MRTE workbook has no RTO table");
  const heading = clean(cell(sheet.getRow(6), 1));
  const match = heading.match(/([A-Za-z]+)-(20\d{2})\s+RTO Summary Table/i);
  const month = match ? monthIndex(match[1]!) : -1;
  const year = match ? Number(match[2]) : Number.NaN;
  if (month < 0 || !Number.isInteger(year)) throw new Error("MBIE MRTE workbook has no valid reporting period");
  const period = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const records: MrteRecord[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 10) return;
    const rto = clean(cell(row, 1));
    const domesticSpendMillions = number(cell(row, 2));
    const internationalSpendMillions = number(cell(row, 3));
    const domesticAnnualChange = number(cell(row, 4));
    const internationalAnnualChange = number(cell(row, 5));
    if (!rto || rto === "New Zealand" || rto.startsWith("non-RTO") || domesticSpendMillions === null || internationalSpendMillions === null) return;
    if (!marketKeysForMbieArea(rto).length) return;
    const annualChangePercent = combinedAnnualChange(domesticSpendMillions, internationalSpendMillions, domesticAnnualChange, internationalAnnualChange);
    records.push({ rto, period, domesticSpendMillions, internationalSpendMillions, totalSpendMillions: domesticSpendMillions + internationalSpendMillions, annualChangePercent });
  });
  if (!records.length) throw new Error("MBIE MRTE workbook has no supported RTO records");
  return records;
}

class MbieWorkbookAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata;

  constructor(
    private readonly kind: "tvf" | "mrte",
    sourceId: string,
    sourceName: string,
    private readonly sourceUrl: string,
  ) {
    this.metadata = {
      sourceId, sourceName, sourceType: "PUBLIC_DATA", supportedDomains: ["teic.mbie.govt.nz"],
      adapterKey: `public:${sourceId}:xlsx-v1`, accessMethod: "OFFICIAL_PUBLIC_XLSX", concurrencyLimit: 1, dailyBudget: 4,
      collectorVersion: "mbie-tourism-xlsx-fetch-v1", parserVersion: `mbie-${kind}-xlsx-v1`,
    };
  }

  async discover(): Promise<string[]> { return [this.sourceUrl]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const response = await fetch(reference, { headers: { accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "user-agent": "TymraMarketCollector/1.0" }, signal: context.signal ?? AbortSignal.timeout(30_000) });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `${this.metadata.sourceName} returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const maxBytes = context.collectionLimits?.maxBytes ?? 5_000_000;
    if (bytes.byteLength > maxBytes) throw new AdapterError("PARSING_ERROR", `${this.metadata.sourceName} workbook exceeds ${maxBytes} bytes`, false);
    let records: TourismFlowsRecord[] | MrteRecord[];
    try { records = this.kind === "tvf" ? await parseTourismFlowsMonthly(bytes) : await parseMrteSummary(bytes); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : `${this.metadata.sourceName} parsing failed`, false); }
    const relevant = records.filter((record) => marketKeysForMbieArea("destination" in record ? record.destination : record.rto).length > 0);
    const maxRecords = context.collectionLimits?.maxRecords ?? relevant.length;
    const bounded = this.kind === "tvf" ? retainLatestPeriods(relevant as TourismFlowsRecord[], maxRecords) : relevant.slice(0, maxRecords);
    return bounded.map((record, index) => ({
      sourceId: this.metadata.sourceId,
      externalId: this.kind === "tvf"
        ? `tvf:${(record as TourismFlowsRecord).destinationCode}:${record.period}`
        : `mrte:${slug((record as MrteRecord).rto)}:${record.period}`,
      payload: { record, sourceUrl: this.sourceUrl }, fetchedAt: new Date(), fixture: false, networkRequestCount: index === 0 ? 1 : 0,
    }));
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((raw): PublicSignal[] => {
      const payload = raw.payload as { record?: TourismFlowsRecord | MrteRecord; sourceUrl?: string };
      const record = payload.record;
      if (!record) return [];
      const area = "destination" in record ? record.destination : record.rto;
      const startsAt = nzStartOfDay(record.period);
      const endsAt = nzStartOfDay(addNzCalendarMonths(record.period, 1));
      const annualChange = record.annualChangePercent;
      const series = "destination" in record ? `tvf-monthly-unique:${record.destinationCode}` : `mrte-monthly-spend:${slug(record.rto)}`;
      const measures = "destination" in record
        ? { monthlyUniqueVisitors: record.monthlyUniqueCount, unit: "visitors" }
        : { domesticSpendMillions: record.domesticSpendMillions, internationalSpendMillions: record.internationalSpendMillions, totalSpendMillions: record.totalSpendMillions, unit: "NZD millions" };
      return marketKeysForMbieArea(area).map((marketKey, index) => ({
        sourceId: this.metadata.sourceId,
        externalId: index === 0 ? raw.externalId : `${raw.externalId}:market:${marketKey}`,
        marketKey, type: "TOURISM_DEMAND",
        title: this.kind === "tvf" ? `MBIE monthly visitors: ${area}` : `MBIE monthly tourism spend: ${area}`,
        region: area, startsAt, endsAt,
        direction: annualChange === null ? "UNKNOWN" : annualChange > 2 ? "POSITIVE" : annualChange < -2 ? "NEGATIVE" : "MIXED",
        confidence: annualChange === null ? 0.65 : 0.9,
        evidenceRef: payload.sourceUrl ?? this.sourceUrl,
        metadata: { dataset: this.kind === "tvf" ? "Tourism Volumes & Flows" : "Monthly Regional Tourism Estimates", contextSeriesKey: series, temporalUse: "LAGGED_TREND_CONTEXT", annualChangePercent: annualChange, ...measures },
        fixture: false,
      }));
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(this.sourceUrl, { method: "HEAD", signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `${this.metadata.sourceName} returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : `${this.metadata.sourceName} health check failed`, latencyMs: Date.now() - started, mode: context.mode };
    }
  }

}

class MbieIvsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "mbie_ivs", sourceName: "MBIE International Visitor Survey", sourceType: "PUBLIC_DATA", supportedDomains: ["teic.mbie.govt.nz"],
    adapterKey: "public:mbie_ivs:annual-summary-json-v1", accessMethod: "OFFICIAL_PUBLIC_JSON", concurrencyLimit: 1, dailyBudget: 4,
    collectorVersion: "mbie-ivs-json-fetch-v1", parserVersion: "mbie-ivs-annual-summary-v1",
  };
  async discover(): Promise<string[]> { return [IVS_ANNUAL_SUMMARY_URL]; }
  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const response = await fetch(reference, { headers: { accept: "application/json", "user-agent": "TymraMarketCollector/1.0" }, signal: context.signal ?? AbortSignal.timeout(30_000) });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `MBIE IVS returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    let records: IvsAnnualRecord[];
    try { records = parseIvsAnnualSummary(await response.json()); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : "MBIE IVS parsing failed", false); }
    const maxRecords = context.collectionLimits?.maxRecords ?? records.length;
    return records.slice(-Math.min(5, maxRecords)).map((record, index) => ({ sourceId: "mbie_ivs", externalId: `ivs-annual:${record.periodEnd}`, payload: { record, sourceUrl: IVS_ANNUAL_SUMMARY_URL }, fetchedAt: new Date(), fixture: false, networkRequestCount: index === 0 ? 1 : 0 }));
  }
  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((raw): PublicSignal[] => {
      const payload = raw.payload as { record?: IvsAnnualRecord; sourceUrl?: string };
      const record = payload.record;
      if (!record) return [];
      const periodEnd = record.periodEnd;
      const startsAt = nzStartOfDay(addNzCalendarDays(addNzCalendarMonths(periodEnd, -12), 1));
      const annualChange = record.annualChangePercent;
      return [{
        sourceId: "mbie_ivs", externalId: raw.externalId, marketKey: "new-zealand", type: "TOURISM_DEMAND",
        title: `MBIE international visitor spend - year ended ${record.periodEnd}`,
        region: "New Zealand", startsAt, endsAt: nzStartOfDay(addNzCalendarDays(periodEnd, 1)),
        direction: annualChange === null ? "UNKNOWN" : annualChange > 2 ? "POSITIVE" : annualChange < -2 ? "NEGATIVE" : "MIXED",
        confidence: annualChange === null ? 0.6 : 0.8, evidenceRef: payload.sourceUrl ?? IVS_ANNUAL_SUMMARY_URL,
        metadata: { dataset: "International Visitor Survey (rolling annual)", contextSeriesKey: "ivs-rolling-annual-total-spend", temporalUse: "LAGGED_TREND_CONTEXT", contextMaxAgeDays: 400, ...record }, fixture: false,
      }];
    });
  }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try { const response = await fetch(IVS_ANNUAL_SUMMARY_URL, { method: "HEAD", signal: context.signal ?? AbortSignal.timeout(10_000) }); return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `MBIE IVS JSON returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode }; }
    catch (error) { return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "MBIE IVS health check failed", latencyMs: Date.now() - started, mode: context.mode }; }
  }
}

export const mbieTourismAdapters: Record<string, PublicDataAdapter> = {
  mbie_tourism_flows: new MbieWorkbookAdapter("tvf", "mbie_tourism_flows", "MBIE Tourism Volumes & Flows", TVF_MONTHLY_URL),
  mbie_mrte: new MbieWorkbookAdapter("mrte", "mbie_mrte", "MBIE Monthly Regional Tourism Estimates", MRTE_SUMMARY_URL),
  mbie_ivs: new MbieIvsAdapter(),
};

async function loadWorkbook(bytes: Uint8Array) { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Uint8Array.from(bytes).buffer); return workbook; }
function cell(row: ExcelJS.Row, column: number) { const value = row.getCell(column).value; return value && typeof value === "object" && "result" in value ? value.result : value; }
function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function number(value: unknown) { const text = clean(value); if (!text) return null; const parsed = typeof value === "number" ? value : Number(text); return Number.isFinite(parsed) ? parsed : null; }
function parseDate(value: unknown) { const parsed = value instanceof Date ? value : new Date(clean(value)); return Number.isNaN(parsed.getTime()) ? null : parsed; }
function monthIndex(value: string) { return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(value.slice(0, 3).toLowerCase()); }
function slug(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function combinedAnnualChange(domestic: number, international: number, domesticChange: number | null, internationalChange: number | null) {
  const previousDomestic = domesticChange !== null && domesticChange > -1 ? domestic / (1 + domesticChange) : null;
  const previousInternational = internationalChange !== null && internationalChange > -1 ? international / (1 + internationalChange) : null;
  if (previousDomestic === null || previousInternational === null || previousDomestic + previousInternational <= 0) return null;
  return ((domestic + international) / (previousDomestic + previousInternational) - 1) * 100;
}
function retainLatestPeriods(records: TourismFlowsRecord[], maxRecords: number) {
  const periods = [...new Set(records.map((record) => record.period))].sort().slice(-13);
  return records.filter((record) => periods.includes(record.period)).slice(-maxRecords);
}
function categoryValue(value: unknown, breakdown: string, category: string) {
  if (!value || typeof value !== "object") return null;
  const rows = (value as Record<string, unknown>)[breakdown];
  if (!Array.isArray(rows)) return null;
  const row = rows.find((item) => item && typeof item === "object" && clean((item as Record<string, unknown>).Category) === category) as Record<string, unknown> | undefined;
  return row ? number(row.Value) : null;
}
