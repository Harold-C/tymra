import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { prisma, recordIdentityEntityVersion, recordListingVersion, recordQualityAssessments, recordTransformation, sourceHasCapability } from "../src";

const suffix = randomUUID();
const propertyId = `data-core-property-${suffix}`;
const unitId = `data-core-unit-${suffix}`;
let listingId = "";

describe("National Data Core v1.3 persistence contracts", () => {
  afterAll(async () => {
    if (listingId) {
      await prisma.lineageEdge.deleteMany({ where: { OR: [{ inputId: listingId }, { outputId: listingId }] } });
      await prisma.identityRelationVersion.deleteMany({ where: { fromEntityId: listingId } });
      await prisma.listingVersion.deleteMany({ where: { listingId } });
      await prisma.listing.deleteMany({ where: { id: listingId } });
    }
    await prisma.confidenceAssessment.deleteMany({ where: { entityId: { startsWith: `data-core-${suffix}` } } });
    await prisma.freshnessAssessment.deleteMany({ where: { entityId: { startsWith: `data-core-${suffix}` } } });
    await prisma.transformationRun.deleteMany({ where: { metadata: { path: ["testSuffix"], equals: suffix } } });
    await prisma.identityEntityVersion.deleteMany({ where: { entityId: { in: [propertyId, unitId] } } });
    await prisma.sellableUnit.deleteMany({ where: { id: unitId } });
    await prisma.property.deleteMany({ where: { id: propertyId } });
    await prisma.$disconnect();
  });

  it("seeds all 17 Regions and versioned task capabilities for every active OTA", async () => {
    const [regions, activeOtas] = await Promise.all([
      prisma.marketCoverage.findMany({ where: { key: { startsWith: "region-" } }, select: { key: true, status: true } }),
      prisma.dataSource.findMany({ where: { key: { in: ["booking", "airbnb", "expedia", "bookabach", "agoda", "trip"] } }, include: { capabilities: { where: { enabled: true, validTo: null } } } }),
    ]);
    expect(new Set(regions.map((region) => region.key)).size).toBe(17);
    expect(activeOtas).toHaveLength(6);
    for (const source of activeOtas) {
      expect(new Set(source.capabilities.map((capability) => capability.capability))).toEqual(new Set(["DISCOVER_LISTINGS", "RESOLVE_LISTING", "COLLECT_RATES", "HEALTH_CHECK"]));
      expect(await sourceHasCapability(source.id, "COLLECT_RATES")).toBe(true);
    }
  });

  it("stores Listing changes as append-only versions with a versioned identity edge", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
    await prisma.property.create({ data: { id: propertyId, canonicalName: "Data Core Test Property", address: "1 Test Street", city: "Wellington", countryCode: "NZ", region: "Wellington", accommodationType: "TEST", supportStatus: "PILOT" } });
    await prisma.sellableUnit.create({ data: { id: unitId, propertyId, canonicalName: "Test Unit", officialName: "Test Unit", capacity: 2, bedTypes: [], amenities: [], unitType: "ENTIRE", status: "ACTIVE" } });
    const propertyVersion = await recordIdentityEntityVersion("PROPERTY", propertyId, { collectedAt: new Date("2026-08-20T00:00:00Z"), identityEvidence: { source: "test" } });
    const unitVersion = await recordIdentityEntityVersion("SELLABLE_UNIT", unitId, { collectedAt: new Date("2026-08-20T00:00:00Z"), identityEvidence: { source: "test" } });
    const listing = await prisma.listing.create({ data: { propertyId, unitId, dataSourceId: source.id, platform: "booking", externalId: suffix, sourceListingId: suffix, canonicalUrl: `https://booking.test/${suffix}`, rawUrl: `https://booking.test/${suffix}`, url: `https://booking.test/${suffix}`, platformUnitName: "Test Unit", onlineStatus: "ONLINE", listingStatus: "ACTIVE", matchConfidence: 0.9, operationalStatus: "HEALTHY" } });
    listingId = listing.id;
    const first = await recordListingVersion(listing.id, { collectedAt: new Date("2026-08-20T00:00:00Z"), identityEvidence: { source: "test" } });
    await prisma.listing.update({ where: { id: listing.id }, data: { platformUnitName: "Renamed Test Unit" } });
    const second = await recordListingVersion(listing.id, { collectedAt: new Date("2026-08-21T00:00:00Z"), identityEvidence: { source: "test" } });
    expect([first.version, second.version]).toEqual([1, 2]);
    expect(await prisma.listingVersion.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ validTo: new Date("2026-08-21T00:00:00Z"), supersededAt: new Date("2026-08-21T00:00:00Z") });
    expect(await prisma.identityRelationVersion.count({ where: { fromEntityId: listing.id } })).toBe(2);
    expect([propertyVersion.entityType, unitVersion.entityType]).toEqual(["PROPERTY", "SELLABLE_UNIT"]);
  });

  it("persists typed Freshness, Confidence and replayable lineage", async () => {
    const entityId = `data-core-${suffix}`;
    await recordQualityAssessments({ entityType: "NORMALIZED_FACT", entityId, dataDomain: "OTA_PRICE", usagePurpose: "MARKET_COVERAGE", referenceTime: new Date("2026-08-21T00:00:00Z"), freshnessLimitSeconds: 86_400, freshnessState: "FRESH", confidenceLayer: "FIELD_OBSERVATION", confidenceScore: 0.9, confidenceLevel: "HIGH", calculatedAt: new Date("2026-08-21T01:00:00Z") });
    const run = await recordTransformation({ transformationType: "TEST_NORMALIZATION", transformationVersion: "test-v1", inputs: [{ type: "RAW_ARTIFACT", id: `raw-${suffix}` }], outputs: [{ type: "NORMALIZED_FACT", id: entityId, evidenceHash: "abc" }], metadata: { testSuffix: suffix } });
    expect(await prisma.freshnessAssessment.findFirst({ where: { entityId } })).toMatchObject({ state: "FRESH", ageSeconds: 3_600, limitSeconds: 86_400 });
    expect(await prisma.confidenceAssessment.findFirst({ where: { entityId } })).toMatchObject({ layer: "FIELD_OBSERVATION", level: "HIGH", score: 0.9 });
    expect(await prisma.lineageEdge.findFirst({ where: { transformationRunId: run.id } })).toMatchObject({ inputType: "RAW_ARTIFACT", outputType: "NORMALIZED_FACT", outputId: entityId });
  });

  it("allows truthful address snapshots and removes durable bearer result storage", async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'MarketSnapshot'
        AND column_name IN ('analysisType', 'targetListingId', 'spatialAnchor')
      ORDER BY column_name
    `;
    expect(columns).toEqual([
      { column_name: "analysisType", is_nullable: "NO" },
      { column_name: "spatialAnchor", is_nullable: "YES" },
      { column_name: "targetListingId", is_nullable: "YES" },
    ]);
    const bearer = await prisma.$queryRaw<Array<{ name: string | null }>>`SELECT to_regclass('"ResultAccessToken"')::text AS name`;
    expect(bearer[0].name).toBeNull();
  });
});
