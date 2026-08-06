import { describe, expect, it, vi } from "vitest";

import { LinzAddressIdentityProvider, NZ_ADDRESS_ACCEPTANCE_CORPUS, nzRegionForTerritorialAuthority, type AddressIdentityPersistentCache, type PersistentAddressResolution } from "../src/address-identity";

const authorityByRegion: Record<string, string> = {
  Auckland: "Auckland", "Bay of Plenty": "Tauranga City", Canterbury: "Christchurch City", "Chatham Islands": "Chatham Islands Territory",
  Gisborne: "Gisborne District", "Hawke's Bay": "Napier City", "Manawatū-Whanganui": "Palmerston North City", Marlborough: "Marlborough District",
  Nelson: "Nelson City", Northland: "Whangarei District", Otago: "Dunedin City", Southland: "Invercargill City", Taranaki: "New Plymouth District",
  Tasman: "Tasman District", Waikato: "Hamilton City", Wellington: "Wellington City", "West Coast": "Grey District",
};

describe("LINZ address identity", () => {
  it("maps a 17-region acceptance corpus to structured nationwide identities", async () => {
    for (const [index, item] of NZ_ADDRESS_ACCEPTANCE_CORPUS.entries()) {
      const provider = providerReturning([feature(index + 1, item.input, cityFrom(item.input), authorityByRegion[item.region])]);
      const result = await provider.search(item.input, { correlationId: `corpus:${item.region}` });
      expect(result.matchStatus, item.region).toBe("UNIQUE");
      expect(result.candidates[0], item.region).toMatchObject({ region: item.region, confidence: 1 });
      expect(result.candidates[0].territorialAuthority).toBe(authorityByRegion[item.region]);
      expect(result.candidates[0].latitude).toBeLessThan(-29);
      expect(result.candidates[0].longitude).toBeGreaterThan(165);
    }
  });

  it("caches repeated normalized searches and returns the same identity", async () => {
    const fetchMock = vi.fn(async () => response([feature(10, "20 Customhouse Quay, Wellington Central, Wellington", "Wellington", "Wellington City")]));
    const provider = new LinzAddressIdentityProvider({ fetch: fetchMock as typeof fetch });
    const first = await provider.search("20 Customhouse Quay Wellington", { correlationId: "first" });
    const second = await provider.search("  20 CUSTOMHOUSE QUAY, Wellington ", { correlationId: "second" });
    expect(first.cache.hit).toBe(false);
    expect(second.cache.hit).toBe(true);
    expect(second.candidates).toEqual(first.candidates);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares a persistent result across provider restarts without storing the raw query", async () => {
    const fetchMock = vi.fn(async () => response([feature(12, "20 Customhouse Quay, Wellington", "Wellington", "Wellington City")]));
    const cache = memoryPersistentCache();
    const first = new LinzAddressIdentityProvider({ fetch: fetchMock as typeof fetch });
    const initial = await first.search("20 Customhouse Quay, Wellington", { correlationId: "first", queryHash: "hmac-only", persistentCache: cache });
    const restarted = new LinzAddressIdentityProvider({ fetch: fetchMock as typeof fetch });
    const repeated = await restarted.search("20 CUSTOMHOUSE QUAY WELLINGTON", { correlationId: "restart", queryHash: "hmac-only", persistentCache: cache });
    expect(initial.cache.layer).toBe("source");
    expect(repeated.cache).toMatchObject({ hit: true, layer: "database" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.keys()).toEqual(["hmac-only"]);
  });

  it("serializes concurrent cache misses so only one source request runs", async () => {
    const fetchMock = vi.fn(async () => response([feature(13, "100 Queen Street, Auckland", "Auckland", "Auckland")]));
    const cache = memoryPersistentCache();
    let tail = Promise.resolve();
    const withCacheLock = async <T>(_key: string, operation: () => Promise<T>) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try { return await operation(); } finally { release(); }
    };
    const providers = [new LinzAddressIdentityProvider({ fetch: fetchMock as typeof fetch }), new LinzAddressIdentityProvider({ fetch: fetchMock as typeof fetch })];
    const results = await Promise.all(providers.map((provider, index) => provider.search("100 Queen Street Auckland", { correlationId: `parallel:${index}`, queryHash: "parallel-hash", persistentCache: cache, withCacheLock })));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.cache.layer)).toEqual(["source", "database"]);
  });

  it("refreshes an expired persistent result from the source", async () => {
    let now = Date.parse("2026-08-07T00:00:00.000Z");
    const fetchMock = vi.fn(async () => response([feature(14, "1 Mackay Street, Greymouth", "Greymouth", "Grey District")]));
    const cache = memoryPersistentCache();
    await new LinzAddressIdentityProvider({ fetch: fetchMock as typeof fetch, ttlMs: 100, now: () => now }).search("1 Mackay Street Greymouth", { correlationId: "initial", queryHash: "expiry-hash", persistentCache: cache });
    now += 101;
    const refreshed = await new LinzAddressIdentityProvider({ fetch: fetchMock as typeof fetch, ttlMs: 100, now: () => now }).search("1 Mackay Street Greymouth", { correlationId: "expired", queryHash: "expiry-hash", persistentCache: cache });
    expect(refreshed.cache).toMatchObject({ hit: false, layer: "source" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries without postcode and Region terms that LINZ does not store in full_address", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([feature(11, "4D Edward Street, Richmond", "Richmond", "Tasman District")]));
    const provider = new LinzAddressIdentityProvider({ fetch: fetchMock as typeof fetch });
    const result = await provider.search("4D Edward Street, Richmond, Tasman 7020", { correlationId: "fallback" });
    expect(result).toMatchObject({ matchStatus: "UNIQUE" });
    expect(result.candidates[0]).toMatchObject({ region: "Tasman", postcode: "7020" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires confirmation for equally credible matches and removes a conflicting region", async () => {
    const ambiguous = providerReturning([
      feature(1, "100 Queen Street, Northcote Point, Auckland", "Auckland", "Auckland"),
      feature(2, "100 Queen Street, Auckland Central, Auckland", "Auckland", "Auckland"),
    ]);
    expect((await ambiguous.search("100 Queen Street Auckland", { correlationId: "ambiguous" })).matchStatus).toBe("MULTIPLE");

    const crossRegion = providerReturning([
      feature(3, "1 Mackay Street, Greymouth", "Greymouth", "Grey District"),
      feature(4, "1 Mackay Street, Blenheim", "Blenheim", "Marlborough District"),
    ]);
    const result = await crossRegion.search("1 Mackay Street, Greymouth, West Coast", { correlationId: "region" });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].region).toBe("West Coast");
    expect(result.warnings).toContain("CROSS_REGION_RESULT_REMOVED");
  });

  it("degrades incomplete matches without auto-selecting them", async () => {
    const provider = providerReturning([feature(1, "99 Remote Road, Example Locality", "Example", "Grey District")]);
    const result = await provider.search("12 Other Avenue", { correlationId: "low" });
    expect(result.matchStatus).toBe("NONE");
    expect(result.warnings).toContain("LOW_CONFIDENCE_ADDRESS");
  });

  it("covers every territorial authority used by the corpus", () => {
    for (const [region, authority] of Object.entries(authorityByRegion)) expect(nzRegionForTerritorialAuthority(authority), authority).toBe(region);
  });
});

function memoryPersistentCache(): AddressIdentityPersistentCache & { keys(): string[] } {
  const values = new Map<string, PersistentAddressResolution>();
  return {
    keys: () => [...values.keys()],
    read: async (key) => structuredClone(values.get(key.queryHash) ?? null),
    write: async (key, value) => { values.set(key.queryHash, structuredClone(value)); },
  };
}

function providerReturning(features: ReturnType<typeof feature>[]) {
  return new LinzAddressIdentityProvider({ fetch: (async () => response(features)) as typeof fetch });
}

function response(features: ReturnType<typeof feature>[]) {
  return new Response(JSON.stringify({ features }), { status: 200, headers: { "content-type": "application/json" } });
}

function feature(addressId: number, fullAddress: string, city: string, territorialAuthority: string) {
  return {
    attributes: { address_id: addressId, full_address: fullAddress, suburb_locality: city, town_city: city, territorial_authority: territorialAuthority, address_lifecycle: "Current" },
    geometry: { x: 170 + addressId / 1_000, y: -40 - addressId / 10_000 },
  };
}

function cityFrom(address: string) {
  return address.split(",").at(-1)?.trim() === "Chatham Islands" ? "Waitangi" : address.split(",").at(-1)!.trim();
}
