import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicDiscoveryRequest, PublicRawRecord, PublicSignal } from "../adapter-types";
import { addNzCalendarMonths, nzStartOfDay } from "@tymra/domain";
import { AdapterError } from "../adapter-types";
import { parse } from "csv-parse/sync";
import { isoDate, cleanText, slug, readBoundedText } from "./shared";

export const MBIE_ADP_URL = "https://teic.mbie.govt.nz/assets/adp/ADP_All_Measures.csv";

export type MbieMeasure = { value: number | string; flag: string | null };

export type MbieAccommodationRecord = {
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

export class MbieAccommodationAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "mbie",
    sourceName: "MBIE Accommodation Data Programme",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["teic.mbie.govt.nz"],
    adapterKey: "public:mbie:adp-csv-v2",
    accessMethod: "OFFICIAL_PUBLIC_CSV_RANGE",
    concurrencyLimit: 1,
    dailyBudget: 4,
    collectorVersion: "mbie-adp-range-fetch-v1",
    parserVersion: "mbie-adp-canonical-markets-v2",
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
    const relevantRecords = records.filter((record) => record.areaType === "RTO" && record.property === "Total" && marketKeysForMbieArea(record.area).length > 0);
    const maxRecords = context.collectionLimits?.maxRecords ?? relevantRecords.length;
    if (relevantRecords.length > maxRecords) throw new AdapterError("PARSING_ERROR", "MBIE ADP market records exceed the approved record ceiling", false);
    const fetchedAt = new Date();
    const contentRange = response.headers.get("content-range");
    return relevantRecords.slice(0, maxRecords).map((record) => ({
      sourceId: "mbie",
      externalId: record.id,
      payload: { ...record, sourceUrl: MBIE_ADP_URL, contentRange },
      fetchedAt,
      fixture: false,
    }));
  }

  async normalise(records: PublicRawRecord[], _context: AdapterContext): Promise<PublicSignal[]> {
    return records.flatMap((raw) => {
      const record = raw.payload as MbieAccommodationRecord & { sourceUrl?: string; contentRange?: string | null };
      const startsAt = nzStartOfDay(record.period);
      const endsAt = nzStartOfDay(addNzCalendarMonths(record.period, 1));
      const occupancy = numericMeasure(record.measures, "Occupancy rate");
      const quality = String(record.measures["Quality indicator"]?.value ?? "Unknown");
      const marketKeys = marketKeysForMbieArea(record.area);
      return marketKeys.map((marketKey, index): PublicSignal => ({
        sourceId: "mbie",
        externalId: index === 0 ? record.id : `${record.id}:market:${marketKey}`,
        marketKey,
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
      }));
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

}

export function parseMbieMonth(value: string | undefined): Date | null {
  const match = value?.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function numericMeasure(measures: Record<string, MbieMeasure>, name: string): number | null {
  const value = measures[name]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function marketKeysForMbieArea(area: string): string[] {
  const key = slug(area.replace(/\s+(RTO|District|City|Territory)$/i, ""));
  if (["total-new-zealand"].includes(key)) return ["new-zealand"];
  if (["auckland", "tataki-auckland-unlimited"].includes(key)) return ["auckland"];
  if (["wellington", "wellingtonnz", "destination-wairarapa", "lower-hutt", "upper-hutt", "porirua", "kapiti-coast"].includes(key)) return ["wellington"];
  if (["canterbury", "christchurch", "christchurchnz", "selwyn", "waimakariri"].includes(key)) return ["christchurch"];
  if (["queenstown", "destination-queenstown", "wanaka", "lake-wanaka", "lake-wanaka-tourism", "queenstown-lakes"].includes(key)) return ["queenstown-wanaka"];
  if (["rotorua", "rotoruanz"].includes(key)) return ["rotorua"];
  if (["tauranga", "coastal-bay-of-plenty", "tourism-bay-of-plenty", "western-bay-of-plenty"].includes(key)) return ["tauranga"];
  if (key === "bay-of-plenty") return ["rotorua", "tauranga", "nz-region-bay-of-plenty"];
  if (key === "waikato") return ["waikato", "nz-region-waikato"];
  if (["hamilton", "hamilton-waikato-tourism", "waipa", "matamata-piako", "waitomo", "otorohanga"].includes(key)) return ["waikato"];
  if (["lake-taupo", "taupo", "destination-great-lake-taupo"].includes(key)) return ["taupo"];
  if (["dunedin", "enterprise-dunedin"].includes(key)) return ["dunedin"];
  if (["nelson-tasman", "nelson", "tasman", "nelson-regional-development-agency-nrda"].includes(key)) return ["nelson-tasman"];
  if (["hawke-s-bay", "hawke-s-bay-tourism", "napier", "hastings", "central-hawke-s-bay", "wairoa"].includes(key)) return ["hawkes-bay"];
  if (["taranaki", "venture-taranaki", "new-plymouth", "south-taranaki", "stratford"].includes(key)) return ["taranaki"];
  if (["northland", "northland-inc", "whangarei", "far-north", "kaipara"].includes(key)) return ["northland"];
  if (["manawatu", "central-economic-development-agency-ceda", "palmerston-north", "horowhenua"].includes(key)) return ["manawatu"];
  if (["southland", "visit-southland", "fiordland", "visit-fiordland", "invercargill", "gore"].includes(key)) return ["southland-fiordland"];
  if (["gisborne", "tairawhiti", "trust-tairawhiti"].includes(key)) return ["nz-region-gisborne"];
  if (["marlborough", "destination-marlborough"].includes(key)) return ["nz-region-marlborough"];
  if (["west-coast", "development-west-coast", "tourism-west-coast"].includes(key)) return ["nz-region-west-coast"];
  if (key === "otago") return ["nz-region-otago"];
  if (key === "chatham-islands") return ["nz-region-chatham-islands"];
  return [];
}
