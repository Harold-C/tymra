import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicRawRecord, PublicSignal } from "../adapter-types";
import { AdapterError } from "../adapter-types";
import { nearestNzMarketKey, nzCoverageKeysForAreaText } from "../nz-market-coverage";
import { parse } from "csv-parse/sync";
import { geometryCoordinate } from "./geonet";
import { parseNewZealandLocalDate } from "./stats-nz-travel";
import { isRecord, stringValue, addUtcDays, cleanText, readBoundedText } from "./shared";

export const NZTA_DELAYS_URL = "https://www.journeys.nzta.govt.nz/assets/map-data-cache/delays.json";

export type NztaDelayFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: Record<string, unknown> | null;
};

export type NztaDelayRecord = {
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

export class NztaJourneyPlannerAdapter implements PublicDataAdapter {
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
    return records.flatMap((raw): PublicSignal[] => {
      const record = raw.payload as NztaDelayRecord;
      const properties = record.feature.properties;
      const startsAt = record.startsAt ? new Date(record.startsAt) : raw.fetchedAt;
      const parsedEnd = record.endsAt ? new Date(record.endsAt) : null;
      const endsAt = parsedEnd && parsedEnd > startsAt ? parsedEnd : addUtcDays(startsAt, 1);
      const eventType = cleanText(stringValue(properties.EventType ?? properties.type));
      const impact = cleanText(stringValue(properties.Impact));
      const isCritical = Number(properties.IsCritical ?? 0) === 1;
      const coordinate = geometryCoordinate(record.feature.geometry);
      const textMarkets = nzCoverageKeysForAreaText([properties.Name, properties.LocationArea, properties.EventDescription, properties.EventComments].map(stringValue).join(" "));
      const nearestMarket = coordinate ? nearestNzMarketKey(coordinate.latitude, coordinate.longitude, 150) : null;
      const marketKeys = [...new Set([...textMarkets, ...(nearestMarket ? [nearestMarket] : [])])];
      return marketKeys.map((marketKey, index) => ({
        sourceId: "nzta",
        externalId: index === 0 ? record.id : `${record.id}:market:${marketKey}`,
        marketKey,
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
      }));
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

}

export function nztaPriority(record: NztaDelayRecord): number {
  const properties = record.feature.properties;
  if (Number(properties.IsCritical ?? 0) === 1) return 5;
  if (/closed/i.test(stringValue(properties.Impact))) return 4;
  if (/delay|restriction/i.test(stringValue(properties.Impact))) return 3;
  if (String(properties.Status) === "Active") return 2;
  return 1;
}
