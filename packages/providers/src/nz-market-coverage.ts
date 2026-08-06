export type NzMarketCoverageStatus = "IMPLEMENTED" | "ARGUS_REQUIRED" | "MISSING";

export type NzMajorMarketCoverage = {
  key: NzMajorMarketKey;
  name: string;
  regions: string[];
  nationalDiscoverySources: string[];
  officialRegionalSources: string[];
  accommodationDemandSources: string[];
  disruptionSources: string[];
  seasonalSources: string[];
  localFlowSources: string[];
  status: NzMarketCoverageStatus;
  argusReason?: string;
};

export type NzMajorMarketKey = "auckland" | "wellington" | "christchurch" | "queenstown-wanaka" | "rotorua" | "tauranga" | "waikato" | "dunedin" | "nelson-tasman" | "hawkes-bay" | "taranaki" | "taupo" | "northland" | "manawatu" | "southland-fiordland";

export type NzSourceOperationalEvidence = {
  sourceId: string;
  lastSuccessAt: Date | string | null;
  successfulRuns72h: number;
  failedRuns72h: number;
  successfulRunDays?: number;
  enabled?: boolean;
  available?: boolean;
  marketKeys?: string[];
};

export type NzPublicSignalCollectionTarget = {
  sourceId: string;
  marketScope: NzMajorMarketKey | "new-zealand";
  layer: "DISCOVERY" | "OFFICIAL_EVENT" | "DEMAND" | "DISRUPTION" | "SEASONAL" | "LOCAL_FLOW";
};

const NATIONAL_DISCOVERY = ["eventfinda", "ticketmaster", "eventbrite_events", "humanitix_events", "ticketek_events"];
const NATIONAL_DEMAND = ["mbie", "stats_nz", "mbie_tourism_flows", "mbie_mrte", "mbie_ivs"];
const NATIONAL_DISRUPTION = ["public_holidays_nz", "school_holidays_nz", "metservice", "nzta", "geonet", "fx_rates", "doc_alerts", "interislander_alerts", "mot_airline_performance"];

/**
 * Product coverage boundary for the public-signal phase. A market is not treated
 * as nationally complete merely because it appears in a national aggregator.
 * It also needs an official regional calendar, accommodation-demand data and
 * national disruption inputs. Market-local transport flow is tracked as an
 * additional depth layer rather than blocking every market that has no public
 * airport, port or cruise feed.
 */
export const NZ_MAJOR_ACCOMMODATION_MARKETS: readonly NzMajorMarketCoverage[] = [
  market("auckland", "Auckland", ["Auckland"], ["venue_calendars", "council_calendars", "university_calendars"], ["port_and_cruise", "auckland_airport_monthly"]),
  market("wellington", "Wellington", ["Wellington"], ["wellingtonnz_events"], ["wellington_airport", "wellington_airport_monthly"]),
  market("christchurch", "Christchurch", ["Canterbury"], ["rto_calendars", "te_pae_events", "venues_otautahi_events", "isaac_theatre_royal_events", "christchurch_council_events", "christchurch_sports", "christchurch_racing"], ["christchurch_airport", "christchurch_cruise", "christchurch_airport_monthly"], ["ski_seasons_nz"]),
  market("queenstown-wanaka", "Queenstown and Wānaka", ["Queenstown Lakes", "Otago"], ["queenstownnz_events"], ["airport_data", "queenstown_airport_monthly"], ["ski_seasons_nz"]),
  market("rotorua", "Rotorua", ["Bay of Plenty"], ["rotoruanz_events"], []),
  market("tauranga", "Tauranga and Mount Maunganui", ["Bay of Plenty"], ["tauranga_events"], []),
  market("waikato", "Hamilton and Waikato", ["Waikato"], ["waikatonz_events"], []),
  market("dunedin", "Dunedin", ["Otago"], ["dunedinnz_events"], [], [], "ARGUS_REQUIRED", "DunedinNZ official event calendar is protected by a Cloudflare browser challenge"),
  market("nelson-tasman", "Nelson and Tasman", ["Nelson", "Tasman"], ["nelsontasman_events"], []),
  market("hawkes-bay", "Napier and Hastings", ["Hawke's Bay"], ["hawkesbaynz_events"], []),
  market("taranaki", "New Plymouth and Taranaki", ["Taranaki"], ["taranakienz_events"], []),
  market("taupo", "Taupō", ["Waikato"], ["tauponz_events"], [], ["ski_seasons_nz"]),
  market("northland", "Whangārei and Bay of Islands", ["Northland"], ["northland_events"], []),
  market("manawatu", "Palmerston North and Manawatū", ["Manawatū-Whanganui"], ["manawatunz_events"], []),
  market("southland-fiordland", "Invercargill, Southland and Fiordland", ["Southland"], ["southlandnz_events"], []),
] as const;

