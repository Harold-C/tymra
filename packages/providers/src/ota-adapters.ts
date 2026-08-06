import { createHash } from "node:crypto";

import type { AdapterContext, AdapterHealth, AdapterMetadata, OtaAdapter, OtaPolicy, OtaRate, OtaRateQuery, OtaUnit, ResolvedOtaListing } from "./adapter-types";
import { AdapterError } from "./adapter-types";

type OtaDefinition = {
  sourceId: string;
  name: string;
  domains: string[];
  type: "OTA" | "META_SEARCH";
  idFromUrl: (url: URL) => string | null;
  canonicalPath: (id: string) => string;
};

const definitions: OtaDefinition[] = [
  { sourceId: "booking", name: "Booking.com", domains: ["booking.com"], type: "OTA", idFromUrl: (url) => url.pathname.match(/^\/hotel\/nz\/([^/]+?)(?:\.html)?\/?$/i)?.[1]?.toLowerCase() ?? null, canonicalPath: (id) => `/hotel/nz/${id}.html` },
  { sourceId: "airbnb", name: "Airbnb", domains: ["airbnb.com", "airbnb.co.nz"], type: "OTA", idFromUrl: (url) => url.pathname.match(/^\/rooms\/(\d+)(?:\/|$)/i)?.[1] ?? null, canonicalPath: (id) => `/rooms/${id}` },
  { sourceId: "expedia", name: "Expedia", domains: ["expedia.co.nz", "expedia.com"], type: "OTA", idFromUrl: expediaGroupId, canonicalPath: (id) => `/Hotel-Information?selected=${encodeURIComponent(id)}` },
  { sourceId: "wotif", name: "Wotif", domains: ["wotif.co.nz"], type: "OTA", idFromUrl: expediaGroupId, canonicalPath: (id) => `/Hotel-Information?selected=${encodeURIComponent(id)}` },
  { sourceId: "hotels", name: "Hotels.com", domains: ["nz.hotels.com", "hotels.com"], type: "OTA", idFromUrl: expediaGroupId, canonicalPath: (id) => `/ho${id}` },
  { sourceId: "bookabach", name: "Bookabach", domains: ["bookabach.co.nz"], type: "OTA", idFromUrl: vrboGroupId, canonicalPath: (id) => `/holiday-accommodation/p${id}` },
  { sourceId: "vrbo", name: "Vrbo", domains: ["vrbo.com"], type: "OTA", idFromUrl: vrboGroupId, canonicalPath: (id) => `/${id}` },
  { sourceId: "agoda", name: "Agoda", domains: ["agoda.com"], type: "OTA", idFromUrl: agodaId, canonicalPath: (id) => `/hotel/nz/${id}.html` },
  { sourceId: "trip", name: "Trip.com", domains: ["nz.trip.com", "trip.com"], type: "OTA", idFromUrl: tripId, canonicalPath: (id) => `/hotels/example-hotel-detail-${id}` },
  { sourceId: "google_hotels", name: "Google Hotels", domains: ["google.com", "google.co.nz"], type: "META_SEARCH", idFromUrl: (url) => url.searchParams.get("q") || url.searchParams.get("hotel"), canonicalPath: (id) => `/travel/hotels?q=${encodeURIComponent(id)}` },
];

export class ResearchOtaAdapter implements OtaAdapter {
  readonly metadata: AdapterMetadata;

  constructor(private readonly definition: OtaDefinition) {
    this.metadata = {
      sourceId: definition.sourceId,
      sourceName: definition.name,
      sourceType: definition.type,
      supportedDomains: definition.domains,
      adapterKey: `ota:${definition.sourceId}:v1`,
      accessMethod: "PUBLIC_WEB_RESEARCH_FIXTURE",
      concurrencyLimit: 1,
      dailyBudget: 100,
      collectorVersion: "ota-fixture-collector-v1",
      parserVersion: "ota-url-parser-v1",
    };
  }

  async identifyProperty(input: string, context: AdapterContext): Promise<ResolvedOtaListing[]> {
    try {
      return [await this.resolveListing(input, context)];
    } catch (error) {
      if (error instanceof AdapterError && error.code === "INVALID_INPUT") return [];
      throw error;
    }
  }

