import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicRawRecord, PublicSignal } from "../adapter-types";
import { AdapterError } from "../adapter-types";
import { nzCoverageKeysForAreaText } from "../nz-market-coverage";
import { DOMParser } from "linkedom";
import { isRecord, stringValue, addUtcDays, isoDate, cleanText, readBoundedText } from "./shared";

export const METSERVICE_CAP_RSS_URL = "https://alerts.metservice.com/cap/rss";

export type MetServiceCapFeedItem = {
  title: string;
  link: string;
  description: string | null;
  pubDate: string | null;
  guid: string | null;
};

export type MetServiceCapFeed = {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  lastBuildDate: string | null;
  copyright: string | null;
  items: MetServiceCapFeedItem[];
};

export function metServiceFeedItemVersion(item: Pick<MetServiceCapFeedItem, "guid" | "pubDate">) {
  return `${item.guid ?? ""}|${item.pubDate ?? ""}`;
}

export function changedMetServiceFeedItems(items: MetServiceCapFeedItem[], knownReferenceVersions: Readonly<Record<string, string>> = {}) {
  return items.filter((item) => knownReferenceVersions[item.link] !== metServiceFeedItemVersion(item));
}

export type MetServiceCapInfo = {
  language: string | null;
  category: string[];
  event: string;
  responseType: string[];
  urgency: string | null;
  severity: string | null;
  certainty: string | null;
  effective: string | null;
  onset: string | null;
  expires: string | null;
  senderName: string | null;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  web: string | null;
  parameters: Record<string, string[]>;
  areas: Array<{ areaDesc: string; polygons: string[] }>;
};

export type MetServiceCapAlert = {
  identifier: string;
  sender: string;
  sent: string;
  status: string;
  msgType: string;
  scope: string;
  references: string | null;
  infos: MetServiceCapInfo[];
};

export function parseMetServiceCapFeed(xml: string): MetServiceCapFeed {
  const document = parseXml(xml, "MetService CAP RSS");
  const channel = document.querySelector("channel");
  if (!channel) throw new Error("MetService CAP RSS has no channel");
  const items = [...channel.querySelectorAll("item")].flatMap((item): MetServiceCapFeedItem[] => {
    const title = xmlText(item, "title");
    const link = xmlText(item, "link");
    if (!title || !isAllowedHttpsUrl(link, ["alerts.metservice.com"])) return [];
    return [{
      title,
      link,
      description: xmlText(item, "description") || null,
      pubDate: nullableIsoTimestamp(xmlText(item, "pubDate")),
      guid: xmlText(item, "guid") || null,
    }];
  });
  return {
    title: xmlText(channel, "title") || "MetService New Zealand Weather Warnings",
    link: xmlText(channel, "link") || "https://alerts.metservice.com/",
    description: xmlText(channel, "description"),
    pubDate: nullableIsoTimestamp(xmlText(channel, "pubDate")),
    lastBuildDate: nullableIsoTimestamp(xmlText(channel, "lastBuildDate")),
    copyright: xmlText(channel, "copyright") || null,
    items,
  };
}

