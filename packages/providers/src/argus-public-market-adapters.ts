import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicEvent, PublicRawRecord, PublicSignal } from "./adapter-types";
import { AdapterError } from "./adapter-types";

export type ArgusPublicMarketSourceDefinition = {
  sourceId: string; sourceName: string; kind: "venue" | "cruise" | "airport" | "university";
  connectorId: string; url: string; eventUrl?: string; marketKey: string; city: string; region: string; domains: string[];
};

export const ARGUS_PUBLIC_MARKET_SOURCES = [
  { sourceId: "venue_eden_park", sourceName: "Eden Park official events", kind: "venue", connectorId: "eden-park-public", url: "https://edenpark.co.nz/venue-hire", eventUrl: "https://edenpark.co.nz/events/", marketKey: "auckland", city: "Auckland", region: "Auckland", domains: ["edenpark.co.nz", "www.edenpark.co.nz"] },
  { sourceId: "venue_nzicc", sourceName: "NZICC official events", kind: "venue", connectorId: "nzicc-public", url: "https://nzicc.co.nz/plan-your-event/", eventUrl: "https://nzicc.co.nz/events/", marketKey: "auckland", city: "Auckland", region: "Auckland", domains: ["nzicc.co.nz", "www.nzicc.co.nz"] },
  { sourceId: "venue_sky_stadium", sourceName: "Hnry Stadium official events", kind: "venue", connectorId: "sky-stadium-public", url: "https://www.hnrystadium.co.nz/", eventUrl: "https://www.hnrystadium.co.nz/events", marketKey: "wellington", city: "Wellington", region: "Wellington", domains: ["hnrystadium.co.nz", "www.hnrystadium.co.nz"] },
  { sourceId: "venue_forsyth_barr", sourceName: "Forsyth Barr Stadium official events", kind: "venue", connectorId: "forsyth-barr-stadium-public", url: "https://dunedinvenues.co.nz/venues/forsyth-barr-stadium", eventUrl: "https://dunedinvenues.co.nz/events", marketKey: "dunedin", city: "Dunedin", region: "Otago", domains: ["dunedinvenues.co.nz", "www.dunedinvenues.co.nz"] },
  { sourceId: "venue_takina", sourceName: "Tākina official events", kind: "venue", connectorId: "takina-public", url: "https://www.takina.co.nz/organise/rooms-and-spaces/exhibition-hall", eventUrl: "https://www.takina.co.nz/visit/whats-on", marketKey: "wellington", city: "Wellington", region: "Wellington", domains: ["takina.co.nz", "www.takina.co.nz"] },
  { sourceId: "venue_claudelands", sourceName: "Claudelands official events", kind: "venue", connectorId: "claudelands-public", url: "https://claudelands.co.nz/spaces/our-spaces/venues", eventUrl: "https://claudelands.co.nz/events/all-events", marketKey: "waikato", city: "Hamilton", region: "Waikato", domains: ["claudelands.co.nz", "www.claudelands.co.nz"] },
  { sourceId: "cruise_port_tauranga", sourceName: "Port of Tauranga cruise schedule", kind: "cruise", connectorId: "port-tauranga-cruise-public", url: "https://www.port-tauranga.co.nz/operations/cruise-ship-schedules/", marketKey: "tauranga", city: "Tauranga", region: "Bay of Plenty", domains: ["port-tauranga.co.nz", "www.port-tauranga.co.nz"] },
  { sourceId: "cruise_centreport", sourceName: "CentrePort cruise schedule", kind: "cruise", connectorId: "centreport-cruise-public", url: "https://www.centreport.co.nz/what-we-do/cruise-ships/cruise-schedule", marketKey: "wellington", city: "Wellington", region: "Wellington", domains: ["centreport.co.nz", "www.centreport.co.nz"] },
  { sourceId: "cruise_port_otago", sourceName: "Port Otago cruise schedule", kind: "cruise", connectorId: "port-otago-cruise-public", url: "https://www.portotago.co.nz/marine-and-shipping/shipping-schedule/cruise-ships", marketKey: "dunedin", city: "Dunedin", region: "Otago", domains: ["portotago.co.nz", "www.portotago.co.nz"] },
  { sourceId: "airport_dunedin_live", sourceName: "Dunedin Airport live flight board", kind: "airport", connectorId: "dunedin-airport-public", url: "https://www.dunedinairport.co.nz/flight-information", marketKey: "dunedin", city: "Dunedin", region: "Otago", domains: ["dunedinairport.co.nz", "www.dunedinairport.co.nz"] },
  { sourceId: "airport_rotorua_live", sourceName: "Rotorua Airport live flight board", kind: "airport", connectorId: "rotorua-airport-public", url: "https://www.rotorua-airport.co.nz/arrivals-departures-and-info-for-travellers/", marketKey: "rotorua", city: "Rotorua", region: "Bay of Plenty", domains: ["rotorua-airport.co.nz", "www.rotorua-airport.co.nz"] },
  { sourceId: "airport_hamilton_live", sourceName: "Hamilton Airport live flight board", kind: "airport", connectorId: "hamilton-airport-public", url: "https://www.hamiltonairport.co.nz/flights/", marketKey: "waikato", city: "Hamilton", region: "Waikato", domains: ["hamiltonairport.co.nz", "www.hamiltonairport.co.nz"] },
  { sourceId: "airport_hawkes_bay_live", sourceName: "Hawke's Bay Airport live flight board", kind: "airport", connectorId: "hawkes-bay-airport-public", url: "https://hawkesbay-airport.co.nz/arrival-and-departures/", marketKey: "hawkes-bay", city: "Napier", region: "Hawke's Bay", domains: ["hawkesbay-airport.co.nz", "www.hawkesbay-airport.co.nz"] },
  { sourceId: "airport_new_plymouth_live", sourceName: "New Plymouth Airport live flight board", kind: "airport", connectorId: "new-plymouth-airport-public", url: "https://nplairport.co.nz/flights/", marketKey: "taranaki", city: "New Plymouth", region: "Taranaki", domains: ["nplairport.co.nz", "www.nplairport.co.nz"] },
  { sourceId: "airport_palmerston_north_live", sourceName: "Palmerston North Airport live flight board", kind: "airport", connectorId: "palmerston-north-airport-public", url: "https://pnairport.co.nz/flights/", marketKey: "manawatu", city: "Palmerston North", region: "Manawatū-Whanganui", domains: ["pnairport.co.nz", "www.pnairport.co.nz"] },
  { sourceId: "university_otago_key_dates", sourceName: "University of Otago key dates", kind: "university", connectorId: "otago-university-key-dates-public", url: "https://www.otago.ac.nz/study/academic-key-dates", marketKey: "dunedin", city: "Dunedin", region: "Otago", domains: ["www.otago.ac.nz"] },
  { sourceId: "university_victoria_key_dates", sourceName: "Victoria University of Wellington key dates", kind: "university", connectorId: "victoria-university-key-dates-public", url: "https://www.wgtn.ac.nz/students/study/dates", marketKey: "wellington", city: "Wellington", region: "Wellington", domains: ["www.wgtn.ac.nz", "search.wgtn.ac.nz"] },
  { sourceId: "university_waikato_key_dates", sourceName: "University of Waikato key dates", kind: "university", connectorId: "waikato-university-key-dates-public", url: "https://www.waikato.ac.nz/study/key-university-dates/", marketKey: "waikato", city: "Hamilton", region: "Waikato", domains: ["www.waikato.ac.nz"] },
  { sourceId: "university_massey_key_dates", sourceName: "Massey University key dates", kind: "university", connectorId: "massey-university-key-dates-public", url: "https://www.massey.ac.nz/study/key-dates-for-semesters-exam-periods-other-events/", marketKey: "manawatu", city: "Palmerston North", region: "Manawatū-Whanganui", domains: ["www.massey.ac.nz"] },
  { sourceId: "university_aut_key_dates", sourceName: "AUT key dates", kind: "university", connectorId: "aut-university-key-dates-public", url: "https://www.aut.ac.nz/study/semester-dates", marketKey: "auckland", city: "Auckland", region: "Auckland", domains: ["www.aut.ac.nz"] },
] as const satisfies readonly ArgusPublicMarketSourceDefinition[];