  async resolveListing(input: string, context: AdapterContext): Promise<ResolvedOtaListing> {
    const url = parseUrl(input);
    if (!this.supportsHost(url.hostname)) throw new AdapterError("INVALID_INPUT", `URL is not supported by ${this.definition.name}`, false);
    const sourceListingId = this.definition.idFromUrl(url);
    if (!sourceListingId) throw new AdapterError("INVALID_INPUT", `URL does not identify a ${this.definition.name} accommodation listing`, false);
    if (context.mode === "live") {
      throw new AdapterError("SOURCE_UNAVAILABLE", `${this.definition.name} live collection is not enabled; research fixture is available`, false);
    }
    const idHash = numericHash(`${this.definition.sourceId}:${sourceListingId}`);
    const multiUnit = sourceListingId.toLowerCase().includes("hotel") || sourceListingId.toLowerCase().includes("motel");
    return {
      sourceId: this.definition.sourceId,
      sourceListingId,
      canonicalUrl: this.canonicalUrl(sourceListingId),
      rawUrl: input,
      property: {
        externalId: `${this.definition.sourceId}:${sourceListingId}`,
        canonicalName: `Fixture ${this.definition.name} Property ${sourceListingId}`,
        address: `${10 + (idHash % 80)} Fixture Street, Christchurch Central, Christchurch 8011`,
        city: "Christchurch",
        countryCode: "NZ",
        region: "Canterbury",
        territorialAuthority: "Christchurch City",
        rto: "ChristchurchNZ",
        postcode: "8011",
        latitude: -43.5321 + (idHash % 20) / 10_000,
        longitude: 172.6362 + (idHash % 20) / 10_000,
        microMarket: "Christchurch Central",
        timezone: "Pacific/Auckland",
        propertyType: multiUnit ? "HOTEL" : "SHORT_STAY",
      },
      units: multiUnit ? fixtureHotelUnits(sourceListingId) : [fixtureEntireUnit(sourceListingId)],
      matchConfidence: 1,
      operationalStatus: "HEALTHY",
      fixture: true,
    };
  }

  async listUnits(listing: ResolvedOtaListing, _context: AdapterContext): Promise<OtaUnit[]> {
    return listing.units.map((unit) => ({ ...unit, beds: [...unit.beds], amenities: [...unit.amenities] }));
  }

  async fetchRates(query: OtaRateQuery, context: AdapterContext): Promise<OtaRate[]> {
    if (context.mode === "live") throw new AdapterError("SOURCE_UNAVAILABLE", `${this.definition.name} live rate collection is not enabled`, false);
    const day = Math.floor(new Date(`${query.checkIn}T00:00:00.000Z`).getTime() / 86_400_000);
    const basis = 17_000 + (numericHash(`${this.definition.sourceId}:${query.sourceListingId}:${query.unitExternalId}`) % 7_000) + (day % 7) * 350;
    const checkOut = new Date(`${query.checkIn}T00:00:00.000Z`);
    checkOut.setUTCDate(checkOut.getUTCDate() + query.nights);
    const taxes = Math.round((basis + 1_500) * 0.15);
    return [{
      sourceListingId: query.sourceListingId,
      unitExternalId: query.unitExternalId,
      checkIn: query.checkIn,
      checkOut: checkOut.toISOString().slice(0, 10),
      basePriceMinor: basis,
      taxesMinor: taxes,
      mandatoryFeesMinor: 1_500,
      optionalFeesMinor: 0,
      totalPriceMinor: basis + 1_500 + taxes,
      currency: "NZD",
      mealPlan: "ROOM_ONLY",
      cancellationPolicy: "FLEXIBLE_PUBLIC",
      paymentTerms: "PAY_AT_PROPERTY",
      rateFence: "PUBLIC_ANONYMOUS",
      availabilityStatus: "AVAILABLE",
      restrictionReason: null,
      evidenceRef: `fixture://${this.definition.sourceId}/${query.sourceListingId}/${query.checkIn}/${query.unitExternalId}`,
      sourceUrl: this.canonicalUrl(query.sourceListingId),
      collectedAt: new Date(`${query.checkIn}T00:00:00.000Z`),
      qualityFlags: ["FIXTURE_RECORD_REPLAY"],
      fixture: true,
    }];
  }

  async fetchAvailability(query: OtaRateQuery, context: AdapterContext) {
    const [rate] = await this.fetchRates(query, context);
    return { availabilityStatus: rate.availabilityStatus, restrictionReason: rate.restrictionReason, collectedAt: rate.collectedAt, qualityFlags: [...rate.qualityFlags] };
  }

  async fetchPolicies(query: OtaRateQuery, context: AdapterContext): Promise<OtaPolicy> {
    if (context.mode === "live") throw new AdapterError("SOURCE_UNAVAILABLE", `${this.definition.name} live policy collection is not enabled`, false);
    return { sourceListingId: query.sourceListingId, unitExternalId: query.unitExternalId, cancellationPolicy: "FLEXIBLE_PUBLIC", paymentTerms: "PAY_AT_PROPERTY", minimumStay: null, qualityFlags: ["FIXTURE_RECORD_REPLAY"] };
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    if (context.mode === "live") {
      return { status: "UNCONFIGURED", checkedAt: new Date(), message: "Live mode is not configured", latencyMs: Date.now() - started, mode: context.mode };
    }
    return { status: "HEALTHY", checkedAt: new Date(), message: "Deterministic record/replay fixture is available", latencyMs: Date.now() - started, mode: context.mode };
  }

  private supportsHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    return this.definition.domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }

  private canonicalUrl(id: string): string {
    const domain = this.definition.domains[0];
    const host = domain.startsWith("nz.") ? domain : `www.${domain}`;
    return `https://${host}${this.definition.canonicalPath(id)}`;
  }
}

