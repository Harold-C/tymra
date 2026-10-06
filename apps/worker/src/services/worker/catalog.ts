import { createHash } from "node:crypto";
import { prisma, Prisma, recordIdentityEntityVersion, recordListingVersion, recordTransformation, sourceHasCapability } from "@tymra/db";
import { buildNationalDateBasket, NEW_ZEALAND_TIME_ZONE, addNzCalendarDays, nzDateKey, nzDateStorageValue } from "@tymra/domain";
import { normalizeAddressQuery } from "@tymra/providers/address-identity";
import { matchOtaListingToConfirmedAddress } from "@tymra/providers/ota-address-match";
import { otaArgusConnectorForSource, otaCollectRatesExtractionSchema, otaDiscoverListingsExtractionSchema, otaDiscoveryUrlForSource, otaProviderDetails, otaResolveListingExtractionSchema } from "@tymra/providers/ota-argus-contracts";
import { resolveNzMarketKey } from "@tymra/providers/nz-market-coverage";
import { ACTIVE_OTA_SOURCE_KEYS, otaCollectionFailureCode } from "../../operations/ota-health";
import { deriveOtaMarketSignals, OTA_MARKET_SIGNAL_POLICY_VERSION, type OtaSignalObservation } from "../../collection/ota-market-signals";
import { DeferredJobError } from "../../jobs/deferred-job";
import { captureBrowserTaskWithDurableArgus, durableArgusTraceId } from "../argus-orchestrator";
import { publicOtaPrice } from "../ota-price";
import { isProductionOtaPayload, otaIdentityRequiresDetail, otaSourceApproved } from "../../operations/production-ota";
import { isSourceScopedRentalIdentity, OTA_IDENTITY_PARSER_VERSION, selectBoundedOtaUnits } from "../../operations/ota-catalog-identity";
import { otaDiscoveryGeography, otaObservedRegion } from "../../operations/ota-discovery-geography";
import { WorkerRequestError } from "./errors";
import { stableId, mapOtaAvailability, stableHash, jsonRecord, average, coefficientOfVariation, adaptivePanelCadence, NZ_REGIONS, nzRegionCoverageKey, rotatingSelectionScore } from "./helpers";
import type { WorkerContext } from "./context";

export async function collectProductionOta(this: WorkerContext, payload: unknown, parentJobId: string) {
  // Local live validation uses the same bounded business contract. Development
  // captures opt into Argus technical validation. Production uses the normal
  // budget unless an operator has authorized an expiring manual-trial waiver.
  if (!isProductionOtaPayload(payload) || !["production", "development"].includes(this.environment.NODE_ENV) || this.environment.PROVIDER_MODE !== "live" || this.environment.PUBLIC_COLLECTION_MODE !== "live") throw new Error("Bounded OTA collection requires the exact live contract");
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: payload.sourceId } });
  if (!otaSourceApproved(source) || !["HEALTHY", "DEGRADED"].includes(source.operationalStatus)) throw new Error("OTA source is not approved for a bounded public trial");
  const catalog = await this.refreshCatalog("new-zealand", parentJobId, { sourceId: source.id });
  if (catalog.failed || !catalog.discovered) throw new WorkerRequestError("NO_VERIFIABLE_UNIT", "Bounded discovery did not identify a real New Zealand physical unit", 422);
  const listing = await prisma.listing.findFirst({ where: { dataSourceId: source.id, isDemo: false, listingStatus: "ACTIVE", metadata: { path: ["productionOtaJobId"], equals: parentJobId } }, include: { property: true }, orderBy: { id: "asc" } });
  if (!listing) throw new WorkerRequestError("NO_VERIFIABLE_UNIT", "No listing was persisted by this bounded discovery", 422);
  const member = await prisma.panelMembership.upsert({ where: { sellableUnitId_marketKey: { sellableUnitId: listing.unitId, marketKey: `region-${nzRegionCoverageKey(listing.property.region)}` } }, create: { sellableUnitId: listing.unitId, marketKey: `region-${nzRegionCoverageKey(listing.property.region)}`, membershipType: "ANCHOR", targetCadenceHours: 24, coverageGap: {} }, update: { active: true } });
  if (!await this.collectPanelMemberRate(member.id, parentJobId, source.id)) throw new WorkerRequestError("NO_MATCHING_RATE", "No exact-unit public rate could be collected", 422);
  const regionKey = nzRegionCoverageKey(listing.property.region);
  if (NZ_REGIONS.some((region) => region.key === regionKey)) {
    const [properties, units, listings, panel] = await Promise.all([
      prisma.property.count({ where: { region: listing.property.region, countryCode: "NZ", isDemo: false, status: "ACTIVE", mergedIntoId: null } }),
      prisma.sellableUnit.count({ where: { property: { region: listing.property.region, countryCode: "NZ", isDemo: false, status: "ACTIVE" }, isDemo: false, status: "ACTIVE", mergedIntoId: null } }),
      prisma.listing.count({ where: { property: { region: listing.property.region }, isDemo: false, listingStatus: "ACTIVE" } }),
      prisma.panelMembership.count({ where: { marketKey: `region-${regionKey}`, active: true, sellableUnit: { property: { status: "ACTIVE" } } } }),
    ]);
    await prisma.marketCoverage.updateMany({ where: { key: `region-${regionKey}` }, data: { knownPropertyCount: properties, knownUnitCount: units, knownListingCount: listings, activePanelCount: panel, anchorPanelCount: panel, lastHealthAt: new Date(), coverageGaps: ["BOUNDED_PILOT_ONLY", "REPRESENTATIVE_OTA_PANEL_PENDING"] } });
  }
  return { sourceId: payload.sourceId, discovered: catalog.discovered };
}