const MARKET_ALIASES: Readonly<Record<string, readonly string[]>> = {
  auckland: ["auckland", "tamaki makaurau"],
  wellington: ["wellington", "te whanganui a tara", "lower hutt", "upper hutt", "porirua", "wairarapa", "kapiti"],
  christchurch: ["christchurch", "otautahi", "canterbury", "selwyn", "waimakariri"],
  "queenstown-wanaka": ["queenstown", "wanaka", "queenstown lakes", "arrowtown", "frankton"],
  rotorua: ["rotorua"],
  tauranga: ["tauranga", "mount maunganui", "mt maunganui", "western bay of plenty"],
  waikato: ["hamilton", "waikato", "cambridge", "te awamutu", "matamata", "waitomo"],
  dunedin: ["dunedin", "otepoti", "clutha"],
  "nelson-tasman": ["nelson", "tasman", "richmond", "motueka", "takaka", "murchison", "marlborough"],
  "hawkes-bay": ["hawkes bay", "hawke s bay", "napier", "hastings", "havelock north"],
  taranaki: ["taranaki", "new plymouth", "stratford", "hawera"],
  taupo: ["taupo", "turangi"],
  northland: ["northland", "whangarei", "bay of islands", "paihia", "kerikeri", "waitangi", "kaikohe", "kaitaia"],
  manawatu: ["manawatu", "palmerston north", "feilding", "levin", "horowhenua", "whanganui", "taihape", "tararua"],
  "southland-fiordland": ["southland", "fiordland", "invercargill", "te anau", "gore"],
};

const MARKET_CENTRES: Readonly<Record<NzMajorMarketKey, readonly [number, number]>> = {
  auckland: [-36.8485, 174.7633], wellington: [-41.2866, 174.7756], christchurch: [-43.5321, 172.6362],
  "queenstown-wanaka": [-44.7485, 169.1608], rotorua: [-38.1368, 176.2497], tauranga: [-37.6878, 176.1651],
  waikato: [-37.787, 175.2793], dunedin: [-45.8788, 170.5028], "nelson-tasman": [-41.2706, 173.284],
  "hawkes-bay": [-39.4928, 176.912], taranaki: [-39.0556, 174.0752], taupo: [-38.6857, 176.0702],
  northland: [-35.7251, 174.3237], manawatu: [-40.3564, 175.6111], "southland-fiordland": [-45.991, 167.99],
};

export function canonicalNzMarketKey(value: string): NzMajorMarketKey | null {
  const normalisedKey = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const exact = NZ_MAJOR_ACCOMMODATION_MARKETS.find((market) => market.key === normalisedKey);
  if (exact) return exact.key;
  for (const market of NZ_MAJOR_ACCOMMODATION_MARKETS) {
    if (MARKET_ALIASES[market.key]?.includes(normaliseLocation(value))) return market.key;
  }
  return null;
}

export function resolveNzMarketKey(location: { city?: string | null; territorialAuthority?: string | null; region?: string | null; rto?: string | null }): NzMajorMarketKey | null {
  for (const candidate of [location.city, location.territorialAuthority, location.rto]) {
    if (!candidate) continue;
    const resolved = canonicalNzMarketKey(candidate);
    if (resolved) return resolved;
  }
  const region = location.region ? normaliseLocation(location.region) : "";
  if (["auckland", "wellington", "canterbury", "nelson", "tasman", "hawkes bay", "taranaki", "northland", "manawatu whanganui", "southland"].includes(region)) {
    return canonicalNzMarketKey(region === "manawatu whanganui" ? "manawatu" : region);
  }
  return null;
}