export const otaAdapters = Object.fromEntries(definitions.map((definition) => [definition.sourceId, new ResearchOtaAdapter(definition)])) as Record<string, OtaAdapter>;

export function getOtaAdapterForInput(input: string): OtaAdapter | null {
  let url: URL;
  try { url = parseUrl(input); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  return Object.values(otaAdapters).find((adapter) => adapter.metadata.supportedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) ?? null;
}

export function parseOtaListingReference(input: string) {
  const url = parseUrl(input);
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const definition = definitions.find((candidate) => candidate.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)));
  if (!definition) throw new AdapterError("INVALID_INPUT", "Listing URL is not from a supported OTA", false);
  const sourceListingId = definition.idFromUrl(url);
  if (!sourceListingId) throw new AdapterError("INVALID_INPUT", `URL does not identify a ${definition.name} accommodation listing`, false);
  return {
    sourceId: definition.sourceId,
    sourceListingId,
    canonicalUrl: canonicalListingReference(definition, url, sourceListingId),
  };
}

function canonicalListingReference(definition: OtaDefinition, input: URL, sourceListingId: string) {
  if (definition.sourceId === "booking" || definition.sourceId === "airbnb") {
    const domain = definition.domains[0];
    return `https://www.${domain}${definition.canonicalPath(sourceListingId)}`;
  }
  if (definition.sourceId === "vrbo") return `https://www.vrbo.com/${sourceListingId}`;
  if (definition.sourceId === "trip") return `https://nz.trip.com/hotels/example-hotel-detail-${sourceListingId}`;
  const canonicalHosts: Record<string, string> = {
    expedia: "www.expedia.co.nz",
    wotif: "www.wotif.co.nz",
    hotels: "nz.hotels.com",
    bookabach: "www.bookabach.co.nz",
    agoda: "www.agoda.com",
  };
  return `https://${canonicalHosts[definition.sourceId] ?? input.hostname.toLowerCase()}${input.pathname}`;
}

function parseUrl(input: string): URL {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
    return url;
  } catch {
    throw new AdapterError("INVALID_INPUT", "Input is not a valid HTTP(S) listing URL", false);
  }
}

function expediaGroupId(url: URL): string | null {
  return url.pathname.match(/\.h(\d+)\.Hotel-Information/i)?.[1]
    ?? url.pathname.match(/\/ho(\d+)(?:\/|$)/i)?.[1]
    ?? url.searchParams.get("selected")
    ?? url.searchParams.get("hotelId");
}

function vrboGroupId(url: URL): string | null {
  return url.pathname.match(/\/p(\d+)(?:\/|$)/i)?.[1]
    ?? url.pathname.match(/\/(\d+)(?:ha)?(?:\/|$)/i)?.[1]
    ?? url.searchParams.get("propertyId");
}

function agodaId(url: URL): string | null {
  return url.searchParams.get("hotel_id")
    ?? normalizedListingSlug(url.pathname.match(/\/([^/]+)\/hotel\/[^/]+(?:\.html)?\/?$/i)?.[1])
    ?? normalizedListingSlug(url.pathname.match(/\/hotel\/[^/]+\/([^/]+?)(?:\.html)?\/?$/i)?.[1]);
}

function tripId(url: URL): string | null {
  return url.pathname.match(/(?:hotel-detail-|\/detail\/)(\d{3,})(?:\/|$)/i)?.[1]
    ?? url.searchParams.get("hotelId");
}

function normalizedListingSlug(value: string | undefined): string | null {
  if (!value) return null;
  const decoded = decodeURIComponent(value).toLowerCase();
  return /^[a-z0-9][a-z0-9-]{2,120}$/u.test(decoded) ? decoded : null;
}

function numericHash(value: string): number {
  return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16);
}

function fixtureEntireUnit(id: string): OtaUnit {
  return { externalId: `${id}:entire`, canonicalName: "Entire one-bedroom unit", sourceUnitName: "Entire one-bedroom unit", unitType: "ENTIRE_APARTMENT", bedrooms: 1, bathrooms: 1, beds: ["queen"], occupancyCapacity: 2, entireOrShared: "ENTIRE", amenities: ["wifi", "kitchen", "parking"] };
}

function fixtureHotelUnits(id: string): OtaUnit[] {
  return [
    { externalId: `${id}:queen-studio`, canonicalName: "Queen Studio", sourceUnitName: "Queen Studio", unitType: "HOTEL_ROOM", bedrooms: 0, bathrooms: 1, beds: ["queen"], occupancyCapacity: 2, entireOrShared: "PRIVATE", amenities: ["wifi", "parking"] },
    { externalId: `${id}:family-suite`, canonicalName: "Family Suite", sourceUnitName: "Family Suite", unitType: "HOTEL_ROOM", bedrooms: 1, bathrooms: 1, beds: ["queen", "single", "single"], occupancyCapacity: 4, entireOrShared: "PRIVATE", amenities: ["wifi", "parking", "kitchenette"] },
  ];
}