export async function refreshCatalog(this: WorkerContext, marketScope: string, parentJobId?: string, bounded?: { sourceId: string }) {
  const sources = await prisma.dataSource.findMany({ where: { ...(bounded ? { id: bounded.sourceId } : { key: { in: [...ACTIVE_OTA_SOURCE_KEYS] }, operationalStatus: "HEALTHY" }), enabled: true }, orderBy: { key: "asc" } });
  const now = new Date();
  for (const source of sources) {
    if (!await sourceHasCapability(source.id, "DISCOVER_LISTINGS")) continue;
    for (const region of NZ_REGIONS) {
      if (bounded) await prisma.marketCoverage.upsert({ where: { key: `region-${region.key}` }, create: { key: `region-${region.key}`, name: region.name, status: "PILOT", region: { country: "NZ", level: "REGION", regionName: region.name }, acceptNewChecks: false, freshness: { state: "UNKNOWN", policyVersion: "ota-bounded-production-v1" }, coverageGaps: ["BOUNDED_PILOT_ONLY", "REPRESENTATIVE_OTA_PANEL_PENDING"] }, update: {} });
      const geography = otaDiscoveryGeography(source.key, region);
      const query = geography.query;
      const url = otaDiscoveryUrlForSource(source.key, query);
      if (!url) continue;
      const urlHash = stableHash(`${source.key}:${region.key}:${url}`);
      await prisma.sourceCrawlTarget.upsert({
        where: { dataSourceId_urlHash: { dataSourceId: source.id, urlHash } },
        create: { dataSourceId: source.id, url, urlHash, kind: "OTA_REGION_DISCOVERY", status: "PENDING", priority: region.key === "canterbury" ? 90 : 100, nextFetchAt: now, metadata: { regionKey: region.key, regionName: region.name, ...geography } },
        update: { url, active: true, lastSeenAt: now, metadata: { regionKey: region.key, regionName: region.name, ...geography } },
      });
    }
  }
  const resumedRun = parentJobId ? await prisma.collectionRun.findFirst({ where: { jobId: parentJobId, scope: { path: ["operation"], equals: "NATIONAL_CATALOG_DISCOVERY" } }, orderBy: { createdAt: "asc" } }) : null;
  if (bounded && resumedRun?.status === "SUCCEEDED") return { marketScope, discovered: resumedRun.successCount, failed: 0 };
  const resumedTargetId = jsonRecord(resumedRun?.scope).targetId;
  const dueTargets = parentJobId ? await prisma.sourceCrawlTarget.findMany({
    where: { kind: "OTA_REGION_DISCOVERY", active: true, dataSourceId: { in: sources.map((source) => source.id) }, ...(bounded && typeof resumedTargetId === "string" ? { id: resumedTargetId } : { nextFetchAt: { lte: now } }), ...(marketScope === "new-zealand" ? {} : { metadata: { path: ["regionKey"], equals: marketScope } }) },
    include: { dataSource: true },
    orderBy: [{ priority: "asc" }, { nextFetchAt: "asc" }, { id: "asc" }],
    take: bounded ? 1 : 6,
  }) : [];
  let discovered = 0;
  let failed = 0;
  for (const target of dueTargets) {
    let targetDiscovered = 0;
    const catalogJobId = parentJobId!;
    const metadata = jsonRecord(target.metadata);
    const query = typeof metadata.query === "string" ? metadata.query : null;
    const connectorId = otaArgusConnectorForSource(target.dataSource.key);
    if (!query || !connectorId || !await sourceHasCapability(target.dataSourceId, "DISCOVER_LISTINGS")) {
      failed += 1;
      await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { status: "FAILED", lastErrorCode: "SOURCE_CAPABILITY_MISSING", lastErrorAt: now, nextFetchAt: new Date(now.getTime() + 24 * 3_600_000) } });
      continue;
    }
    const run = (bounded ? resumedRun : await prisma.collectionRun.findFirst({ where: { jobId: catalogJobId, dataSourceId: target.dataSourceId, scope: { path: ["targetId"], equals: target.id } } })) ?? await prisma.collectionRun.create({ data: { jobId: catalogJobId, dataSourceId: target.dataSourceId, mode: "MARKET_COVERAGE", status: "RUNNING", scope: { operation: "NATIONAL_CATALOG_DISCOVERY", targetId: target.id, query, marketScope }, startedAt: now, attemptCount: 1, isDemo: false } });
    if (run.status === "SUCCEEDED") { discovered += run.successCount; continue; }
    try {
      const checkIn = addNzCalendarDays(nzDateKey(run.startedAt ?? now), 7);
      const checkOut = addNzCalendarDays(checkIn, 1);
      const traceId = durableArgusTraceId(catalogJobId, connectorId, "discover_listings", target.url);
      const response = await captureBrowserTaskWithDurableArgus(this.environment, { traceId, connectorId, workflowId: "discover_listings", url: target.url, searchQuery: query, checkIn, checkOut, adults: 2, children: 0, units: 1, currency: "NZD", maxRecords: bounded ? 1 : 10 }, { parentJobId: catalogJobId, collectionRunId: run.id, dataSourceId: target.dataSourceId });
      if (response.ok) await this.persistArgusEvidence(target.dataSourceId, run.id, response.payload, connectorId, target.url);
      if (!response.ok || response.payload.status !== "success") throw new WorkerRequestError(otaCollectionFailureCode(response.ok ? { captureStatus: response.payload.status, errorCategory: response.payload.error?.category } : { httpStatus: response.httpStatus }), response.ok ? response.payload.error?.message ?? "Catalog discovery failed" : response.message, 503);
      const extraction = otaDiscoverListingsExtractionSchema.parse(response.payload.extracted);
      for (let candidate of extraction.listings.slice(0, bounded ? 1 : 10)) {
        if (candidate.provider !== target.dataSource.key) throw new WorkerRequestError("LISTING_IDENTITY_MISMATCH", "Discovery returned another provider", 422);
        const { observedAt: _observedAt, fieldSources: _fieldSources, ...identityInput } = candidate;
        const identityStay = ["trip-public", "expedia-public", "agoda-public"].includes(connectorId)
          ? { checkIn, checkOut, adults: 2, children: 0, units: 1, currency: "NZD" } as const : undefined;
        const parserVersion = candidate.provider === "agoda" ? `${OTA_IDENTITY_PARSER_VERSION}-agoda-dated-rooms-3`
          : candidate.provider === "booking" ? `${OTA_IDENTITY_PARSER_VERSION}-booking-room-state-1`
          : candidate.provider === "trip" ? `${OTA_IDENTITY_PARSER_VERSION}-trip-city-1`
            : candidate.provider === "expedia" ? `${OTA_IDENTITY_PARSER_VERSION}-expedia-headline-1` : OTA_IDENTITY_PARSER_VERSION;
        const inputHash = stableHash(JSON.stringify({ parserVersion, identity: identityInput,
          ...(candidate.provider === "agoda" ? { identityStay } : {}) }));
        let resolvedAt: string | null = null;
        if (bounded && otaIdentityRequiresDetail(candidate)) {
          const existing = await prisma.listing.findFirst({ where: { dataSourceId: target.dataSourceId, sourceListingId: candidate.sourceListingId, isDemo: false, listingStatus: "ACTIVE" }, orderBy: { lastConfirmedAt: "desc" } });
          const cache = jsonRecord(existing?.metadata);
          const cachedIdentity = cache.resolvedIdentity;
          if (cache.discoveryIdentityHash === inputHash && typeof cache.resolvedAt === "string" && Date.parse(cache.resolvedAt) > Date.now() - 7 * 86_400_000 && cachedIdentity) {
            candidate = otaResolveListingExtractionSchema.parse(cachedIdentity);
            resolvedAt = cache.resolvedAt;
          } else {
            const detailTrace = durableArgusTraceId(catalogJobId, connectorId, "resolve_listing", candidate.canonicalUrl);
            const detail = await captureBrowserTaskWithDurableArgus(this.environment, { traceId: detailTrace, connectorId, workflowId: "resolve_listing", url: candidate.canonicalUrl, maxRecords: 1, ...(identityStay ? { identityStay } : {}) }, { parentJobId: catalogJobId, collectionRunId: run.id, dataSourceId: target.dataSourceId });
            if (detail.ok) await this.persistArgusEvidence(target.dataSourceId, run.id, detail.payload, connectorId, candidate.canonicalUrl);
            if (!detail.ok || detail.payload.status !== "success") throw new WorkerRequestError(otaCollectionFailureCode(detail.ok ? { captureStatus: detail.payload.status, errorCategory: detail.payload.error?.category } : { httpStatus: detail.httpStatus }), detail.ok ? detail.payload.error?.message ?? "Listing resolution failed" : detail.message, 503);
            const resolved = otaResolveListingExtractionSchema.parse(detail.payload.extracted);
            if (resolved.provider !== candidate.provider || resolved.sourceListingId !== candidate.sourceListingId) throw new WorkerRequestError("LISTING_IDENTITY_MISMATCH", "Detail response does not match the discovered listing", 422);
            candidate = resolved;
            resolvedAt = new Date().toISOString();
          }
        }
        if (bounded && otaIdentityRequiresDetail(candidate)) throw new WorkerRequestError("UNIT_IDENTITY_NOT_PUBLIC", "The public identity does not establish a New Zealand physical unit and location", 422);
        if (candidate.countryCode === "NZ") {
          const region = otaObservedRegion(candidate, metadata);
          if (region !== candidate.region) candidate = { ...candidate, region,
            fieldSources: { ...candidate.fieldSources, region: "ota-city-region-v1: public locality and postal region identify the configured NZ city; original source retained in evidence" },
            warnings: [...candidate.warnings, "REGION_NORMALIZED_FROM_PUBLIC_CITY"], quality: "partial" };
        }
        const sourceScoped = isSourceScopedRentalIdentity(candidate);
        if (candidate.countryCode !== "NZ" || (!sourceScoped && (!candidate.address || candidate.latitude === null || candidate.longitude === null))) continue;
        const units = bounded && candidate.provider === "agoda" ? selectBoundedOtaUnits(candidate.units, 2)
          : candidate.units.filter(unit => unit.capacity !== null && (!bounded || unit.capacity >= 2)).slice(0, bounded ? 1 : 50);
        if (!units.length) continue;
        const existingListing = await prisma.listing.findFirst({ where: { dataSourceId: target.dataSourceId, sourceListingId: candidate.sourceListingId, isDemo: false }, select: { propertyId: true } });
        const nearby = existingListing || sourceScoped ? [] : await prisma.property.findMany({ where: { countryCode: "NZ", isDemo: false, status: "ACTIVE", mergedIntoId: null, latitude: { gte: candidate.latitude! - 0.001, lte: candidate.latitude! + 0.001 }, longitude: { gte: candidate.longitude! - 0.001, lte: candidate.longitude! + 0.001 } }, take: 20 });
        const sameAddress = nearby.filter((property) => normalizeAddressQuery(property.address) === normalizeAddressQuery(candidate.address!) && matchOtaListingToConfirmedAddress(property, candidate).status === "MATCH");
        const propertyId = existingListing?.propertyId ?? (sourceScoped ? stableId("ota-property", `provider:${candidate.provider}:${candidate.providerPropertyId ?? candidate.sourceListingId}`)
          : sameAddress.length === 1 ? sameAddress[0].id : stableId("ota-property", `address:${normalizeAddressQuery(candidate.address!)}:${candidate.city ?? ""}:${candidate.latitude!.toFixed(5)}:${candidate.longitude!.toFixed(5)}`));
        const property = await prisma.property.upsert({
          where: { id: propertyId },
          create: { id: propertyId, canonicalName: candidate.canonicalName, address: sourceScoped ? "" : candidate.address!, city: candidate.city ?? "", countryCode: "NZ", latitude: sourceScoped ? null : candidate.latitude, longitude: sourceScoped ? null : candidate.longitude, region: candidate.region, territorialAuthority: candidate.territorialAuthority, postcode: candidate.postcode, timezone: NEW_ZEALAND_TIME_ZONE, accommodationType: candidate.propertyType ?? "UNCLASSIFIED_ACCOMMODATION", supportStatus: "PILOT", identityConfidence: sourceScoped ? 0.65 : candidate.quality === "complete" ? 0.9 : 0.7, status: sourceScoped ? "SOURCE_SCOPED" : "ACTIVE", isDemo: false },
          update: sourceScoped ? { canonicalName: candidate.canonicalName }
            : { canonicalName: candidate.canonicalName, address: candidate.address!, city: candidate.city ?? "", latitude: candidate.latitude, longitude: candidate.longitude, region: candidate.region, territorialAuthority: candidate.territorialAuthority, postcode: candidate.postcode, status: "ACTIVE" },
        });
        await recordIdentityEntityVersion("PROPERTY", property.id, { collectedAt: new Date(candidate.observedAt), collectionRunId: run.id, collectorVersion: "argus-ota-v1", parserVersion: "ota-public.discover_listings@1.0.0", identityEvidence: { catalogRegion: metadata.regionKey, sourceListingId: candidate.sourceListingId, locationPrecision: sourceScoped ? "SOURCE_SCOPED" : "EXACT", approximateLocation: candidate.approximateLocation ?? null } });
        for (const unit of units) {
          const matchingUnits = await prisma.sellableUnit.findMany({ where: { propertyId: property.id, isDemo: false, status: "ACTIVE", mergedIntoId: null, officialName: unit.officialName, unitType: unit.unitType, capacity: unit.capacity!, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms, entireOrShared: unit.entireOrShared }, select: { id: true }, take: 2 });
          const unitId = matchingUnits.length === 1 ? matchingUnits[0].id : stableId("catalog-unit", `${candidate.provider}:${candidate.sourceListingId}:${unit.externalId}`);
          const persistedUnit = await prisma.sellableUnit.upsert({ where: { id: unitId }, create: { id: unitId, propertyId: property.id, canonicalName: unit.officialName, officialName: unit.officialName, capacity: unit.capacity!, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms, bedTypes: unit.bedTypes, amenities: unit.amenities, unitType: unit.unitType, entireOrShared: unit.entireOrShared, status: "ACTIVE", isDemo: false }, update: { canonicalName: unit.officialName, officialName: unit.officialName, capacity: unit.capacity!, status: "ACTIVE" } });
          await recordIdentityEntityVersion("SELLABLE_UNIT", persistedUnit.id, { collectedAt: new Date(candidate.observedAt), collectionRunId: run.id, collectorVersion: "argus-ota-v1", parserVersion: "ota-public.discover_listings@1.0.0", identityEvidence: { sourceListingId: candidate.sourceListingId, unitExternalId: unit.externalId } });
          const externalId = `${candidate.sourceListingId}:${unit.externalId}`;
          const listing = await prisma.listing.upsert({ where: { dataSourceId_externalId: { dataSourceId: target.dataSourceId, externalId } }, create: { propertyId: property.id, unitId: persistedUnit.id, dataSourceId: target.dataSourceId, platform: candidate.provider, externalId, sourceListingId: candidate.sourceListingId, canonicalUrl: candidate.canonicalUrl, rawUrl: candidate.canonicalUrl, url: candidate.canonicalUrl, platformUnitName: unit.officialName, lastConfirmedAt: new Date(candidate.observedAt), onlineStatus: "ONLINE", listingStatus: "ACTIVE", matchConfidence: candidate.quality === "complete" ? 0.9 : 0.7, operationalStatus: "HEALTHY", metadata: { catalogRegion: metadata.regionKey, fieldSources: candidate.fieldSources, warnings: candidate.warnings }, isDemo: false }, update: { propertyId: property.id, unitId: persistedUnit.id, canonicalUrl: candidate.canonicalUrl, platformUnitName: unit.officialName, lastConfirmedAt: new Date(candidate.observedAt), onlineStatus: "ONLINE", listingStatus: "ACTIVE", operationalStatus: "HEALTHY" } });
          const provider = otaProviderDetails(candidate.provider);
          await prisma.listing.update({ where: { id: listing.id }, data: { providerBrand: provider?.brand, providerFamily: provider?.family, metadata: { catalogRegion: metadata.regionKey, queryScope: metadata.queryScope ?? "REGION", discoveredFor: "national-catalog", locationPrecision: sourceScoped ? "SOURCE_SCOPED" : "EXACT", approximateLocation: candidate.approximateLocation ?? null, fieldSources: candidate.fieldSources, warnings: candidate.warnings, ...(bounded ? { productionOtaJobId: catalogJobId, discoveryIdentityHash: inputHash, ...(resolvedAt ? { resolvedAt, resolvedIdentity: candidate } : {}) } : {}) } } });
          await recordListingVersion(listing.id, { collectedAt: new Date(candidate.observedAt), collectionRunId: run.id, collectorVersion: "argus-ota-v1", parserVersion: "ota-public.discover_listings@1.0.0", identityEvidence: { catalogRegion: metadata.regionKey, sourceListingId: candidate.sourceListingId, unitExternalId: unit.externalId } });
          targetDiscovered += 1;
          discovered += 1;
        }
      }
      await prisma.$transaction([
        prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: targetDiscovered, finishedAt: new Date() } }),
        prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { status: "SUCCEEDED", lastFetchedAt: new Date(), nextFetchAt: new Date(now.getTime() + 7 * 86_400_000), consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null } }),
      ]);
    } catch (error) {
      if (error instanceof DeferredJobError) throw error;
      failed += 1;
      const code = error instanceof WorkerRequestError ? error.code : "CATALOG_DISCOVERY_FAILED";
      await prisma.$transaction([
        prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: code, errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : code, finishedAt: new Date() } }),
        prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { status: "FAILED", consecutiveFailures: { increment: 1 }, lastErrorCode: code, lastErrorAt: new Date(), nextFetchAt: new Date(now.getTime() + 24 * 3_600_000) } }),
      ]);
      if (bounded) throw error;
    }
  }
  const [properties, units, listings, frontier] = await Promise.all([
    prisma.property.count({ where: { status: "ACTIVE", mergedIntoId: null } }),
    prisma.sellableUnit.count({ where: { status: "ACTIVE", mergedIntoId: null, property: { status: "ACTIVE", mergedIntoId: null } } }),
    prisma.listing.count({ where: { listingStatus: "ACTIVE" } }),
    prisma.sourceCrawlTarget.count({ where: { kind: "OTA_REGION_DISCOVERY", active: true } }),
  ]);
  return { marketScope, properties, units, listings, frontier, attempted: dueTargets.length, discovered, failed, refreshedAt: new Date() };
}