export function marketKeysForAnniversaryRegion(value: string): NzMajorMarketKey[] {
  const region = normaliseLocation(value).replace(/ anniversary day$/, "");
  const byProvince: Readonly<Record<string, readonly NzMajorMarketKey[]>> = {
    auckland: ["auckland", "northland", "waikato", "taupo", "rotorua", "tauranga"],
    taranaki: ["taranaki"],
    "hawkes bay": ["hawkes-bay"],
    wellington: ["wellington", "manawatu"],
    nelson: ["nelson-tasman"],
    canterbury: ["christchurch"],
    otago: ["dunedin", "queenstown-wanaka"],
    southland: ["southland-fiordland"],
  };
  return [...(byProvince[region] ?? [])];
}

export function nzMarketKeysForAreaText(value: string): NzMajorMarketKey[] {
  const text = normaliseLocation(value);
  if (!text) return [];
  if (text === "new zealand" || text.includes("all of new zealand")) return NZ_MAJOR_ACCOMMODATION_MARKETS.map((market) => market.key);
  const keys = new Set<NzMajorMarketKey>();
  for (const market of NZ_MAJOR_ACCOMMODATION_MARKETS) {
    if (MARKET_ALIASES[market.key]?.some((alias) => containsNormalisedPhrase(text, alias))) keys.add(market.key);
  }
  const broadAreas: Readonly<Record<string, readonly NzMajorMarketKey[]>> = {
    "bay of plenty": ["rotorua", "tauranga"],
    otago: ["dunedin", "queenstown-wanaka"],
    waikato: ["waikato", "taupo"],
    "lower north island": ["wellington", "manawatu"],
    "central north island": ["waikato", "taupo", "rotorua"],
    "top of the south": ["nelson-tasman"],
    "coromandel peninsula": ["waikato", "tauranga"],
  };
  for (const [area, markets] of Object.entries(broadAreas)) if (containsNormalisedPhrase(text, area)) markets.forEach((market) => keys.add(market));
  return [...keys];
}

export function nzMarketKeysWithinDistance(latitude: number, longitude: number, radiusKm: number): NzMajorMarketKey[] {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || radiusKm <= 0) return [];
  return NZ_MAJOR_ACCOMMODATION_MARKETS
    .map((market) => ({ key: market.key, distanceKm: haversineKm(latitude, longitude, ...MARKET_CENTRES[market.key]) }))
    .filter((market) => market.distanceKm <= radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .map((market) => market.key);
}

export function nearestNzMarketKey(latitude: number, longitude: number, maximumDistanceKm = 150): NzMajorMarketKey | null {
  return nzMarketKeysWithinDistance(latitude, longitude, maximumDistanceKm)[0] ?? null;
}

export function publicSignalSourceIdsForMarket(value: string): string[] {
  return publicSignalCollectionPlanForMarket(value).map((target) => target.sourceId);
}

export function publicSignalCollectionPlanForMarket(value: string): NzPublicSignalCollectionTarget[] {
  const key = canonicalNzMarketKey(value);
  if (!key) return [];
  const market = NZ_MAJOR_ACCOMMODATION_MARKETS.find((candidate) => candidate.key === key)!;
  const targets: NzPublicSignalCollectionTarget[] = [
    ...market.nationalDiscoverySources.map((sourceId) => ({ sourceId, marketScope: "new-zealand" as const, layer: "DISCOVERY" as const })),
    ...market.officialRegionalSources.map((sourceId) => ({ sourceId, marketScope: key, layer: "OFFICIAL_EVENT" as const })),
    ...market.accommodationDemandSources.map((sourceId) => ({ sourceId, marketScope: "new-zealand" as const, layer: "DEMAND" as const })),
    ...market.disruptionSources.map((sourceId) => ({ sourceId, marketScope: "new-zealand" as const, layer: "DISRUPTION" as const })),
    ...market.seasonalSources.map((sourceId) => ({ sourceId, marketScope: "new-zealand" as const, layer: "SEASONAL" as const })),
    ...market.localFlowSources.map((sourceId) => ({ sourceId, marketScope: key, layer: "LOCAL_FLOW" as const })),
  ];
  return [...new Map(targets.map((target) => [target.sourceId, target])).values()];
}

