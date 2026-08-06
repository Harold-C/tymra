import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { addressIdentityPersistentCache, prisma } from "../src";

const queryHash = `address-cache:${randomUUID()}`;
const externalId = `linz-address:${randomUUID()}`;

describe("persistent address identity cache", () => {
  afterAll(async () => {
    await prisma.addressResolutionCache.deleteMany({ where: { queryHash } });
    await prisma.addressIdentity.deleteMany({ where: { providerExternalId: externalId } });
    await prisma.$disconnect();
  });

  it("persists ordered canonical candidates and records shared cache hits", async () => {
    const key = { queryHash, providerKey: "linz-nz-addresses", resolverVersion: "test-v1", resultLimit: 10 };
    const validUntil = new Date(Date.now() + 60_000).toISOString();
    const staleUntil = new Date(Date.now() + 120_000).toISOString();
    await addressIdentityPersistentCache.write(key, {
      matchStatus: "UNIQUE",
      warnings: [],
      validUntil,
      staleUntil,
      candidates: [{ provider: "linz-nz-addresses", externalId, normalizedAddress: "100 Queen Street, Auckland", city: "Auckland", countryCode: "NZ", region: "Auckland", territorialAuthority: "Auckland", rto: "Tātaki Auckland Unlimited", postcode: "1010", latitude: -36.8467, longitude: 174.7662, confidence: 0.99, matchStatus: "UNIQUE", lifecycle: "Current", sourceUrl: "https://data.linz.govt.nz/layer/105689-nz-addresses/" }],
    });

    await expect(addressIdentityPersistentCache.read(key)).resolves.toMatchObject({
      matchStatus: "UNIQUE",
      candidates: [{ externalId, normalizedAddress: "100 Queen Street, Auckland", confidence: 0.99 }],
    });
    await addressIdentityPersistentCache.recordHit(key);
    const stored = await prisma.addressResolutionCache.findUniqueOrThrow({ where: { queryHash_providerKey_resolverVersion_resultLimit: key } });
    expect(stored).toMatchObject({ queryHash, hitCount: 1 });
    expect(stored.lastHitAt).toBeInstanceOf(Date);
  });
});