export async function refreshPanel(this: WorkerContext, membershipType: "ANCHOR" | "ROTATING", marketScope: string, parentJobId?: string) {
  const targetSize = membershipType === "ANCHOR" ? 840 : 360;
  const candidates = await prisma.sellableUnit.findMany({
    where: { status: "ACTIVE", mergedIntoId: null, isDemo: false, property: { status: "ACTIVE", mergedIntoId: null }, listings: { some: { listingStatus: "ACTIVE", operationalStatus: "HEALTHY", dataSource: { key: { in: [...ACTIVE_OTA_SOURCE_KEYS] }, enabled: true } } } },
    include: { property: true, listings: { where: { listingStatus: "ACTIVE", operationalStatus: "HEALTHY", dataSource: { key: { in: [...ACTIVE_OTA_SOURCE_KEYS] }, enabled: true } }, take: 1 }, panelMemberships: { where: { membershipType }, take: 1 } },
    orderBy: { id: "asc" },
  });
  const recentObservations = candidates.length ? await prisma.rateObservation.findMany({
    where: { sellableUnitId: { in: candidates.map((unit) => unit.id) }, isDemo: false, availabilityStatus: "AVAILABLE", collectedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    select: { sellableUnitId: true, effectiveNightlyTotalMinor: true },
  }) : [];
  const pricesByUnit = new Map<string, number[]>();
  for (const observation of recentObservations) pricesByUnit.set(observation.sellableUnitId, [...(pricesByUnit.get(observation.sellableUnitId) ?? []), observation.effectiveNightlyTotalMinor]);
  const ranked = candidates.map((unit) => {
    const regionKey = nzRegionCoverageKey(unit.property.region);
    const completeness = [unit.capacity > 0, Boolean(unit.unitType), unit.property.latitude !== null, unit.property.longitude !== null].filter(Boolean).length / 4;
    const volatilityScore = coefficientOfVariation(pricesByUnit.get(unit.id) ?? []);
    const collectionCostPenalty = Math.min(0.2, (unit.panelMemberships[0]?.collectionCost ?? 0) / 100);
    const selectionScore = completeness + Math.min(0.25, unit.listings.length * 0.05) + Math.min(0.25, volatilityScore) - collectionCostPenalty;
    return { unit, regionKey, selectionScore, volatilityScore };
  }).filter((candidate) => marketScope === "new-zealand" || candidate.regionKey === marketScope || `region-${candidate.regionKey}` === marketScope);
  const byRegion = new Map<string, typeof ranked>();
  for (const candidate of ranked) byRegion.set(candidate.regionKey, [...(byRegion.get(candidate.regionKey) ?? []), candidate]);
  const selected: typeof ranked = [];
  const orderedRegions = [...byRegion.keys()].sort();
  while (selected.length < targetSize && orderedRegions.some((key) => (byRegion.get(key)?.length ?? 0) > 0)) {
    for (const key of orderedRegions) {
      const bucket = byRegion.get(key)!;
      bucket.sort((left, right) => membershipType === "ANCHOR"
        ? right.selectionScore - left.selectionScore || left.unit.id.localeCompare(right.unit.id)
        : rotatingSelectionScore(right.unit.id, right.selectionScore) - rotatingSelectionScore(left.unit.id, left.selectionScore));
      const next = bucket.shift();
      if (next) selected.push(next);
      if (selected.length >= targetSize) break;
    }
  }
  const selectedIds = selected.map((item) => item.unit.id);
  const marketKeyScope = marketScope === "new-zealand" ? {} : { marketKey: marketScope.startsWith("region-") ? marketScope : `region-${marketScope}` };
  await prisma.panelMembership.updateMany({ where: { membershipType, active: true, ...marketKeyScope, sellableUnitId: { notIn: selectedIds } }, data: { active: false, replacementReason: "STRATIFIED_PANEL_REBALANCE" } });
  for (const candidate of selected) {
    const targetCadenceHours = adaptivePanelCadence(membershipType, candidate.volatilityScore);
    await prisma.panelMembership.upsert({
      where: { sellableUnitId_marketKey: { sellableUnitId: candidate.unit.id, marketKey: `region-${candidate.regionKey}` } },
      create: { sellableUnitId: candidate.unit.id, marketKey: `region-${candidate.regionKey}`, membershipType, weight: Math.max(0.25, 1 + candidate.volatilityScore), selectionScore: candidate.selectionScore, volatilityScore: candidate.volatilityScore, targetCadenceHours, rotationDueAt: membershipType === "ROTATING" ? new Date(Date.now() + 30 * 86_400_000) : null, lastSelectedAt: new Date(), coverageGap: {} },
      update: { membershipType, active: true, weight: Math.max(0.25, 1 + candidate.volatilityScore), selectionScore: candidate.selectionScore, volatilityScore: candidate.volatilityScore, targetCadenceHours, lastSelectedAt: new Date(), replacementReason: null },
    });
  }
  const members = await prisma.panelMembership.findMany({ where: { membershipType, active: true, ...marketKeyScope }, select: { marketKey: true, coverage24h: true, coverage72h: true } });
  const byMarket = new Map<string, typeof members>();
  for (const member of members) byMarket.set(member.marketKey, [...(byMarket.get(member.marketKey) ?? []), member]);
  for (const [marketKey, marketMembers] of byMarket) {
    await prisma.marketCoverage.updateMany({ where: { key: marketKey }, data: { coverage24h: average(marketMembers.map((member) => member.coverage24h)) ?? 0, coverage72h: average(marketMembers.map((member) => member.coverage72h)) ?? 0, lastHealthAt: new Date() } });
  }
  let collected = 0;
  let collectionFailures = 0;
  if (parentJobId) {
    const dueMembers = await prisma.panelMembership.findMany({
      where: { membershipType, active: true, ...marketKeyScope },
      orderBy: [{ selectionScore: "desc" }, { lastSuccessfulAt: "asc" }, { id: "asc" }],
      take: 30,
    }).then((items) => items.filter((item) => !item.lastSuccessfulAt || item.lastSuccessfulAt.getTime() <= Date.now() - item.targetCadenceHours * 3_600_000).slice(0, 3));
    for (const member of dueMembers) {
      try {
        if (await this.collectPanelMemberRate(member.id, parentJobId)) collected += 1;
      } catch (error) {
        if (error instanceof DeferredJobError) throw error;
        collectionFailures += 1;
      }
    }
  }
  const otaSignals = await this.refreshOtaMarketSignals(marketScope);
  return { marketScope, membershipType, targetSize, eligibleUnits: candidates.length, activeMembers: members.length, markets: byMarket.size, shortfall: Math.max(0, targetSize - members.length), collected, collectionFailures, otaSignals };
}

export async function collectPanelMemberRate(this: WorkerContext, panelMembershipId: string, parentJobId: string, boundedSourceId?: string) {
  const member = await prisma.panelMembership.findUniqueOrThrow({ where: { id: panelMembershipId }, include: { sellableUnit: { include: { property: true, listings: { where: { ...(boundedSourceId ? { dataSourceId: boundedSourceId } : {}), listingStatus: "ACTIVE", operationalStatus: "HEALTHY", dataSource: { key: { in: [...ACTIVE_OTA_SOURCE_KEYS] }, enabled: true } }, include: { dataSource: true }, orderBy: { lastConfirmedAt: "desc" }, take: 1 } } } } });
  const listing = member.sellableUnit.listings[0];
  if (!listing || !await sourceHasCapability(listing.dataSourceId, "COLLECT_RATES")) return false;
  const connectorId = otaArgusConnectorForSource(listing.dataSource.key);
  if (!connectorId) return false;
  const existingRun = await prisma.collectionRun.findFirst({ where: { jobId: parentJobId, dataSourceId: listing.dataSourceId, scope: { path: ["panelMembershipId"], equals: member.id } }, orderBy: { createdAt: "asc" } });
  if (existingRun?.status === "SUCCEEDED") return true;
  const basket = buildNationalDateBasket(new Date());
  const basketIndex = Number.parseInt(createHash("sha256").update(`${nzDateKey(new Date())}:${member.id}`).digest("hex").slice(0, 8), 16) % basket.length;
  const planned = basket[basketIndex];
  const existingScope = jsonRecord(existingRun?.scope);
  const checkIn = typeof existingScope.checkIn === "string" ? existingScope.checkIn : boundedSourceId ? addNzCalendarDays(nzDateKey(new Date()), 7) : planned.checkIn;
  const checkOut = addNzCalendarDays(checkIn, 1);
  const stayQuery = typeof existingScope.stayQueryId === "string" ? await prisma.stayQuery.findUniqueOrThrow({ where: { id: existingScope.stayQueryId } }) : await prisma.stayQuery.create({ data: { checkIn: nzDateStorageValue(checkIn), checkOut: nzDateStorageValue(checkOut), nights: 1, adults: 2, children: 0, childrenAges: [], units: 1, unitConstraints: {}, mealPlan: "ANY_PUBLIC", currency: "NZD", cancellationCategory: "STANDARD", cancellationPolicy: "ANY_PUBLIC", ratePlan: "PUBLIC", taxAndFeePolicy: "MANDATORY_INCLUDED", publicRateContext: "PUBLIC_ANONYMOUS", querySemanticsVersion: "panel-v1", timezone: NEW_ZEALAND_TIME_ZONE, reason: `National ${member.membershipType} panel ${planned.reason}` } });
  const profileKey = `${listing.dataSource.key}:${member.sellableUnitId}:nz:en:nzd:desktop:panel:v1`;
  const profile = await prisma.collectionProfile.upsert({ where: { key: profileKey }, create: { key: profileKey, sellableUnitId: member.sellableUnitId, dataSourceId: listing.dataSourceId, ipRegion: "NZ", locale: "en-NZ", currency: "NZD", deviceType: "DESKTOP", loggedInState: "LOGGED_OUT", memberState: "NON_MEMBER", mobilePriceContext: "STANDARD", publicRateContext: "PUBLIC_ANONYMOUS", browserProfileVersion: "argus-browser-v1" }, update: {} });
  const run = existingRun ?? await prisma.collectionRun.create({ data: { jobId: parentJobId, dataSourceId: listing.dataSourceId, collectionProfileId: profile.id, mode: "MARKET_COVERAGE", status: "RUNNING", scope: { operation: "OTA_PANEL_RATE", panelMembershipId: member.id, membershipType: member.membershipType, marketKey: member.marketKey, basketReason: planned.reason, checkIn, stayQueryId: stayQuery.id }, startedAt: new Date(), attemptCount: 1, isDemo: false } });
  const traceId = durableArgusTraceId(parentJobId, connectorId, "collect_rates", `${listing.canonicalUrl}:${listing.sourceListingId}:${checkIn}`);
  const unitExternalId = listing.externalId.startsWith(`${listing.sourceListingId}:`) ? listing.externalId.slice(listing.sourceListingId.length + 1) : listing.externalId;
  try {
    const response = await captureBrowserTaskWithDurableArgus(this.environment, { traceId, connectorId, workflowId: "collect_rates", url: listing.canonicalUrl, checkIn, checkOut, adults: 2, children: 0, units: 1, ...(boundedSourceId ? { unitExternalId } : {}), currency: "NZD", maxRecords: boundedSourceId ? 1 : 3 }, { parentJobId, collectionRunId: run.id, dataSourceId: listing.dataSourceId });
    if (response.ok) await this.persistArgusEvidence(listing.dataSourceId, run.id, response.payload, connectorId, listing.canonicalUrl);
    if (!response.ok || response.payload.status !== "success") throw new WorkerRequestError(otaCollectionFailureCode(response.ok ? { captureStatus: response.payload.status, errorCategory: response.payload.error?.category } : { httpStatus: response.httpStatus }), response.ok ? response.payload.error?.message ?? "Panel rate collection failed" : response.message, 503);
    const extraction = otaCollectRatesExtractionSchema.parse(response.payload.extracted);
    if (extraction.provider !== listing.dataSource.key || extraction.sourceListingId !== listing.sourceListingId) throw new WorkerRequestError("LISTING_IDENTITY_MISMATCH", "Panel rates belong to another provider or listing", 422);
    const rate = extraction.rates.find((item) => item.sourceListingId === listing.sourceListingId && item.unitExternalId === unitExternalId && item.checkIn === checkIn && item.checkOut === checkOut && item.currency === "NZD" && (item.adults === undefined || item.adults === 2) && (item.children === undefined || item.children === 0) && (item.units === undefined || item.units === 1));
    if (!rate) throw new WorkerRequestError("NO_MATCHING_RATE", "Panel collection returned no matching rate", 422);
    const available = rate.availabilityStatus === "AVAILABLE";
    const price = publicOtaPrice(rate, 1);
    if (boundedSourceId && (Date.parse(rate.collectedAt) < Date.now() - 24 * 3_600_000 || Date.parse(rate.collectedAt) > Date.now() + 60_000)) throw new WorkerRequestError("STALE_RATE", "Production trial rate was not observed within the current day", 422);
    if (available && !price) throw new WorkerRequestError("NO_EXPLICIT_PRICE", "Available panel rate has no explicit public price", 422);
    if (boundedSourceId && rate.availabilityStatus === "UNKNOWN") throw new WorkerRequestError("PUBLIC_RATE_AVAILABILITY_UNKNOWN", "Public availability for the exact stay could not be verified", 422);
    if (boundedSourceId && !available) throw new WorkerRequestError("NO_AVAILABLE_PUBLIC_RATE", "The exact-unit public stay is unavailable; a positive production acceptance sample is still required", 422);
    if (boundedSourceId && (!available || !price || price.feeCompleteness !== "COMPLETE" || price.amountMinor <= 0)) throw new WorkerRequestError("NO_COMPLETE_PUBLIC_TOTAL", "Bounded production acceptance requires an available explicit total with complete mandatory fees", 422);
    const observation = await prisma.rateObservation.upsert({
      where: { idempotencyKey: `panel:${run.id}:${member.id}:${checkIn}:${listing.id}` },
      create: { propertyId: listing.propertyId, sellableUnitId: listing.unitId, listingId: listing.id, sourceListingId: listing.sourceListingId, stayQueryId: stayQuery.id, collectionProfileId: profile.id, dataSourceId: listing.dataSourceId, collectionRunId: run.id, requestedAt: new Date(), currency: "NZD", baseAmountMinor: price?.baseAmountMinor ?? 0, mandatoryFeesMinor: price?.mandatoryFeesMinor ?? 0, taxesMinor: price?.taxesMinor ?? 0, platformFeesMinor: 0, optionalFeesMinor: rate.optionalFeesMinor ?? 0, totalAmountMinor: price?.amountMinor ?? 0, displayedAmountMinor: price?.amountMinor, priceBasis: price?.basis ?? "UNAVAILABLE", sourcePriceStatus: rate.priceStatus, exchangeRate: 1, nzdTotalMinor: price?.amountMinor ?? 0, effectiveNightlyTotalMinor: price?.effectiveNightlyMinor ?? 0, observedAt: new Date(rate.collectedAt), checkIn: nzDateStorageValue(checkIn), checkOut: nzDateStorageValue(checkOut), nights: 1, adults: 2, childrenAges: [], units: 1, localTimezone: NEW_ZEALAND_TIME_ZONE, roomTypeRaw: listing.platformUnitName, roomTypeNormalized: member.sellableUnit.canonicalName, unitConstraints: { observedPriceComponents: { basePriceMinor: rate.basePriceMinor, mandatoryFeesMinor: rate.mandatoryFeesMinor, taxesMinor: rate.taxesMinor, totalIncludesMandatoryFees: rate.totalIncludesMandatoryFees ?? null }, fieldSources: rate.fieldSources }, occupancyCapacity: member.sellableUnit.capacity, unitAttributesVersion: member.sellableUnit.version, mealPlan: rate.mealPlan, cancellationCategory: rate.cancellationPolicy, cancellationPolicy: rate.cancellationPolicy, paymentTerms: rate.paymentTerms, rateFence: rate.rateFence, minimumStay: rate.minimumStay, availabilityStatus: mapOtaAvailability(rate.availabilityStatus), restrictionReason: rate.restrictionReason, feeCompleteness: available ? price?.feeCompleteness ?? "UNKNOWN" : "UNKNOWN", sourceUrl: rate.sourceUrl, evidenceRef: `tymra-evidence:${traceId}`, collectorVersion: "argus-ota-panel-v1", parserVersion: "ota-public.collect_rates@1.0.0", qualityFlags: rate.qualityFlags, operationalStatus: listing.dataSource.operationalStatus, collectedAt: new Date(rate.collectedAt), businessDate: nzDateStorageValue(checkIn), validFrom: nzDateStorageValue(checkIn), validTo: nzDateStorageValue(checkOut), rawDataStored: true, idempotencyKey: `panel:${run.id}:${member.id}:${checkIn}:${listing.id}`, isDemo: false },
      update: {},
    });
    const artifacts = await prisma.rawArtifact.findMany({ where: { collectionRunId: run.id }, select: { id: true } });
    await recordTransformation({ dataSourceId: listing.dataSourceId, collectionRunId: run.id, transformationType: "NORMALIZE_OTA_PANEL_RATE", transformationVersion: "ota-panel-normalization-v1", parserVersion: "ota-public.collect_rates@1.0.0", inputs: artifacts.map((artifact) => ({ type: "RAW_ARTIFACT" as const, id: artifact.id })), outputs: [{ type: "NORMALIZED_FACT", id: observation.id, evidenceRef: observation.evidenceRef }] });
    await prisma.$transaction([
      prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: 1, finishedAt: new Date() } }),
      prisma.panelMembership.update({ where: { id: member.id }, data: { lastSuccessfulAt: new Date(), coverage24h: 1, coverage72h: 1, coverageGap: {}, collectionCost: { increment: 1 } } }),
    ]);
    return true;
  } catch (error) {
    if (error instanceof DeferredJobError) throw error;
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: error instanceof WorkerRequestError ? error.code : "PANEL_COLLECTION_FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : "Panel collection failed", finishedAt: new Date() } });
    await prisma.panelMembership.update({ where: { id: member.id }, data: { coverageGap: { code: error instanceof WorkerRequestError ? error.code : "PANEL_COLLECTION_FAILED", observedAt: new Date().toISOString() }, collectionCost: { increment: 1 } } });
    throw error;
  }
}

