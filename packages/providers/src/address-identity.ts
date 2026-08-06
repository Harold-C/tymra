import { createHash } from "node:crypto";

import type { PropertyMatchStatus } from "@tymra/domain";

const DEFAULT_ENDPOINT = "https://services.arcgis.com/xdsHIIxuCWByZiCB/ArcGIS/rest/services/LINZ_NZ_Addresses/FeatureServer/0/query";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_CACHE_ENTRIES = 2_000;
const UNIQUE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MULTIPLE_TTL_MS = 24 * 60 * 60 * 1_000;
const NONE_TTL_MS = 60 * 60 * 1_000;
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export const ADDRESS_IDENTITY_RESOLVER_VERSION = "linz-arcgis-v2";

export type AddressIdentity = {
  provider: "linz-nz-addresses";
  externalId: string;
  normalizedAddress: string;
  city: string;
  countryCode: "NZ";
  region: string | null;
  territorialAuthority: string;
  rto: string | null;
  postcode: string | null;
  latitude: number;
  longitude: number;
  confidence: number;
  matchStatus: PropertyMatchStatus;
  lifecycle: string | null;
  sourceUrl: string;
};

export type AddressIdentitySearchResult = {
  query: string;
  normalizedQuery: string;
  candidates: AddressIdentity[];
  matchStatus: PropertyMatchStatus;
  cache: { hit: boolean; expiresAt: string; layer?: "memory" | "database" | "source" | "stale" };
  warnings: string[];
};

export type PersistentAddressResolution = {
  candidates: AddressIdentity[];
  matchStatus: PropertyMatchStatus;
  warnings: string[];
  validUntil: string;
  staleUntil: string;
};

export type AddressIdentityCacheKey = {
  queryHash: string;
  providerKey: string;
  resolverVersion: string;
  resultLimit: number;
};

export interface AddressIdentityPersistentCache {
  read(key: AddressIdentityCacheKey): Promise<PersistentAddressResolution | null>;
  write(key: AddressIdentityCacheKey, value: PersistentAddressResolution): Promise<void>;
  recordHit?(key: AddressIdentityCacheKey): Promise<void>;
}

export type AddressIdentitySearchContext = {
  correlationId: string;
  limit?: number;
  signal?: AbortSignal;
  queryHash?: string;
  persistentCache?: AddressIdentityPersistentCache;
  withCacheLock?: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
};

export interface AddressIdentityProvider {
  readonly key: string;
  search(query: string, context: AddressIdentitySearchContext): Promise<AddressIdentitySearchResult>;
}

type CacheEntry = { value: Omit<AddressIdentitySearchResult, "cache">; expiresAt: number };
type ArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: { x?: unknown; y?: unknown };
};