export type ArgusPublicMarketSourceId = (typeof ARGUS_PUBLIC_MARKET_SOURCES)[number]["sourceId"];
export function argusPublicMarketSource(sourceId: string): ArgusPublicMarketSourceDefinition | null { return ARGUS_PUBLIC_MARKET_SOURCES.find((source) => source.sourceId === sourceId) ?? null; }

class ArgusPublicMarketAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata;
  constructor(private readonly definition: ArgusPublicMarketSourceDefinition) {
    this.metadata = { sourceId: definition.sourceId, sourceName: definition.sourceName, sourceType: "PUBLIC_DATA", supportedDomains: definition.domains, adapterKey: `public:${definition.sourceId}:argus-v1`, accessMethod: "PUBLIC_WEB_ARGUS_READ_ONLY", concurrencyLimit: 1, dailyBudget: definition.kind === "airport" ? 48 : definition.kind === "cruise" ? 4 : 8, collectorVersion: `${definition.connectorId}-1.0.0`, parserVersion: `${definition.connectorId}-1.0.0` };
  }
  async discover(): Promise<string[]> { return [this.definition.url]; }
  async fetch(): Promise<PublicRawRecord[]> { throw new AdapterError("CONFIGURATION_ERROR", `${this.definition.sourceName} collection is orchestrated by Argus`, false); }
  async normalise(records: PublicRawRecord[]): Promise<PublicSignal[]> { return records.flatMap((record) => { const payload = record.payload as { kind?: string; signal?: PublicSignal }; return payload.kind === "signal" && payload.signal ? [payload.signal] : []; }); }
  async normaliseEvents(records: PublicRawRecord[]): Promise<PublicEvent[]> { return records.flatMap((record) => { const payload = record.payload as { kind?: string; event?: PublicEvent }; return payload.kind === "event" && payload.event ? [payload.event] : []; }); }
  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try { const response = await fetch(this.definition.url, { method: "HEAD", redirect: "manual", signal: context.signal ?? AbortSignal.timeout(10_000) }); return { status: response.status > 0 && response.status < 500 ? "DEGRADED" : "DOWN", checkedAt: new Date(), message: `${this.definition.sourceName} returned HTTP ${response.status}; Argus readiness is authoritative`, latencyMs: Date.now() - started, mode: context.mode }; }
    catch (error) { return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : `${this.definition.sourceName} health check failed`, latencyMs: Date.now() - started, mode: context.mode }; }
  }
}

export const argusPublicMarketAdapters: Record<string, PublicDataAdapter> = Object.fromEntries(ARGUS_PUBLIC_MARKET_SOURCES.map((definition) => [definition.sourceId, new ArgusPublicMarketAdapter(definition)]));