export function assessNzMarketCoverage(availableSourceIds: ReadonlySet<string>) {
  const markets = NZ_MAJOR_ACCOMMODATION_MARKETS.map((market) => {
    const missing = {
      nationalDiscovery: missingSources(market.nationalDiscoverySources, availableSourceIds),
      officialRegional: missingSources(market.officialRegionalSources, availableSourceIds),
      accommodationDemand: missingSources(market.accommodationDemandSources, availableSourceIds),
      disruption: missingSources(market.disruptionSources, availableSourceIds),
      seasonal: missingSources(market.seasonalSources, availableSourceIds),
      localFlow: missingSources(market.localFlowSources, availableSourceIds),
    };
    const coreDefined = market.officialRegionalSources.length > 0;
    const coreImplemented = market.status === "IMPLEMENTED"
      && coreDefined
      && missing.nationalDiscovery.length === 0
      && missing.officialRegional.length === 0
      && missing.accommodationDemand.length === 0
      && missing.disruption.length === 0
      && missing.seasonal.length === 0;
    const localFlowImplemented = market.localFlowSources.length > 0 && missing.localFlow.length === 0;
    return { ...market, missing, coreImplemented, localFlowImplemented, implemented: coreImplemented };
  });
  return {
    markets,
    implementedMarkets: markets.filter((market) => market.coreImplemented).length,
    totalMarkets: markets.length,
    complete: markets.every((market) => market.coreImplemented),
    argusRequired: markets.filter((market) => market.status === "ARGUS_REQUIRED").map((market) => ({ key: market.key, name: market.name, reason: market.argusReason! })),
  };
}

/**
 * Runtime acceptance gate for the public-signal phase. Implementation alone is
 * insufficient: a market needs fresh successful runs across independent event,
 * demand and disruption layers. Local transport flow is required when the market
 * has a registered source; markets without an equivalent stable public feed are
 * not penalised for the absence of that optional layer.
 */
export function assessNzMarketOperationalCoverage(evidence: readonly NzSourceOperationalEvidence[], now = new Date()) {
  const bySource = new Map(evidence.map((item) => [item.sourceId, item]));
  const markets = NZ_MAJOR_ACCOMMODATION_MARKETS.map((market) => {
    const healthy = (sourceId: string) => sourceOperationallyHealthy(bySource.get(sourceId), now);
    const healthyDiscovery = market.nationalDiscoverySources.filter(healthy);
    const healthyOfficial = market.officialRegionalSources.filter(healthy);
    const healthyDemand = market.accommodationDemandSources.filter(healthy);
    const healthyDisruption = market.disruptionSources.filter(healthy);
    const healthySeasonal = market.seasonalSources.filter(healthy);
    const healthyLocalFlow = market.localFlowSources.filter(healthy);
    const calendarReady = ["public_holidays_nz", "school_holidays_nz"].every(healthy);
    const liveDisruptionReady = ["metservice", "nzta", "geonet"].some(healthy);
    const requiredOfficialCount = Math.min(2, market.officialRegionalSources.length);
    const layers = {
      discovery: healthyDiscovery.length >= 3,
      officialRegional: requiredOfficialCount > 0 && healthyOfficial.length >= requiredOfficialCount,
      accommodationDemand: healthy("mbie") && sourceHasMarketSignal(bySource.get("mbie"), market.key)
        && healthy("stats_nz") && sourceHasMarketSignal(bySource.get("stats_nz"), "new-zealand")
        && healthy("mbie_tourism_flows") && sourceHasMarketSignal(bySource.get("mbie_tourism_flows"), market.key)
        && healthy("mbie_mrte") && sourceHasMarketSignal(bySource.get("mbie_mrte"), market.key)
        && healthy("mbie_ivs") && sourceHasMarketSignal(bySource.get("mbie_ivs"), "new-zealand"),
      disruption: calendarReady && liveDisruptionReady && healthyDisruption.length >= 4,
      seasonal: market.seasonalSources.length === 0 ? null : healthySeasonal.length === market.seasonalSources.length,
      localFlow: market.localFlowSources.length === 0 ? null : healthyLocalFlow.length >= 1,
    };
    const stable = market.status === "IMPLEMENTED"
      && layers.discovery
      && layers.officialRegional
      && layers.accommodationDemand
      && layers.disruption
      && layers.seasonal !== false
      && layers.localFlow !== false;
    return {
      key: market.key,
      name: market.name,
      stable,
      layers,
      healthySources: [...new Set([...healthyDiscovery, ...healthyOfficial, ...healthyDemand, ...healthyDisruption, ...healthySeasonal, ...healthyLocalFlow])],
      staleOrMissingSources: publicSignalSourceIdsForMarket(market.key).filter((sourceId) => !healthy(sourceId)),
      ...(market.argusReason ? { argusReason: market.argusReason } : {}),
    };
  });
  return {
    markets,
    stableMarkets: markets.filter((market) => market.stable).length,
    totalMarkets: markets.length,
    complete: markets.every((market) => market.stable),
  };
}

