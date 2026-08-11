import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicRawRecord, PublicSignal } from "./adapter-types";
import { AdapterError } from "./adapter-types";

class FrontierEventWebAdapter implements PublicDataAdapter {
  constructor(
    readonly metadata: AdapterMetadata,
    private readonly healthUrl: string,
    private readonly discoveryMessage: string,
    private readonly fetchMessage: string,
  ) {}

  async discover(): Promise<string[]> { throw new AdapterError("CONFIGURATION_ERROR", this.discoveryMessage, false); }
  async fetch(): Promise<PublicRawRecord[]> { throw new AdapterError("CONFIGURATION_ERROR", this.fetchMessage, false); }
  async normalise(): Promise<PublicSignal[]> { return []; }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(this.healthUrl, { headers: { accept: "text/html" }, signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : response.status === 429 ? "DEGRADED" : "DOWN", checkedAt: new Date(), message: `${this.metadata.sourceName} public web returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : `${this.metadata.sourceName} health check failed`, latencyMs: Date.now() - started, mode: context.mode };
    }
  }
}

class ArgusEventWebAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata;

  constructor(sourceId: "school_sport_nz" | "school_sport_canterbury" | "ticketek_events" | "dunedinnz_events", sourceName: string, supportedDomains: string[], private readonly healthUrl: string, connector: "sporty-school-sport-public" | "ticketek-public" | "dunedinnz-public", dailyBudget: number) {
    this.metadata = { sourceId, sourceName, sourceType: "PUBLIC_DATA", supportedDomains, adapterKey: `public:${sourceId}:argus-v1`, accessMethod: "PUBLIC_WEB_ARGUS_READ_ONLY", concurrencyLimit: 1, dailyBudget, collectorVersion: `${connector}-1.0.0`, parserVersion: `${connector}-1.0.0` };
  }

  async discover(): Promise<string[]> { throw new AdapterError("CONFIGURATION_ERROR", `${this.metadata.sourceName} collection is orchestrated by Argus`, false); }
  async fetch(): Promise<PublicRawRecord[]> { throw new AdapterError("CONFIGURATION_ERROR", `${this.metadata.sourceName} collection is orchestrated by Argus`, false); }
  async normalise(): Promise<PublicSignal[]> { return []; }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(this.healthUrl, { method: "HEAD", redirect: "manual", signal: context.signal ?? AbortSignal.timeout(10_000) });
      const reachable = response.status > 0 && response.status < 500;
      return { status: reachable ? "DEGRADED" : "DOWN", checkedAt: new Date(), message: `${this.metadata.sourceName} public route returned HTTP ${response.status}; Argus readiness is authoritative`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : `${this.metadata.sourceName} health check failed`, latencyMs: Date.now() - started, mode: context.mode };
    }
  }
}

export const publicEventWebAdapters: Record<string, PublicDataAdapter> = {
  eventfinda: new FrontierEventWebAdapter({ sourceId: "eventfinda", sourceName: "Eventfinda New Zealand", sourceType: "PUBLIC_DATA", supportedDomains: ["www.eventfinda.co.nz", "eventfinda.co.nz"], adapterKey: "public:eventfinda:http-v1", accessMethod: "PUBLIC_HTTP_HTML_JSONLD", concurrencyLimit: 1, dailyBudget: 2_500, collectorVersion: "eventfinda-http-v1", parserVersion: "eventfinda-jsonld-v1" }, "https://www.eventfinda.co.nz/", "Eventfinda discovery is orchestrated by the HTTP crawl frontier", "Eventfinda fetch is orchestrated by the HTTP crawl frontier"),
  ticketmaster: new FrontierEventWebAdapter({ sourceId: "ticketmaster", sourceName: "Ticketmaster New Zealand", sourceType: "PUBLIC_DATA", supportedDomains: ["www.ticketmaster.co.nz", "ticketmaster.co.nz"], adapterKey: "public:ticketmaster:http-listing-argus-detail-v1", accessMethod: "PUBLIC_HTTP_LISTING_ARGUS_DETAIL", concurrencyLimit: 1, dailyBudget: 20, collectorVersion: "ticketmaster-hybrid-v1", parserVersion: "ticketmaster-jsonld-v1" }, "https://www.ticketmaster.co.nz/", "Ticketmaster discovery is orchestrated by the HTTP crawl frontier", "Ticketmaster listing capture is orchestrated by the hybrid crawl frontier"),
  school_sport_nz: new ArgusEventWebAdapter("school_sport_nz", "School Sport New Zealand", ["www.sporty.co.nz"], "https://www.sporty.co.nz/SSNZ/Sport-1/Events", "sporty-school-sport-public", 4),
  school_sport_canterbury: new ArgusEventWebAdapter("school_sport_canterbury", "School Sport Canterbury", ["www.sporty.co.nz", "teamup.com"], "https://www.sporty.co.nz/sscanterbury", "sporty-school-sport-public", 4),
  ticketek_events: new ArgusEventWebAdapter("ticketek_events", "Ticketek New Zealand Events", ["www.ticketek.co.nz", "premier.ticketek.co.nz"], "https://premier.ticketek.co.nz/shows/whatson.aspx", "ticketek-public", 20),
  dunedinnz_events: new ArgusEventWebAdapter("dunedinnz_events", "DunedinNZ Official Events", ["www.dunedinnz.com"], "https://www.dunedinnz.com/visit/dunedin-events/upcoming-events", "dunedinnz-public", 24),
};
