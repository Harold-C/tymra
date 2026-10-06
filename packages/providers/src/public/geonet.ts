import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicDiscoveryRequest, PublicRawRecord, PublicSignal } from "../adapter-types";
import { nzDateKey, nzStartOfDay } from "@tymra/domain";
import { AdapterError } from "../adapter-types";
import { nzCoverageKeysForAreaText, nzMarketKeysWithinDistance } from "../nz-market-coverage";
import { parse } from "csv-parse/sync";
import { addUtcDays, readBoundedText } from "./shared";

export class GeoNetAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "geonet",
    sourceName: "GeoNet",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["api.geonet.org.nz"],
    adapterKey: "public:geonet:hazards-v3",
    accessMethod: "OFFICIAL_OPEN_API",
    concurrencyLimit: 2,
    dailyBudget: 2_000,
    collectorVersion: "geonet-fetch-v2",
    parserVersion: "geonet-geojson-v3",
  };

  async discover(_request: PublicDiscoveryRequest, _context: AdapterContext): Promise<string[]> {
    return ["https://api.geonet.org.nz/quake?MMI=3", "https://api.geonet.org.nz/volcano/val"];
  }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const response = await fetch(reference, { headers: { accept: "application/vnd.geo+json;version=2" }, signal: context.signal });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `GeoNet returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    let payload: { features?: Array<{ properties?: Record<string, unknown> }> };
    try { payload = JSON.parse(await readBoundedText(response, context.collectionLimits?.maxBytes ?? 2_000_000)); }
    catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError("PARSING_ERROR", "GeoNet response is not valid GeoJSON", false);
    }
    if (!Array.isArray(payload.features)) throw new AdapterError("PARSING_ERROR", "GeoNet response did not contain GeoJSON features", false);
    const maxRecords = context.collectionLimits?.maxRecords ?? 100;
    const volcanoLevels = reference.includes("/volcano/val");
    if (volcanoLevels && payload.features.length > maxRecords) throw new AdapterError("PARSING_ERROR", "GeoNet volcanic alert list exceeds the approved record ceiling", false);
    return payload.features.slice(0, maxRecords).map((feature, index) => ({
      sourceId: "geonet",
      externalId: volcanoLevels ? `volcano-alert:${String(feature.properties?.volcanoID ?? index)}` : String(feature.properties?.publicID ?? `quake-${index}`),
      payload: { ...feature, sourceKind: volcanoLevels ? "volcano_alert_level" : "earthquake" },
      fetchedAt: new Date(),
      fixture: false,
    }));
  }

  async normalise(records: PublicRawRecord[], _context: AdapterContext): Promise<PublicSignal[]> {
    return records.flatMap((record): PublicSignal[] => {
      const feature = record.payload as { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } };
      const properties = feature.properties ?? {};
      if ((record.payload as { sourceKind?: string }).sourceKind === "volcano_alert_level") {
        const level = Number(properties.level ?? 0);
        if (!Number.isFinite(level) || level <= 0) return [];
        const coordinate = pointCoordinate(feature.geometry?.coordinates);
        if (!coordinate) return [];
        const marketKeys = nzMarketKeysWithinDistance(coordinate.latitude, coordinate.longitude, level >= 3 ? 350 : level >= 2 ? 180 : 120);
        const observedDay = nzDateKey(record.fetchedAt);
        const startsAt = nzStartOfDay(observedDay);
        return marketKeys.map((marketKey, index) => ({
          sourceId: "geonet",
          externalId: index === 0 ? record.externalId : `${record.externalId}:market:${marketKey}`,
          marketKey,
          type: "WEATHER_OR_ACCESS_DISRUPTION",
          title: `GeoNet volcanic alert: ${String(properties.volcanoTitle ?? properties.volcanoID ?? "New Zealand volcano")}`,
          region: String(properties.volcanoTitle ?? "New Zealand"),
          startsAt,
          endsAt: addUtcDays(startsAt, 2),
          direction: level >= 2 ? "NEGATIVE" : "MIXED",
          confidence: Math.min(1, 0.55 + level * 0.1),
          evidenceRef: "https://api.geonet.org.nz/volcano/val",
          metadata: { hazardKind: "VOLCANIC_ALERT_LEVEL", level, aviationColourCode: properties.acc ?? null, activity: properties.activity ?? null, hazards: properties.hazards ?? null, coordinates: coordinate },
          fixture: false,
        }));
      }
      const time = new Date(String(properties.time ?? record.fetchedAt.toISOString()));
      const mmi = Number(properties.mmi ?? properties.MMI ?? 0);
      const coordinate = pointCoordinate(feature.geometry?.coordinates);
      const radiusKm = mmi >= 6 ? 350 : mmi >= 5 ? 220 : mmi >= 4 ? 140 : 80;
      const marketKeys = [...new Set([
        ...nzCoverageKeysForAreaText(String(properties.locality ?? "")),
        ...(coordinate ? nzMarketKeysWithinDistance(coordinate.latitude, coordinate.longitude, radiusKm) : []),
      ])];
      return marketKeys.map((marketKey, index) => ({
        sourceId: "geonet",
        externalId: index === 0 ? record.externalId : `${record.externalId}:market:${marketKey}`,
        marketKey,
        type: "WEATHER_OR_ACCESS_DISRUPTION",
        title: `GeoNet earthquake: ${String(properties.locality ?? "New Zealand")}`,
        region: String(properties.locality ?? "New Zealand"),
        startsAt: time,
        endsAt: new Date(time.getTime() + 24 * 60 * 60 * 1_000),
        direction: mmi >= 5 ? "MIXED" : "UNKNOWN",
        confidence: Number.isFinite(mmi) ? Math.min(1, Math.max(0.2, mmi / 8)) : 0.2,
        evidenceRef: `https://api.geonet.org.nz/quake/${record.externalId}`,
        metadata: { magnitude: properties.magnitude ?? null, mmi, radiusKm, coordinates: coordinate },
        fixture: false,
      }));
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

}

export function geometryCoordinate(geometry: Record<string, unknown> | null) {
  return pointCoordinate(geometry?.coordinates);
}

export function pointCoordinate(value: unknown): { latitude: number; longitude: number } | null {
  const points: Array<{ latitude: number; longitude: number }> = [];
  const visit = (candidate: unknown) => {
    if (!Array.isArray(candidate)) return;
    if (candidate.length >= 2 && typeof candidate[0] === "number" && typeof candidate[1] === "number") {
      const longitude = candidate[0];
      const latitude = candidate[1];
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) points.push({ latitude, longitude });
      return;
    }
    candidate.forEach(visit);
  };
  visit(value);
  if (!points.length) return null;
  return {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  };
}
