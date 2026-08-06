import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";

import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicRawRecord, PublicSignal } from "./adapter-types";
import { AdapterError } from "./adapter-types";
import type { NzMajorMarketKey } from "./nz-market-coverage";

const INTERISLANDER_ALERTS_URL = "https://www.interislander.co.nz/api/v1/disruption";
const DOC_ALERTS_ROOT = "https://www.doc.govt.nz/parks-and-recreation/know-before-you-go/alerts/";

type InterislanderAlert = {
  id: number;
  title: string;
  summary: string | null;
  content: string | null;
  start: string | null;
  end: string | null;
  last_edited: string | null;
  version: number;
};

type DocAlert = {
  summary: string;
  description: string;
  subText: string;
  sortDate: string;
  displayDate: string;
  associatedBookingIDs: string;
};

type DocAlertGroup = {
  name: string;
  staticLink: string | null;
  alerts: DocAlert[];
  isGeneral: boolean;
};

type DocRegion = {
  slug: string;
  name: string;
  guid: string;
  markets: readonly NzMajorMarketKey[];
};

const DOC_REGIONS: readonly DocRegion[] = [
  { slug: "northland", name: "Northland", guid: "1970ae5f-e8cc-4f9c-ae7f-d51ab0459861", markets: ["northland"] },
  { slug: "auckland", name: "Auckland", guid: "331c76f1-f6bb-4b16-8286-c8898c790572", markets: ["auckland"] },
  { slug: "waikato", name: "Waikato", guid: "95e49818-6340-4a26-b7d7-97505ce20948", markets: ["waikato"] },
  { slug: "bay-of-plenty", name: "Bay of Plenty", guid: "e1ef14e8-90f0-4c51-a053-7cbcbfb748aa", markets: ["rotorua", "tauranga"] },
  { slug: "central-north-island", name: "Central North Island", guid: "1bfaeb64-b76e-4e08-89ce-f8fa4ee2faa8", markets: ["taupo", "rotorua"] },
  { slug: "taranaki", name: "Taranaki", guid: "e6810747-ef20-4750-a30c-e143c57add06", markets: ["taranaki"] },
  { slug: "manawatu-whanganui", name: "Manawatū-Whanganui", guid: "5f6d5a73-831e-42d1-9a87-547419c3bae5", markets: ["manawatu"] },
  { slug: "hawkes-bay", name: "Hawke's Bay", guid: "e32bf744-d2f7-4e6b-a6df-c9aa66276f7e", markets: ["hawkes-bay"] },
  { slug: "wellington-kapiti", name: "Wellington/Kāpiti", guid: "0747533d-95d1-4910-a7ea-844792619e47", markets: ["wellington"] },
  { slug: "nelson-tasman", name: "Nelson/Tasman", guid: "91dc36ea-2787-4f67-bca8-10b780e664f3", markets: ["nelson-tasman"] },
  { slug: "canterbury", name: "Canterbury", guid: "ee4b8b41-873b-43fa-8140-54893feea5cc", markets: ["christchurch"] },
  { slug: "otago", name: "Otago", guid: "8983aaf4-9b86-4d9c-aa23-2afdf3d2767d", markets: ["dunedin", "queenstown-wanaka"] },
  { slug: "fiordland", name: "Fiordland", guid: "3f657f9a-e0b8-4c71-a7f8-662c234cf444", markets: ["southland-fiordland"] },
  { slug: "southland", name: "Southland", guid: "cb79a114-3d7c-42a1-8151-4d0087a75884", markets: ["southland-fiordland"] },
] as const;

export function parseInterislanderAlerts(payload: unknown): InterislanderAlert[] {
  if (!Array.isArray(payload)) throw new Error("Interislander disruption response is not an array");
  return payload.flatMap((value): InterislanderAlert[] => {
    if (!isRecord(value) || !Number.isInteger(value.id) || typeof value.title !== "string" || !Number.isInteger(value.version)) return [];
    return [{
      id: value.id as number,
      title: value.title,
      summary: nullableString(value.summary),
      content: nullableString(value.content),
      start: nullableString(value.start),
      end: nullableString(value.end),
      last_edited: nullableString(value.last_edited),
      version: value.version as number,
    }];
  });
}

export function parseDocAlertGroups(payload: unknown): DocAlertGroup[] {
  if (!Array.isArray(payload)) throw new Error("DOC regional alert response is not an array");
  return payload.flatMap((value): DocAlertGroup[] => {
    if (!isRecord(value) || typeof value.name !== "string" || !Array.isArray(value.alerts)) return [];
    const alerts = value.alerts.flatMap((alert): DocAlert[] => {
      if (!isRecord(alert) || typeof alert.summary !== "string" || typeof alert.description !== "string" || typeof alert.sortDate !== "string") return [];
      return [{
        summary: alert.summary,
        description: alert.description,
        subText: stringValue(alert.subText),
        sortDate: alert.sortDate,
        displayDate: stringValue(alert.displayDate),
        associatedBookingIDs: stringValue(alert.associatedBookingIDs),
      }];
    });
    return alerts.length ? [{ name: value.name, staticLink: nullableString(value.staticLink), alerts, isGeneral: value.isGeneral === true }] : [];
  });
}

class InterislanderDisruptionAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "interislander_alerts", sourceName: "Interislander service alerts", sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.interislander.co.nz"], adapterKey: "public:interislander:service-alerts-json-v1",
    accessMethod: "OFFICIAL_PUBLIC_JSON", concurrencyLimit: 1, dailyBudget: 48,
    collectorVersion: "interislander-alerts-fetch-v1", parserVersion: "interislander-alerts-json-v1",
  };

  async discover(): Promise<string[]> { return [INTERISLANDER_ALERTS_URL]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const payload = await fetchJson(reference, context, "Interislander service alerts");
    let alerts: InterislanderAlert[];
    try { alerts = parseInterislanderAlerts(payload); }
    catch (error) { throw parsingError(error, "Interislander service-alert parsing failed"); }
    return alerts.slice(0, context.collectionLimits?.maxRecords ?? alerts.length).map((alert, index) => ({
      sourceId: "interislander_alerts", externalId: `service-alert:${alert.id}`, payload: { alert, sourceUrl: reference },
      fetchedAt: new Date(), fixture: false, networkRequestCount: index === 0 ? 1 : 0,
    }));
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((raw): PublicSignal[] => {
      const alert = isRecord(raw.payload) && isRecord(raw.payload.alert) ? raw.payload.alert as unknown as InterislanderAlert : null;
      if (!alert) return [];
      const observedDay = utcDay(raw.fetchedAt);
      const endsAt = new Date(observedDay.getTime() + 2 * 86_400_000);
      const description = cleanHtml([alert.summary, alert.content].filter(Boolean).join(" "));
      const markets: readonly NzMajorMarketKey[] = ["wellington", "nelson-tasman"];
      return markets.map((marketKey, index) => ({
        sourceId: "interislander_alerts", externalId: index === 0 ? raw.externalId : `${raw.externalId}:market:${marketKey}`,
        marketKey, type: "WEATHER_OR_ACCESS_DISRUPTION", title: `Interislander: ${alert.title}`, region: "Cook Strait",
        startsAt: observedDay, endsAt, direction: /cancel|closed|suspend|severe|large swell/i.test(`${alert.title} ${description}`) ? "NEGATIVE" : "MIXED",
        confidence: /cancel|closed|suspend/i.test(`${alert.title} ${description}`) ? 0.9 : 0.75,
        evidenceRef: "https://www.interislander.co.nz/plan/service-alerts",
        metadata: { providerAlertId: alert.id, version: alert.version, sourceStart: alert.start, sourceEnd: alert.end, lastEdited: alert.last_edited, description, activeObservationDay: observedDay.toISOString().slice(0, 10) },
        fixture: false,
      }));
    });
  }

  healthCheck(context: AdapterContext): Promise<AdapterHealth> { return jsonHealth(INTERISLANDER_ALERTS_URL, "Interislander service-alert API", context); }
}

class DocRegionalAlertsAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "doc_alerts", sourceName: "DOC regional recreation alerts", sourceType: "PUBLIC_DATA",
    supportedDomains: ["www.doc.govt.nz"], adapterKey: "public:doc:regional-alerts-json-v1",
    accessMethod: "OFFICIAL_PUBLIC_JSON", concurrencyLimit: 1, dailyBudget: DOC_REGIONS.length,
    collectorVersion: "doc-regional-alerts-fetch-v1", parserVersion: "doc-regional-alerts-json-v1",
  };

  async discover(): Promise<string[]> {
    return DOC_REGIONS.map((region) => `https://www.doc.govt.nz/api/alerts/alertregionsummary/${region.guid}`);
  }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const region = DOC_REGIONS.find((candidate) => reference.endsWith(candidate.guid));
    if (!region) throw new AdapterError("INVALID_INPUT", "DOC alert reference is not a configured regional endpoint", false);
    const payload = await fetchJson(reference, context, `DOC ${region.name} alerts`);
    let groups: DocAlertGroup[];
    try { groups = parseDocAlertGroups(payload); }
    catch (error) { throw parsingError(error, `DOC ${region.name} alert parsing failed`); }
    const entries = new Map<string, { group: DocAlertGroup; alert: DocAlert }>();
    for (const group of groups) {
      for (const alert of group.alerts) {
        const description = cleanHtml(alert.description);
        if (!isAccommodationRelevantDocAlert(`${alert.summary} ${description}`)) continue;
        const key = shortHash(`${region.slug}|${alert.summary}|${description}`);
        if (!entries.has(key)) entries.set(key, { group, alert });
      }
    }
    return [...entries].slice(0, context.collectionLimits?.maxRecords ?? entries.size).map(([identity, { group, alert }], index) => {
      const sourceUrl = group.staticLink ? new URL(group.staticLink, DOC_ALERTS_ROOT).href : `https://www.doc.govt.nz/parks-and-recreation/places-to-go/${region.slug}/alerts/`;
      return {
        sourceId: "doc_alerts", externalId: `doc-alert:${region.slug}:${identity}`,
        payload: { region, group, alert, sourceUrl }, fetchedAt: new Date(), fixture: false, networkRequestCount: index === 0 ? 1 : 0,
      };
    });
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((raw): PublicSignal[] => {
      if (!isRecord(raw.payload) || !isRecord(raw.payload.region) || !isRecord(raw.payload.group) || !isRecord(raw.payload.alert)) return [];
      const payload = raw.payload;
      const region = payload.region as unknown as DocRegion;
      const group = payload.group as unknown as DocAlertGroup;
      const alert = payload.alert as unknown as DocAlert;
      const observedDay = utcDay(raw.fetchedAt);
      const endsAt = new Date(observedDay.getTime() + 2 * 86_400_000);
      const description = cleanHtml(alert.description);
      const negative = /closed|closure|do not use|impassable|no access|cancel|suspend|unsafe|danger/i.test(`${alert.summary} ${description}`);
      return region.markets.map((marketKey, index) => ({
        sourceId: "doc_alerts", externalId: index === 0 ? raw.externalId : `${raw.externalId}:market:${marketKey}`,
        marketKey, type: "WEATHER_OR_ACCESS_DISRUPTION", title: `DOC: ${alert.summary}`, region: region.name,
        startsAt: observedDay, endsAt, direction: negative ? "NEGATIVE" : "MIXED", confidence: negative ? 0.85 : 0.7,
        evidenceRef: stringValue(payload.sourceUrl) || DOC_ALERTS_ROOT,
        metadata: { place: group.name, isGeneral: group.isGeneral, description, sourceReviewedAt: alert.sortDate, sourceDisplayDate: alert.displayDate, associatedBookingIDs: alert.associatedBookingIDs, activeObservationDay: observedDay.toISOString().slice(0, 10) },
        fixture: false,
      }));
    });
  }

  healthCheck(context: AdapterContext): Promise<AdapterHealth> { return jsonHealth(`https://www.doc.govt.nz/api/alerts/alertregionsummary/${DOC_REGIONS[0]!.guid}`, "DOC regional-alert API", context); }
}

export const accessDisruptionAdapters: Record<string, PublicDataAdapter> = {
  interislander_alerts: new InterislanderDisruptionAdapter(),
  doc_alerts: new DocRegionalAlertsAdapter(),
};

async function fetchJson(url: string, context: AdapterContext, sourceName: string) {
  const response = await fetch(url, { headers: requestHeaders(), signal: context.signal ?? AbortSignal.timeout(30_000) });
  if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `${sourceName} returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
  const maxBytes = context.collectionLimits?.maxBytes ?? 5_000_000;
  const text = await response.text();
  if (Buffer.byteLength(text) > maxBytes) throw new AdapterError("PARSING_ERROR", `${sourceName} exceeded ${maxBytes} bytes`, false);
  try { return JSON.parse(text) as unknown; }
  catch (error) { throw parsingError(error, `${sourceName} returned invalid JSON`); }
}

async function jsonHealth(url: string, sourceName: string, context: AdapterContext): Promise<AdapterHealth> {
  const started = Date.now();
  try {
    const response = await fetch(url, { headers: requestHeaders(), signal: context.signal ?? AbortSignal.timeout(10_000) });
    return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `${sourceName} returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
  } catch (error) {
    return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : `${sourceName} health check failed`, latencyMs: Date.now() - started, mode: context.mode };
  }
}

function requestHeaders() { return { accept: "application/json", "accept-language": "en-NZ,en;q=0.9", "user-agent": "TymraDataCollector/1.0 (+https://tymra.nz/data-collection)", "x-requested-with": "XMLHttpRequest" }; }
function utcDay(value: Date) { return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`); }
function shortHash(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 20); }
function cleanHtml(value: string) { const { document } = parseHTML(`<body>${value}</body>`); return (document.body.textContent ?? "").replace(/\s+/g, " ").trim(); }
function isAccommodationRelevantDocAlert(value: string) { return /closed|closure|do not use|impassable|no access|cancel|suspend|unsafe|danger|restricted|not available|unavailable|road.{0,30}closed/i.test(value); }
function parsingError(error: unknown, fallback: string) { return new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : fallback, false); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableString(value: unknown) { return typeof value === "string" && value.trim() ? value : null; }