export class LinzAddressIdentityProvider implements AddressIdentityProvider {
  readonly key = "linz-nz-addresses";
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly options: {
    fetch?: typeof fetch;
    endpoint?: string;
    ttlMs?: number;
    timeoutMs?: number;
    now?: () => number;
  } = {}) {}

  async search(query: string, context: AddressIdentitySearchContext): Promise<AddressIdentitySearchResult> {
    const normalizedQuery = normalizeAddressQuery(query);
    if (normalizedQuery.length < 3) return emptyResult(query, normalizedQuery, false, ["ADDRESS_QUERY_TOO_SHORT"]);
    const now = (this.options.now ?? Date.now)();
    const limit = Math.min(Math.max(context.limit ?? 8, 1), 20);
    const cacheKey = `${normalizedQuery}:${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return { ...cloneResult(cached.value), query, cache: { hit: true, layer: "memory", expiresAt: new Date(cached.expiresAt).toISOString() } };
    }

    const persistentKey = context.queryHash && context.persistentCache ? {
      queryHash: context.queryHash,
      providerKey: this.key,
      resolverVersion: ADDRESS_IDENTITY_RESOLVER_VERSION,
      resultLimit: limit,
    } : null;
    const persistent = persistentKey ? await context.persistentCache!.read(persistentKey) : null;
    if (persistent && Date.parse(persistent.validUntil) > now) {
      await context.persistentCache!.recordHit?.(persistentKey!);
      return this.rememberPersistent(cacheKey, query, normalizedQuery, persistent, now, "database");
    }

    const fetchAndPersist = async () => {
      if (persistentKey) {
        const refreshed = await context.persistentCache!.read(persistentKey);
        if (refreshed && Date.parse(refreshed.validUntil) > (this.options.now ?? Date.now)()) {
          await context.persistentCache!.recordHit?.(persistentKey);
          return this.rememberPersistent(cacheKey, query, normalizedQuery, refreshed, (this.options.now ?? Date.now)(), "database");
        }
      }
      try {
        const result = await this.searchSource(query, normalizedQuery, limit, context.signal);
        const fetchedAt = (this.options.now ?? Date.now)();
        const ttlMs = this.options.ttlMs ?? ttlForMatchStatus(result.matchStatus);
        const resolution: PersistentAddressResolution = {
          candidates: result.candidates,
          matchStatus: result.matchStatus,
          warnings: result.warnings,
          validUntil: new Date(fetchedAt + ttlMs).toISOString(),
          staleUntil: new Date(fetchedAt + ttlMs + STALE_TTL_MS).toISOString(),
        };
        if (persistentKey) await context.persistentCache!.write(persistentKey, resolution);
        const value = { query, normalizedQuery, candidates: result.candidates, matchStatus: result.matchStatus, warnings: result.warnings };
        this.storeCacheEntry(cacheKey, { value: cloneResult(value), expiresAt: fetchedAt + ttlMs }, fetchedAt);
        return { ...value, cache: { hit: false, layer: "source" as const, expiresAt: resolution.validUntil } };
      } catch (error) {
        if (persistent && Date.parse(persistent.staleUntil) > (this.options.now ?? Date.now)()) {
          await context.persistentCache?.recordHit?.(persistentKey!);
          return this.rememberPersistent(cacheKey, query, normalizedQuery, { ...persistent, warnings: [...persistent.warnings, "STALE_ADDRESS_IDENTITY"] }, (this.options.now ?? Date.now)(), "stale");
        }
        throw error;
      }
    };

    return context.withCacheLock && persistentKey
      ? context.withCacheLock(`address-identity:${persistentKey.queryHash}:${limit}`, fetchAndPersist)
      : fetchAndPersist();
  }

  private async searchSource(query: string, normalizedQuery: string, limit: number, signal?: AbortSignal) {

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      let features: ArcGisFeature[] = [];
      for (const searchTerm of linzSearchTerms(query)) {
        const url = new URL(this.options.endpoint ?? DEFAULT_ENDPOINT);
        url.searchParams.set("where", "1=1");
        url.searchParams.set("fullText", JSON.stringify([{ onFields: ["full_address"], searchTerm, searchType: "simple" }]));
        url.searchParams.set("outFields", "address_id,full_address,suburb_locality,town_city,territorial_authority,address_lifecycle");
        url.searchParams.set("returnGeometry", "true");
        url.searchParams.set("outSR", "4326");
        url.searchParams.set("resultRecordCount", String(limit));
        url.searchParams.set("f", "json");
        const response = await (this.options.fetch ?? fetch)(url, { headers: { accept: "application/json" }, signal: controller.signal });
        if (!response.ok) throw new Error(`LINZ address query returned HTTP ${response.status}`);
        const payload = await response.json() as { features?: ArcGisFeature[]; error?: { message?: string } };
        if (payload.error) throw new Error(payload.error.message ?? "LINZ address query failed");
        features = payload.features ?? [];
        if (features.length) break;
      }
      const postcode = query.match(/\b\d{4}\b/)?.[0] ?? null;
      const ranked = features
        .map((feature) => addressIdentityFromFeature(feature, normalizedQuery, postcode))
        .filter((candidate): candidate is AddressIdentity => candidate !== null)
        .sort((left, right) => right.confidence - left.confidence || left.normalizedAddress.localeCompare(right.normalizedAddress));
      const mentionedRegions = regionsMentionedByQuery(query);
      const deduplicated = deduplicate(ranked);
      const candidates = mentionedRegions.length
        ? deduplicated.filter((candidate) => candidate.region !== null && mentionedRegions.includes(candidate.region))
        : deduplicated;
      const matchStatus = classifyCandidates(candidates);
      const classified = candidates.map((candidate) => ({ ...candidate, matchStatus }));
      const warnings = addressWarnings(classified, matchStatus, deduplicated.length > candidates.length);
      return { candidates: classified, matchStatus, warnings };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("LINZ address query timed out");
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  private rememberPersistent(cacheKey: string, query: string, normalizedQuery: string, persistent: PersistentAddressResolution, now: number, layer: "database" | "stale") {
    const expiresAt = Math.max(now + 1_000, Date.parse(persistent.validUntil));
    const value = { query, normalizedQuery, candidates: persistent.candidates, matchStatus: persistent.matchStatus, warnings: persistent.warnings };
    this.storeCacheEntry(cacheKey, { value: cloneResult(value), expiresAt }, now);
    return { ...value, cache: { hit: true, layer, expiresAt: persistent.validUntil } };
  }

  private storeCacheEntry(key: string, entry: CacheEntry, now: number) {
    for (const [candidateKey, candidate] of this.cache) if (candidate.expiresAt <= now) this.cache.delete(candidateKey);
    this.cache.set(key, entry);
    while (this.cache.size > MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
  }
}

export const linzAddressIdentityProvider = new LinzAddressIdentityProvider();

export const NZ_ADDRESS_ACCEPTANCE_CORPUS = [
  { region: "Auckland", input: "100 Queen Street, Auckland" },
  { region: "Bay of Plenty", input: "135C Grace Road, Tauranga" },
  { region: "Canterbury", input: "53 Hereford Street, Christchurch" },
  { region: "Chatham Islands", input: "4A Waitangi Tuku Road, Chatham Islands" },
  { region: "Gisborne", input: "15 Fitzherbert Street, Gisborne" },
  { region: "Hawke's Bay", input: "215 Hastings Street South, Napier" },
  { region: "Manawatū-Whanganui", input: "10 Otaki Place, Palmerston North" },
  { region: "Marlborough", input: "15 Seymour Street, Blenheim" },
  { region: "Nelson", input: "110 Trafalgar Street, Nelson" },
  { region: "Northland", input: "1773 Whangarei Heads Road, Whangārei Heads" },
  { region: "Otago", input: "8A Arnold Street, Dunedin" },
  { region: "Southland", input: "101 Esk Street, Invercargill" },
  { region: "Taranaki", input: "84 Liardet Street, New Plymouth" },
  { region: "Tasman", input: "4D Edward Street, Richmond, Tasman" },
  { region: "Waikato", input: "10 Bristol Place, Hamilton" },
  { region: "Wellington", input: "20 Customhouse Quay, Wellington" },
  { region: "West Coast", input: "30 Manuka Place, Greymouth" },
] as const;

export function nzRegionForTerritorialAuthority(value: string): string | null {
  return TA_TO_REGION[normalizePlace(value)] ?? null;
}

export function nzRtoForAddress(territorialAuthority: string, city: string): string | null {
  const cityKey = normalizePlace(city);
  const cityMatch = CITY_TO_RTO[cityKey];
  if (cityMatch) return cityMatch;
  return TA_TO_RTO[normalizePlace(territorialAuthority)] ?? null;
}

function addressIdentityFromFeature(feature: ArcGisFeature, query: string, postcode: string | null): AddressIdentity | null {
  const attributes = feature.attributes ?? {};
  const externalId = stringOrNumber(attributes.address_id);
  const normalizedAddress = stringValue(attributes.full_address);
  const territorialAuthority = stringValue(attributes.territorial_authority);
  const city = stringValue(attributes.town_city) ?? stringValue(attributes.suburb_locality);
  const latitude = numberValue(feature.geometry?.y);
  const longitude = numberValue(feature.geometry?.x);
  if (!externalId || !normalizedAddress || !territorialAuthority || !city || latitude === null || longitude === null) return null;
  const normalizedCandidate = normalizeAddressText(normalizedAddress);
  const queryTokens = tokens(query);
  const candidateTokens = new Set(tokens(normalizedCandidate));
  const matchedTokens = queryTokens.filter((token) => candidateTokens.has(token)).length;
  const tokenScore = queryTokens.length ? matchedTokens / queryTokens.length : 0;
  const exact = normalizedCandidate === query;
  const confidence = Number(Math.min(1, exact ? 1 : 0.62 + tokenScore * 0.35).toFixed(3));
  return {
    provider: "linz-nz-addresses",
    externalId: `linz-address:${externalId}`,
    normalizedAddress,
    city,
    countryCode: "NZ",
    region: nzRegionForTerritorialAuthority(territorialAuthority),
    territorialAuthority,
    rto: nzRtoForAddress(territorialAuthority, city),
    postcode,
    latitude,
    longitude,
    confidence,
    matchStatus: "NONE",
    lifecycle: stringValue(attributes.address_lifecycle),
    sourceUrl: "https://data.linz.govt.nz/layer/105689-nz-addresses/",
  };
}

function classifyCandidates(candidates: AddressIdentity[]): PropertyMatchStatus {
  if (!candidates.length || candidates[0].confidence < 0.78) return "NONE";
  if (candidates.length === 1) return "UNIQUE";
  return candidates[0].confidence - candidates[1].confidence >= 0.08 ? "UNIQUE" : "MULTIPLE";
}

function addressWarnings(candidates: AddressIdentity[], status: PropertyMatchStatus, removedCrossRegion: boolean) {
  const warnings: string[] = [];
  if (status === "NONE" && candidates.length) warnings.push("LOW_CONFIDENCE_ADDRESS");
  if (status === "MULTIPLE") warnings.push("ADDRESS_CONFIRMATION_REQUIRED");
  if (candidates.some((candidate) => !candidate.region)) warnings.push("REGION_UNRESOLVED");
  if (removedCrossRegion) warnings.push("CROSS_REGION_RESULT_REMOVED");
  return warnings;
}

function regionsMentionedByQuery(query: string) {
  const normalized = ` ${normalizeAddressText(query)} `;
  return Object.values(TA_TO_REGION)
    .filter((region, index, values) => values.indexOf(region) === index)
    .filter((region) => normalized.includes(` ${normalizeAddressText(region)} `));
}

function linzSearchTerms(query: string) {
  const withoutPostcode = normalizeAddressText(query).replace(/\b\d{4}\b/g, "").replace(/\s+/g, " ").trim();
  const terms = [withoutPostcode];
  const withoutRegion = regionsMentionedByQuery(query).reduce(
    (value, region) => value.replace(new RegExp(`\\b${escapeRegExp(normalizeAddressText(region))}\\b`, "g"), " "),
    withoutPostcode,
  ).replace(/\s+/g, " ").trim();
  if (withoutRegion && withoutRegion !== withoutPostcode) terms.push(withoutRegion);
  return [...new Set(terms)];
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function deduplicate(candidates: AddressIdentity[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => !seen.has(candidate.externalId) && Boolean(seen.add(candidate.externalId)));
}

function emptyResult(query: string, normalizedQuery: string, hit: boolean, warnings: string[]): AddressIdentitySearchResult {
  return { query, normalizedQuery, candidates: [], matchStatus: "NONE", cache: { hit, expiresAt: new Date(0).toISOString() }, warnings };
}

function cloneResult<T>(value: T): T { return structuredClone(value); }
export function normalizeAddressQuery(value: string) { return normalizePlace(value).replace(/\bnew zealand\b/g, "").replace(/\s+/g, " ").trim(); }
const normalizeAddressText = normalizeAddressQuery;
function normalizePlace(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function tokens(value: string) { return normalizeAddressText(value).split(" ").filter((token) => token.length > 1 || /^\d+$/.test(token)); }
function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function stringOrNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? String(value) : stringValue(value); }
function numberValue(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }

const TA_TO_REGION: Readonly<Record<string, string>> = {
  "far north district": "Northland", "whangarei district": "Northland", "kaipara district": "Northland",
  auckland: "Auckland",
  "thames coromandel district": "Waikato", "hauraki district": "Waikato", "waikato district": "Waikato", "matamata piako district": "Waikato", "hamilton city": "Waikato", "waipa district": "Waikato", "otorohanga district": "Waikato", "south waikato district": "Waikato", "waitomo district": "Waikato", "taupo district": "Waikato",
  "western bay of plenty district": "Bay of Plenty", "tauranga city": "Bay of Plenty", "rotorua district": "Bay of Plenty", "whakatane district": "Bay of Plenty", "kawerau district": "Bay of Plenty", "opōtiki district": "Bay of Plenty", "opotiki district": "Bay of Plenty",
  "gisborne district": "Gisborne",
  "wairoa district": "Hawke's Bay", "hastings district": "Hawke's Bay", "napier city": "Hawke's Bay", "central hawke s bay district": "Hawke's Bay",
  "new plymouth district": "Taranaki", "stratford district": "Taranaki", "south taranaki district": "Taranaki",
  "ruapehu district": "Manawatū-Whanganui", "whanganui district": "Manawatū-Whanganui", "rangitikei district": "Manawatū-Whanganui", "manawatu district": "Manawatū-Whanganui", "palmerston north city": "Manawatū-Whanganui", "tararua district": "Manawatū-Whanganui", "horowhenua district": "Manawatū-Whanganui",
  "kapiti coast district": "Wellington", "porirua city": "Wellington", "upper hutt city": "Wellington", "lower hutt city": "Wellington", "hutt city": "Wellington", "wellington city": "Wellington", "masterton district": "Wellington", "carterton district": "Wellington", "south wairarapa district": "Wellington",
  "tasman district": "Tasman", "nelson city": "Nelson", "marlborough district": "Marlborough",
  "kaikoura district": "Canterbury", "hurunui district": "Canterbury", "waimakariri district": "Canterbury", "christchurch city": "Canterbury", "selwyn district": "Canterbury", "ashburton district": "Canterbury", "timaru district": "Canterbury", "mackenzie district": "Canterbury", "waimate district": "Canterbury",
  "buller district": "West Coast", "grey district": "West Coast", "westland district": "West Coast",
  "waitaki district": "Otago", "central otago district": "Otago", "queenstown lakes district": "Otago", "dunedin city": "Otago", "clutha district": "Otago",
  "southland district": "Southland", "gore district": "Southland", "invercargill city": "Southland",
  "chatham islands territory": "Chatham Islands", "chatham islands council": "Chatham Islands",
};

const TA_TO_RTO: Readonly<Record<string, string>> = {
  "far north district": "Northland Inc", "whangarei district": "Northland Inc", "kaipara district": "Northland Inc", auckland: "Tātaki Auckland Unlimited",
  "thames coromandel district": "Destination Hauraki Coromandel", "hamilton city": "Hamilton & Waikato Tourism", "waikato district": "Hamilton & Waikato Tourism", "waipa district": "Hamilton & Waikato Tourism", "waitomo district": "Hamilton & Waikato Tourism", "taupo district": "Destination Great Lake Taupō",
  "rotorua district": "RotoruaNZ", "tauranga city": "Tourism Bay of Plenty", "western bay of plenty district": "Tourism Bay of Plenty", "whakatane district": "Tourism Bay of Plenty", "kawerau district": "Tourism Bay of Plenty", "opōtiki district": "Tourism Bay of Plenty", "opotiki district": "Tourism Bay of Plenty",
  "gisborne district": "Tairāwhiti Gisborne", "wairoa district": "Hawke's Bay Tourism", "hastings district": "Hawke's Bay Tourism", "napier city": "Hawke's Bay Tourism", "central hawke s bay district": "Hawke's Bay Tourism",
  "new plymouth district": "Venture Taranaki", "stratford district": "Venture Taranaki", "south taranaki district": "Venture Taranaki",
  "palmerston north city": "Central Economic Development Agency", "manawatu district": "Central Economic Development Agency", "wellington city": "WellingtonNZ", "porirua city": "WellingtonNZ", "upper hutt city": "WellingtonNZ", "lower hutt city": "WellingtonNZ", "hutt city": "WellingtonNZ",
  "tasman district": "Nelson Regional Development Agency", "nelson city": "Nelson Regional Development Agency", "marlborough district": "Destination Marlborough",
  "buller district": "Development West Coast", "grey district": "Development West Coast", "westland district": "Development West Coast",
  "christchurch city": "ChristchurchNZ", "selwyn district": "ChristchurchNZ", "waimakariri district": "ChristchurchNZ", "mackenzie district": "Mackenzie Tourism", "waitaki district": "Tourism Waitaki", "dunedin city": "Enterprise Dunedin", "queenstown lakes district": "Destination Queenstown", "central otago district": "Tourism Central Otago",
  "southland district": "Great South", "gore district": "Great South", "invercargill city": "Great South",
};

const CITY_TO_RTO: Readonly<Record<string, string>> = {
  queenstown: "Destination Queenstown", wanaka: "Lake Wānaka Tourism", "wānaka": "Lake Wānaka Tourism", taupo: "Destination Great Lake Taupō", "taupō": "Destination Great Lake Taupō", rotorua: "RotoruaNZ", christchurch: "ChristchurchNZ", dunedin: "Enterprise Dunedin", wellington: "WellingtonNZ", auckland: "Tātaki Auckland Unlimited",
};

export function stableAddressIdentityId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function ttlForMatchStatus(status: PropertyMatchStatus) {
  if (status === "UNIQUE") return UNIQUE_TTL_MS;
  if (status === "MULTIPLE") return MULTIPLE_TTL_MS;
  return NONE_TTL_MS;
}
