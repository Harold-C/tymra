import { addNzCalendarMonths, nzDateKey, nzStartOfDay } from "@tymra/domain";

import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicRawRecord, PublicSignal } from "./adapter-types";
import { AdapterError } from "./adapter-types";

export const AUCKLAND_AIRPORT_MONTHLY_URL = "https://corporate.aucklandairport.co.nz/news/publications/monthly-traffic-updates";
export const MOT_AIRLINE_PERFORMANCE_URL = "https://www.transport.govt.nz/area-of-interest/air-transport/airline-on-time-performance";

export type AucklandAirportMonthlyRecord = {
  period: string;
  domesticPassengers: number | null;
  internationalPassengers: number | null;
  totalPassengers: number;
  annualChangePercent: number | null;
};

export type MotAirlinePerformanceRecord = {
  period: string;
  originAirportCode: string;
  destinationAirportCode: string;
  originName: string | null;
  destinationName: string | null;
  scheduledFlights: number | null;
  arrivalOnTimePercent: number | null;
  departureOnTimePercent: number | null;
  cancelledFlights: number | null;
  cancellationPercent: number | null;
  coverageCaveat: string;
};

const airportMarkets: Readonly<Record<string, { key: string; region: string }>> = {
  AKL: { key: "auckland", region: "Auckland" },
  WLG: { key: "wellington", region: "Wellington" },
  CHC: { key: "christchurch", region: "Canterbury" },
  ZQN: { key: "queenstown-wanaka", region: "Queenstown Lakes" },
  ROT: { key: "rotorua", region: "Bay of Plenty" },
  TRG: { key: "tauranga", region: "Bay of Plenty" },
  HLZ: { key: "waikato", region: "Waikato" },
  DUD: { key: "dunedin", region: "Otago" },
  NSN: { key: "nelson-tasman", region: "Nelson Tasman" },
  NPE: { key: "hawkes-bay", region: "Hawke's Bay" },
  NPL: { key: "taranaki", region: "Taranaki" },
  TUO: { key: "taupo", region: "Waikato" },
  KKE: { key: "northland", region: "Northland" },
  WRE: { key: "northland", region: "Northland" },
  PMR: { key: "manawatu", region: "Manawatū-Whanganui" },
  IVC: { key: "southland-fiordland", region: "Southland" },
};

class AucklandAirportMonthlyArgusAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata(
    "auckland_airport_monthly",
    "Auckland Airport monthly passenger statistics",
    ["corporate.aucklandairport.co.nz"],
    "public:auckland-airport:monthly-passengers-argus-v1",
  );

  async discover(): Promise<string[]> { return [AUCKLAND_AIRPORT_MONTHLY_URL]; }
  async fetch(): Promise<PublicRawRecord[]> { throw argusOnly(this.metadata.sourceName); }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((raw): PublicSignal[] => {
      const payload = raw.payload as { record?: AucklandAirportMonthlyRecord; sourceUrl?: string };
      const record = payload.record;
      const startsAt = record ? periodStart(record.period) : null;
      if (!record || !startsAt) return [];
      return [{
        sourceId: this.metadata.sourceId,
        externalId: raw.externalId,
        marketKey: "auckland",
        type: "TOURISM_DEMAND",
        title: `Auckland Airport passengers - ${startsAt.toLocaleString("en-NZ", { month: "long", year: "numeric", timeZone: "Pacific/Auckland" })}`,
        region: "Auckland",
        startsAt,
        endsAt: nzStartOfDay(addNzCalendarMonths(nzDateKey(startsAt), 1)),
        direction: trendDirection(record.annualChangePercent),
        confidence: 0.9,
        evidenceRef: payload.sourceUrl ?? AUCKLAND_AIRPORT_MONTHLY_URL,
        metadata: { contextSeriesKey: "airport-monthly-passengers", temporalUse: "LAGGED_TREND_CONTEXT", sourceTimezone: "Pacific/Auckland", ...record },
        fixture: false,
      }];
    });
  }

  healthCheck(context: AdapterContext): Promise<AdapterHealth> { return browserHealth(this.metadata.sourceName, context); }
}

class MotAirlinePerformanceArgusAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = metadata(
    "mot_airline_performance",
    "Ministry of Transport airline on-time performance",
    ["www.transport.govt.nz"],
    "public:mot:airline-performance-argus-v1",
  );

  async discover(): Promise<string[]> { return [MOT_AIRLINE_PERFORMANCE_URL]; }
  async fetch(): Promise<PublicRawRecord[]> { throw argusOnly(this.metadata.sourceName); }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((raw): PublicSignal[] => {
      const payload = raw.payload as { record?: MotAirlinePerformanceRecord; sourceUrl?: string };
      const record = payload.record;
      const startsAt = record ? periodStart(record.period) : null;
      if (!record || !startsAt) return [];
      const markets = [record.originAirportCode, record.destinationAirportCode]
        .map((code) => airportMarkets[code.toUpperCase()])
        .filter((market): market is { key: string; region: string } => Boolean(market));
      const uniqueMarkets = [...new Map(markets.map((market) => [market.key, market])).values()];
      const performance = conservativePerformance(record);
      return uniqueMarkets.map((market): PublicSignal => ({
        sourceId: this.metadata.sourceId,
        externalId: `${raw.externalId}:${market.key}`,
        marketKey: market.key,
        type: "TRANSPORT_FLOW",
        title: `${record.originAirportCode}-${record.destinationAirportCode} airline performance - ${record.period}`,
        region: market.region,
        startsAt,
        endsAt: nzStartOfDay(addNzCalendarMonths(nzDateKey(startsAt), 1)),
        direction: performance.direction,
        confidence: performance.confidence,
        evidenceRef: payload.sourceUrl ?? MOT_AIRLINE_PERFORMANCE_URL,
        metadata: {
          contextSeriesKey: `airline-performance:${record.originAirportCode}:${record.destinationAirportCode}`,
          temporalUse: "LAGGED_TREND_CONTEXT",
          sourceTimezone: "Pacific/Auckland",
          voluntaryReporting: true,
          incompleteCoverageCaveat: record.coverageCaveat,
          ...record,
        },
        fixture: false,
      }));
    });
  }

  healthCheck(context: AdapterContext): Promise<AdapterHealth> { return browserHealth(this.metadata.sourceName, context); }
}

export const aviationArgusAdapters: Record<string, PublicDataAdapter> = {
  auckland_airport_monthly: new AucklandAirportMonthlyArgusAdapter(),
  mot_airline_performance: new MotAirlinePerformanceArgusAdapter(),
};

function metadata(sourceId: string, sourceName: string, supportedDomains: string[], adapterKey: string): AdapterMetadata {
  return { sourceId, sourceName, sourceType: "PUBLIC_DATA", supportedDomains, adapterKey, accessMethod: "PUBLIC_WEB_ARGUS_READ_ONLY", concurrencyLimit: 1, dailyBudget: 4, collectorVersion: "argus-browser-v1", parserVersion: `${sourceId}-contract-v1` };
}
function argusOnly(sourceName: string) { return new AdapterError("CONFIGURATION_ERROR", `${sourceName} collection is orchestrated by Argus`, false); }
function periodStart(period: string) { const match = /^(\d{4})-(0[1-9]|1[0-2])$/u.exec(period); return match ? nzStartOfDay(`${match[1]}-${match[2]}-01`) : null; }
function trendDirection(value: number | null): PublicSignal["direction"] { return value === null ? "UNKNOWN" : value > 2 ? "POSITIVE" : value < -2 ? "NEGATIVE" : "MIXED"; }
function conservativePerformance(record: MotAirlinePerformanceRecord): { direction: PublicSignal["direction"]; confidence: number } {
  const cancellation = record.cancellationPercent;
  const onTime = [record.arrivalOnTimePercent, record.departureOnTimePercent].filter((value): value is number => value !== null);
  const averageOnTime = onTime.length ? onTime.reduce((sum, value) => sum + value, 0) / onTime.length : null;
  if (cancellation !== null && cancellation >= 5 || averageOnTime !== null && averageOnTime < 70) return { direction: "NEGATIVE", confidence: 0.78 };
  if (cancellation !== null && cancellation <= 1 && averageOnTime !== null && averageOnTime >= 85) return { direction: "POSITIVE", confidence: 0.72 };
  return { direction: averageOnTime === null && cancellation === null ? "UNKNOWN" : "MIXED", confidence: 0.65 };
}
function browserHealth(sourceName: string, context: AdapterContext): Promise<AdapterHealth> { return Promise.resolve({ status: "DEGRADED", checkedAt: new Date(), message: `${sourceName} requires Argus readiness`, latencyMs: 0, mode: context.mode }); }