export function parseMetServiceCapAlert(xml: string): MetServiceCapAlert {
  const document = parseXml(xml, "MetService CAP alert");
  const alert = document.querySelector("alert");
  if (!alert) throw new Error("MetService CAP document has no alert");
  const identifier = xmlText(alert, "identifier");
  const sender = xmlText(alert, "sender");
  const sent = requiredIsoTimestamp(xmlText(alert, "sent"), "sent");
  const status = xmlText(alert, "status");
  const msgType = xmlText(alert, "msgType");
  const scope = xmlText(alert, "scope");
  if (!identifier || !sender || !status || !msgType || !scope) throw new Error("MetService CAP alert is missing required identity fields");
  const infos = [...alert.querySelectorAll("info")].flatMap((info): MetServiceCapInfo[] => {
    const event = xmlText(info, "event");
    if (!event) return [];
    const parameters: Record<string, string[]> = {};
    for (const parameter of info.querySelectorAll("parameter")) {
      const name = xmlText(parameter, "valueName");
      const value = xmlText(parameter, "value");
      if (!name || !value) continue;
      parameters[name] = [...(parameters[name] ?? []), value];
    }
    const areas = [...info.querySelectorAll("area")].flatMap((area) => {
      const areaDesc = xmlText(area, "areaDesc");
      return areaDesc ? [{ areaDesc, polygons: xmlTexts(area, "polygon") }] : [];
    });
    return [{
      language: xmlText(info, "language") || null,
      category: xmlTexts(info, "category"),
      event,
      responseType: xmlTexts(info, "responseType"),
      urgency: xmlText(info, "urgency") || null,
      severity: xmlText(info, "severity") || null,
      certainty: xmlText(info, "certainty") || null,
      effective: nullableIsoTimestamp(xmlText(info, "effective")),
      onset: nullableIsoTimestamp(xmlText(info, "onset")),
      expires: nullableIsoTimestamp(xmlText(info, "expires")),
      senderName: xmlText(info, "senderName") || null,
      headline: xmlText(info, "headline") || null,
      description: xmlText(info, "description") || null,
      instruction: xmlText(info, "instruction") || null,
      web: safeOptionalHttpsUrl(xmlText(info, "web")),
      parameters,
      areas,
    }];
  });
  if (!infos.length) throw new Error("MetService CAP alert has no supported info block");
  return { identifier, sender, sent, status, msgType, scope, references: xmlText(alert, "references") || null, infos };
}

export class MetServiceCapAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata = {
    sourceId: "metservice",
    sourceName: "MetService Common Alerting Protocol feed",
    sourceType: "PUBLIC_DATA",
    supportedDomains: ["alerts.metservice.com", "www.metservice.com", "metservice.com"],
    adapterKey: "public:metservice:cap-rss-v1",
    accessMethod: "OFFICIAL_PUBLIC_CAP_RSS",
    concurrencyLimit: 1,
    dailyBudget: 288,
    collectorVersion: "metservice-cap-rss-fetch-v1",
    parserVersion: "metservice-cap-1.2-v1",
  };

  async discover(): Promise<string[]> { return [METSERVICE_CAP_RSS_URL]; }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const maxBytes = Math.min(context.collectionLimits?.maxBytes ?? 2_000_000, 2_000_000);
    const response = await fetch(reference, { headers: { accept: "application/rss+xml,application/xml,text/xml", "user-agent": "TymraMarketCollector/1.0" }, signal: context.signal });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `MetService CAP RSS returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    const xml = await readBoundedText(response, maxBytes);
    let feed: MetServiceCapFeed;
    try { feed = parseMetServiceCapFeed(xml); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : "MetService CAP RSS parsing failed", false); }
    const fetchedAt = new Date();
    const records: PublicRawRecord[] = [{
      sourceId: "metservice",
      externalId: `cap-feed:${feed.lastBuildDate ?? feed.pubDate ?? isoDate(fetchedAt)}`,
      payload: { kind: "cap_feed", sourceUrl: METSERVICE_CAP_RSS_URL, feed, rawXml: xml },
      fetchedAt,
      fixture: false,
      networkRequestCount: 1,
    }];
    const detailBudget = context.collectionLimits ? Math.max(0, context.collectionLimits.maxRequests - 1) : feed.items.length;
    const maxRecords = context.collectionLimits?.maxRecords ?? Number.POSITIVE_INFINITY;
    const candidates = changedMetServiceFeedItems(feed.items, context.collectionState?.knownReferenceVersions);
    records[0]!.networkRequestsAvoided = feed.items.length - candidates.length;
    for (const item of candidates.slice(0, Math.min(detailBudget, Math.max(0, maxRecords - 1)))) {
      const detailResponse = await fetch(item.link, { headers: { accept: "application/cap+xml,application/xml,text/xml", "user-agent": "TymraMarketCollector/1.0" }, signal: context.signal });
      if (!detailResponse.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `MetService CAP alert returned HTTP ${detailResponse.status}`, detailResponse.status >= 500 || detailResponse.status === 429);
      const alertXml = await readBoundedText(detailResponse, maxBytes);
      let alert: MetServiceCapAlert;
      try { alert = parseMetServiceCapAlert(alertXml); }
      catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : "MetService CAP alert parsing failed", false); }
      records.push({ sourceId: "metservice", externalId: `cap-alert:${alert.identifier}`, payload: { kind: "cap_alert", sourceUrl: item.link, feedItem: item, alert, rawXml: alertXml }, fetchedAt, fixture: false, networkRequestCount: 1 });
    }
    return records;
  }

  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> {
    return records.flatMap((raw): PublicSignal[] => {
      if (!isRecord(raw.payload) || raw.payload.kind !== "cap_alert" || !isRecord(raw.payload.alert)) return [];
      const payload = raw.payload;
      const alert = payload.alert as unknown as MetServiceCapAlert;
      const info = alert.infos[0];
      if (!info) return [];
      const startsAt = parseIsoTimestamp(info.onset ?? info.effective ?? alert.sent) ?? raw.fetchedAt;
      const parsedEnd = parseIsoTimestamp(info.expires);
      const endsAt = parsedEnd && parsedEnd > startsAt ? parsedEnd : addUtcDays(startsAt, 1);
      const region = info.areas.map((area) => area.areaDesc).join("; ") || "New Zealand";
      const marketKeys = nzCoverageKeysForAreaText(region);
      return marketKeys.map((marketKey, index): PublicSignal => ({
        sourceId: "metservice",
        externalId: index === 0 ? `cap-alert:${alert.identifier}` : `cap-alert:${alert.identifier}:market:${marketKey}`,
        marketKey,
        type: "WEATHER_OR_ACCESS_DISRUPTION",
        title: info.headline || info.event,
        region,
        startsAt,
        endsAt,
        direction: "NEGATIVE",
        confidence: metServiceConfidence(info.severity, info.certainty),
        evidenceRef: stringValue(payload.sourceUrl) || METSERVICE_CAP_RSS_URL,
        metadata: {
          sourceFormat: "OASIS CAP 1.2",
          attribution: info.senderName || alert.sender,
          alert,
          feedItem: isRecord(payload.feedItem) ? payload.feedItem : null,
        },
        fixture: false,
      }));
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(METSERVICE_CAP_RSS_URL, { headers: { accept: "application/rss+xml,application/xml,text/xml" }, signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `MetService CAP RSS returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "MetService CAP RSS health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

}

