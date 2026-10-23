import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addressIdentityPersistentCache, encryptPersonalData, hashPersonalIdentifier, prisma } from "@tymra/db";
import { linzLocalitiesProvider } from "@tymra/providers/nz-localities";
import { createPriceCheck, confirmQuery, searchProperties } from "@/lib/server/price-checks";
import { ADDRESS_IDENTITY_RESOLVER_VERSION, linzAddressIdentityProvider, normalizeAddressQuery } from "@tymra/providers/address-identity";

afterEach(() => vi.restoreAllMocks());
describe("location search and member submission", () => {
  const stay = { checkIn: "2027-01-10", checkOut: "2027-01-12", adults: 2, children: 1, units: 1, currency: "NZD", timezone: "Pacific/Auckland", cancellationCategory: "STANDARD", accommodationType: "ENTIRE" };

  it("routes explicit address text without a number to LINZ, with no fixture fallback", async () => {
    const search = vi.spyOn(linzAddressIdentityProvider, "search").mockResolvedValue({ query: "Hereford Street", normalizedQuery: "hereford street", candidates: [], matchStatus: "NONE", cache: { hit: false, expiresAt: new Date().toISOString() }, warnings: [] });
    const before = await prisma.priceCheck.count();
    const result = await searchProperties({ input: "Hereford Street", locale: "en", mode: "ADDRESS" });
    expect(search).toHaveBeenCalledOnce();
    expect(result.candidates).toEqual([]);
    expect(await prisma.priceCheck.count()).toBe(before);
  });

  it("stores server-resolved scope, charges only once on final confirmation, and consumes no property slot for an area", async () => {
    const id = randomUUID();
    const email = `location-${id}@tymra.test`;
    const customer = await prisma.customerUser.create({ data: { locale: "en", emailHash: hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!), encryptedEmail: encryptPersonalData(email, process.env.DATA_ENCRYPTION_KEY!), emailVerifiedAt: new Date(), status: "ACTIVE" } });
    const resolve = vi.spyOn(linzLocalitiesProvider, "resolve").mockResolvedValue({ locality: { id: "987654321", name: "Synthetic suburb", city: "Christchurch", territorialAuthority: "Christchurch City" }, latitude: -43.53, longitude: 172.63, scope: { kind: "SUBURB_BOUNDARY", label: "Synthetic suburb · Christchurch", localityId: "987654321", city: "Christchurch", sourceUrl: "https://data.linz.govt.nz/layer/113764-nz-suburbs-and-localities/", resolvedAt: new Date().toISOString(), rings: [[[172,-44],[173,-44],[173,-43],[172,-44]]] } });
    const input = { analysisType: "LOCATION_BENCHMARK", locationSearch: true, localityId: "987654321", input: "Untrusted client label", locale: "en", email, stayQuery: stay, serviceConsent: true, idempotencyKey: id };
    const created = await createPriceCheck(input, { customerUserId: customer.id });
    if (!created.accepted) throw new Error("Expected accepted local draft");
    expect(resolve).toHaveBeenCalledOnce();
    expect(created.check.rawInput).toBe("Synthetic suburb · Christchurch");
    expect(created.check.isDemo).toBe(false);
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customer.id } })).toBe(0);
    expect(await prisma.job.count({ where: { priceCheckId: created.check.id, type: "RATE_COLLECTION" } })).toBe(0);
    const query = await prisma.stayQuery.findUniqueOrThrow({ where: { id: created.check.stayQueryId! } });
    expect(query.unitConstraints).toMatchObject({ accommodationType: "ENTIRE", locationScope: { kind: "SUBURB_BOUNDARY", localityId: "987654321" } });
    await confirmQuery(created.check.id, { ...stay, locationScope: { kind: "ADDRESS_RADIUS" } });
    await confirmQuery(created.check.id, stay);
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customer.id } })).toBe(1);
    expect(await prisma.customerPricingUnit.count({ where: { customerUserId: customer.id } })).toBe(0);
    expect(await prisma.job.count({ where: { priceCheckId: created.check.id, type: "RATE_COLLECTION" } })).toBe(1);
    const confirmed = await prisma.priceCheck.findUniqueOrThrow({ where: { id: created.check.id }, include: { stayQuery: true } });
    expect(confirmed.stayQuery?.unitConstraints).toEqual(query.unitConstraints);
    expect(confirmed.status).toBe("QUEUED");
    await prisma.priceCheck.update({ where: { id: created.check.id }, data: { status: "COLLECTING" } });
    expect((await confirmQuery(created.check.id, stay)).status).toBe("COLLECTING");
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customer.id } })).toBe(1);
    expect(await prisma.job.count({ where: { priceCheckId: created.check.id, type: "RATE_COLLECTION" } })).toBe(1);
    const replay = await createPriceCheck(input, { customerUserId: customer.id });
    expect(replay.accepted && replay.reused).toBe(true);
  });

  it("rejects an unowned area submission before resolving geography", async () => {
    const resolve = vi.spyOn(linzLocalitiesProvider, "resolve");
    await expect(createPriceCheck({ analysisType: "LOCATION_BENCHMARK", locationSearch: true, localityId: "1", input: "Test suburb", email: "unowned@tymra.test", locale: "en", serviceConsent: true, stayQuery: stay, idempotencyKey: randomUUID() })).rejects.toThrow();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("keeps the address anchor when the same property has multiple units", async () => {
    const id = randomUUID();
    const email = `address-${id}@tymra.test`;
    const customer = await prisma.customerUser.create({ data: { locale: "en", emailHash: hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!), encryptedEmail: encryptPersonalData(email, process.env.DATA_ENCRYPTION_KEY!), emailVerifiedAt: new Date(), status: "ACTIVE" } });
    const externalId = `synthetic-address:${id}`;
    const address = "42 Synthetic Road, Christchurch";
    await addressIdentityPersistentCache.write({ queryHash: hashPersonalIdentifier(normalizeAddressQuery(address), process.env.ACCESS_KEY_SECRET!), providerKey: "linz-nz-addresses", resolverVersion: ADDRESS_IDENTITY_RESOLVER_VERSION, resultLimit: 10 }, {
      candidates: [{ provider: "linz-nz-addresses", externalId, normalizedAddress: address, city: "Christchurch", countryCode: "NZ", region: "Canterbury", territorialAuthority: "Christchurch City", rto: "Christchurch", postcode: null, latitude: -43.53, longitude: 172.63, confidence: 1, matchStatus: "UNIQUE", lifecycle: "Current", sourceUrl: "https://example.test/synthetic-address" }], matchStatus: "UNIQUE", warnings: [], validUntil: new Date(Date.now() + 60000).toISOString(), staleUntil: new Date(Date.now() + 120000).toISOString(),
    });
    const input = { analysisType: "LOCATION_BENCHMARK", locationSearch: true, addressExternalId: externalId, input: address, locale: "en", email, stayQuery: stay, serviceConsent: true, idempotencyKey: id };
    const first = await createPriceCheck(input, { customerUserId: customer.id });
    if (!first.accepted) throw new Error("Expected address draft");
    await prisma.sellableUnit.create({ data: { propertyId: first.check.propertyId!, canonicalName: "Synthetic second unit", officialName: "Synthetic second unit", capacity: 2, bedTypes: [], amenities: [], unitType: "PRIVATE", status: "ACTIVE" } });
    const second = await createPriceCheck({ ...input, idempotencyKey: randomUUID() }, { customerUserId: customer.id });
    if (!second.accepted) throw new Error("Expected second address draft");
    expect(second.check.unitId).toBe(first.check.unitId);
    expect(second.check.unitId).not.toBeNull();
    const confirmed = await confirmQuery(second.check.id, stay);
    expect(confirmed.status).toBe("QUEUED");
    expect(await prisma.customerPricingUnit.count({ where: { customerUserId: customer.id } })).toBe(1);
    const query = await prisma.stayQuery.findUniqueOrThrow({ where: { id: confirmed.stayQueryId! } });
    expect(query.unitConstraints).toMatchObject({ locationScope: { kind: "ADDRESS_RADIUS", radiusMetres: 5000, latitude: -43.53, longitude: 172.63 } });
  });
});