function market(key: NzMajorMarketKey, name: string, regions: string[], officialRegionalSources: string[], localFlowSources: string[], seasonalSources: string[] = [], status: NzMarketCoverageStatus = "IMPLEMENTED", argusReason?: string): NzMajorMarketCoverage {
  return { key, name, regions, nationalDiscoverySources: NATIONAL_DISCOVERY, officialRegionalSources, accommodationDemandSources: NATIONAL_DEMAND, disruptionSources: NATIONAL_DISRUPTION, seasonalSources, localFlowSources, status, ...(argusReason ? { argusReason } : {}) };
}

function missingSources(required: string[], available: ReadonlySet<string>) { return required.filter((source) => !available.has(source)); }

function normaliseLocation(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceOperationallyHealthy(evidence: NzSourceOperationalEvidence | undefined, now: Date) {
  if (!evidence?.lastSuccessAt || evidence.enabled === false || evidence.available === false) return false;
  if ((evidence.successfulRunDays ?? 0) < 2) return false;
  const lastSuccessAt = evidence.lastSuccessAt instanceof Date ? evidence.lastSuccessAt : new Date(evidence.lastSuccessAt);
  if (Number.isNaN(lastSuccessAt.getTime())) return false;
  const ageHours = (now.getTime() - lastSuccessAt.getTime()) / 3_600_000;
  if (ageHours < 0 || ageHours > sourceFreshnessHours(evidence.sourceId)) return false;
  const attempts = evidence.successfulRuns72h + evidence.failedRuns72h;
  return attempts < 3 || evidence.successfulRuns72h / attempts >= 0.8;
}

function sourceHasMarketSignal(evidence: NzSourceOperationalEvidence | undefined, marketKey: string) {
  return evidence?.marketKeys?.includes(marketKey) === true;
}

function sourceFreshnessHours(sourceId: string) {
  if (["public_holidays_nz", "school_holidays_nz", "ski_seasons_nz", "mbie", "stats_nz", "mbie_tourism_flows", "mbie_mrte", "mbie_ivs", "wellington_airport_monthly", "christchurch_airport_monthly", "queenstown_airport_monthly", "auckland_airport_monthly", "mot_airline_performance"].includes(sourceId)) return 216;
  if (sourceId === "metservice") return 0.5;
  if (["nzta", "geonet", "airport_data", "wellington_airport", "christchurch_airport", "interislander_alerts"].includes(sourceId)) return 3;
  if (sourceId === "fx_rates") return 36;
  if (sourceId.endsWith("_events") || ["eventfinda", "ticketmaster", "venue_calendars", "council_calendars", "university_calendars", "rto_calendars"].includes(sourceId)) return 30;
  return 36;
}

function containsNormalisedPhrase(text: string, phrase: string) {
  const normalisedPhrase = normaliseLocation(phrase);
  return (` ${text} `).includes(` ${normalisedPhrase} `);
}

function haversineKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