export function parseXml(xml: string, sourceName: string) {
  const document = new DOMParser().parseFromString(xml, "text/xml");
  if (!document || document.querySelector("parsererror")) throw new Error(`${sourceName} is not valid XML`);
  return document;
}

export type XmlParent = {
  querySelector(selector: string): { textContent: string | null } | null;
  querySelectorAll(selector: string): Iterable<{ textContent: string | null }>;
};

export function xmlText(parent: unknown, tagName: string): string {
  return cleanText((parent as XmlParent).querySelector(tagName)?.textContent ?? "");
}

export function xmlTexts(parent: unknown, tagName: string): string[] {
  return [...(parent as XmlParent).querySelectorAll(tagName)].map((element) => cleanText(element.textContent ?? "")).filter(Boolean);
}

export function parseIsoTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function requiredIsoTimestamp(value: string, field: string): string {
  const parsed = parseIsoTimestamp(value);
  if (!parsed) throw new Error(`MetService CAP alert has invalid ${field}`);
  return parsed.toISOString();
}

export function nullableIsoTimestamp(value: string): string | null {
  return parseIsoTimestamp(value)?.toISOString() ?? null;
}

export function safeOptionalHttpsUrl(value: string): string | null {
  if (!value) return null;
  try { return new URL(value).protocol === "https:" ? value : null; }
  catch { return null; }
}

export function isAllowedHttpsUrl(value: string, hosts: string[]): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hosts.includes(url.hostname.toLowerCase());
  } catch { return false; }
}

export function metServiceConfidence(severity: string | null, certainty: string | null): number {
  const severityScore: Record<string, number> = { Extreme: 0.98, Severe: 0.95, Moderate: 0.85, Minor: 0.7, Unknown: 0.5 };
  const certaintyAdjustment: Record<string, number> = { Observed: 0.02, Likely: 0, Possible: -0.1, Unlikely: -0.2, Unknown: -0.25 };
  return Math.max(0.2, Math.min(1, (severityScore[severity ?? "Unknown"] ?? 0.5) + (certaintyAdjustment[certainty ?? "Unknown"] ?? -0.1)));
}