export async function refreshOtaMarketSignals(this: WorkerContext, marketScope = "new-zealand", asOf = new Date()) {
  const observations = await prisma.rateObservation.findMany({
    where: { isDemo: false, operationalStatus: "HEALTHY", collectedAt: { gte: new Date(asOf.getTime() - 72 * 3_600_000), lte: asOf } },
    include: { property: { select: { city: true, region: true, territorialAuthority: true, rto: true } }, dataSource: { select: { key: true } } },
  });
  const eligible: OtaSignalObservation[] = observations.flatMap((observation) => {
    const marketKey = resolveNzMarketKey(observation.property);
    if (!marketKey || marketScope !== "new-zealand" && marketScope !== marketKey) return [];
    return [{ id: observation.id, marketKey, region: observation.property.region ?? observation.property.city, providerKey: observation.dataSource.key, listingId: observation.listingId, checkIn: observation.checkIn, checkOut: observation.checkOut, adults: observation.adults, units: observation.units, collectedAt: observation.collectedAt, effectiveNightlyTotalMinor: observation.effectiveNightlyTotalMinor, availabilityStatus: observation.availabilityStatus, minimumStay: observation.minimumStay, restrictionReason: observation.restrictionReason, feeCompleteness: observation.feeCompleteness }];
  });
  const signals = deriveOtaMarketSignals(eligible, asOf);
  const activeIds: string[] = [];
  for (const signal of signals) {
    const id = stableId("ota-market-signal", `${OTA_MARKET_SIGNAL_POLICY_VERSION}:${signal.key}:${signal.type}`);
    activeIds.push(id);
    await prisma.marketSignal.upsert({ where: { id }, create: { id, marketKey: signal.marketKey, type: signal.type, region: signal.region, startsAt: signal.startsAt, endsAt: signal.endsAt, status: "CONFIRMED", evidence: signal.evidence as Prisma.InputJsonValue, isDemo: false }, update: { marketKey: signal.marketKey, type: signal.type, region: signal.region, startsAt: signal.startsAt, endsAt: signal.endsAt, status: "CONFIRMED", evidence: signal.evidence as Prisma.InputJsonValue, isDemo: false } });
  }
  await prisma.marketSignal.updateMany({ where: { id: { startsWith: "ota-market-signal-", notIn: activeIds }, dataSourceId: null, type: { in: ["PRICE_RISING", "AVAILABILITY_TIGHTENING", "RESTRICTION_INCREASING"] }, status: "CONFIRMED", ...(marketScope === "new-zealand" ? {} : { marketKey: marketScope }) }, data: { status: "RETRACTED" } });
  return { policyVersion: OTA_MARKET_SIGNAL_POLICY_VERSION, observations: eligible.length, emitted: signals.length, retractionScope: marketScope };
}
