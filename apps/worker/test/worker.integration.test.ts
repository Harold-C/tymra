import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { getEnvironment } from "@tymra/config";
import { prisma, Prisma } from "@tymra/db";
import { emptyEventImpactEvidence } from "@tymra/domain";
import { AdapterError, linzAddressIdentityProvider, otaAdapters, type PublicDataAdapter } from "@tymra/providers";
import { afterAll, describe, expect, it } from "vitest";

import { handleJob } from "../src/jobs/job-handlers";
import { normaliseEventfindaDetail, type EventfindaDetailExtraction } from "../src/collection/eventfinda";
import { durableArgusTraceId } from "../src/services/argus-orchestrator";
import { WorkerService } from "../src/services/worker-service";
import { membershipOperationalMetrics } from "../src/membership/operations";

const environment = getEnvironment();
const service = new WorkerService(environment);
const prefix = `worker-integration:${randomUUID()}`;
const ipSeed = prefix.replace(/[^0-9a-f]/gi, "").padEnd(16, "0").slice(-16);
const testIp = (offset: number) => `2001:db8:${ipSeed.slice(0, 4)}:${ipSeed.slice(4, 8)}:${ipSeed.slice(8, 12)}:${ipSeed.slice(12, 16)}:${offset.toString(16)}:1`;

describe("Worker baseline pipeline", () => {
  afterAll(async () => prisma.$disconnect());

  it("does not require Argus readiness in fixture collection mode", async () => {
    await expect(new WorkerService({ ...environment, PUBLIC_COLLECTION_MODE: "fixture" }).argusHealth()).resolves.toEqual({
      healthy: true,
      ready: true,
      mode: "fixture",
      latencyMs: 0,
    });
  });

  it("runs an anonymous preview without creating an email", async () => {
    const request = await service.createPreview({ input: `https://www.booking.com/hotel/nz/integration-preview-${prefix.slice(-8)}.html`, idempotencyKey: `${prefix}:preview`, locale: "en", deviceId: `${prefix}:preview-device`, ipAddress: testIp(10) });
    expect(request?.status).toBe("QUEUED");
    await drainRequest(request!.id);
    const completed = await service.getResult(request!.id);
    expect(completed?.priceAnalyses).toHaveLength(1);
    expect(completed?.marketSnapshots[0].dateSnapshots).toHaveLength(2);
    expect(await prisma.emailDelivery.count({ where: { analysisRequestId: request!.id } })).toBe(0);

    const cached = await service.createPreview({ input: request!.rawInput, idempotencyKey: `${prefix}:preview:cached`, locale: "en", deviceId: `${prefix}:cache-device`, ipAddress: testIp(14) });
    await drainRequest(cached!.id);
    expect((await service.getAnalysis(cached!.id))?.cacheHitType).toBe("EXACT_FRESH");
  });

  it("requires SellableUnit confirmation for multi-room properties", async () => {
    const request = await service.createPreview({ input: `https://www.booking.com/hotel/nz/integration-multi-hotel-${prefix.slice(-8)}.html`, idempotencyKey: `${prefix}:multi`, locale: "en", deviceId: `${prefix}:multi-device`, ipAddress: testIp(11) });
    expect(request?.status).toBe("NEEDS_CONFIRMATION");
    expect(request?.confirmationCandidates).toHaveLength(2);
    const selected = (request!.confirmationCandidates as string[])[0];
    const confirmed = await service.confirmAnalysis(request!.id, { sellableUnitId: selected });
    expect(confirmed?.status).toBe("QUEUED");
    await service.cancelAnalysis(request!.id);
  });

  it("resolves an address to one confirmed Property, SellableUnit and OTA Listing", async () => {
    const request = await service.createPreview({ input: `42 ${prefix.slice(-8)} Fixture Street, Christchurch 8011`, idempotencyKey: `${prefix}:address-unique`, locale: "en", deviceId: `${prefix}:address-device`, ipAddress: testIp(21) });
    expect(request).toMatchObject({ inputType: "ADDRESS", status: "QUEUED" });
    expect(request?.propertyId).toBeTruthy();
    expect(request?.sellableUnitId).toBeTruthy();
    expect(request?.targetListingId).toBeTruthy();
    await drainRequest(request!.id);
    expect((await service.getAnalysis(request!.id))?.status).toBe("COMPLETED");
  });

  it("validates an address-confirmed OTA listing with explicit fixture evidence in development", async () => {
    const request = await service.createFormalAnalysis({
      input: `52 ${prefix.slice(-8)} Fixture Street, Christchurch 8011`,
      email: `fixture-listing-${prefix.slice(-8)}@tymra.test`,
      serviceConsent: true,
      idempotencyKey: `${prefix}:fixture-listing-validation`,
      locale: "en",
      deviceId: `${prefix}:fixture-listing-device`,
      ipAddress: testIp(28),
    });
    const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: request!.priceCheckId! } });
    const job = await prisma.job.findFirstOrThrow({ where: { analysisRequestId: request!.id }, orderBy: { createdAt: "asc" } });
    const listingUrl = "https://www.airbnb.co.nz/rooms/713337408265816459";
    await prisma.priceCheck.update({
      where: { id: check.id },
      data: { listingUrl, listingValidationStatus: "PENDING", listingValidationMessage: null, listingValidatedAt: null, unitId: null, status: "VALIDATING" },
    });
    await service.validatePriceCheckOtaListing(check.id, job.id);
    const validated = await prisma.priceCheck.findUniqueOrThrow({ where: { id: check.id } });
    expect(validated).toMatchObject({ status: "NEEDS_CONFIRMATION", listingValidationStatus: "VERIFIED", isDemo: true });
    expect(validated.unitId).toBeTruthy();
    expect(await prisma.listing.findFirst({ where: { propertyId: check.propertyId!, unitId: validated.unitId!, dataSource: { key: "development-demo" } } })).toMatchObject({ platform: "airbnb", sourceListingId: "713337408265816459", isDemo: true });
    expect(await prisma.collectionRun.findFirst({ where: { priceCheckId: check.id, jobId: job.id } })).toMatchObject({ status: "SUCCEEDED", isDemo: true });
    await service.cancelAnalysis(request!.id);
  });

  it("returns NEEDS_CONFIRMATION when an address resolves to multiple hotel units", async () => {
    const request = await service.createPreview({ input: `88 ${prefix.slice(-8)} Fixture Hotel Road, Christchurch 8011`, idempotencyKey: `${prefix}:address-multiple`, locale: "en", deviceId: `${prefix}:address-multiple-device`, ipAddress: testIp(22) });
    expect(request).toMatchObject({ inputType: "ADDRESS", status: "NEEDS_CONFIRMATION" });
    expect(request?.confirmationCandidates).toHaveLength(2);
    await service.cancelAnalysis(request!.id);
  });

  it("keeps an Expedia property-only resolution out of SellableUnit persistence", async () => {
    const request = await service.createFormalAnalysis({ input: `42 ${prefix.slice(-8)} Fixture Street, Christchurch 8011`, email: `expedia-property-only-${prefix.slice(-8)}@tymra.test`, serviceConsent: true, idempotencyKey: `${prefix}:expedia-property-only`, locale: "en", deviceId: `${prefix}:expedia-property-only-device`, ipAddress: testIp(23) });
    const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: request!.priceCheckId! }, include: { property: true } });
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "expedia" } });
    const sourceBefore = { enabled: source.enabled, operationalStatus: source.operationalStatus };
    const job = await prisma.job.findFirstOrThrow({ where: { analysisRequestId: request!.id }, orderBy: { createdAt: "asc" } });
    const canonicalUrl = "https://www.expedia.co.nz/Christchurch-Hotels-Novotel-Christchurch-Airport.h18258191.Hotel-Information";
    const connectorId = "expedia-public" as const;
    const traceId = durableArgusTraceId(job.id, connectorId, "resolve_listing", canonicalUrl);
    try {
      await prisma.$transaction([
        prisma.priceCheck.update({ where: { id: check.id }, data: { listingUrl: canonicalUrl, listingValidationStatus: "PENDING", listingValidationMessage: null, listingValidatedAt: null, unitId: null, status: "VALIDATING" } }),
        prisma.dataSource.update({ where: { id: source.id }, data: { enabled: true, operationalStatus: "HEALTHY" } }),
      ]);
      const run = await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: source.id, priceCheckId: check.id, mode: "ON_DEMAND", status: "RUNNING", scope: { operation: "OTA_LISTING_VALIDATION", listingUrl: canonicalUrl }, startedAt: new Date(), attemptCount: 1, isDemo: false } });
      const result = {
        contract_version: "1.0",
        job_id: `job_${randomUUID().replaceAll("-", "")}`,
        status: "COMPLETED",
        result_sha256: "f".repeat(64),
        items: [{
          trace_id: traceId,
          status: "COMPLETED",
          error_category: null,
          result: {
            contract_version: "1.0", ok: true, status: "success", trace_id: traceId, connector_id: connectorId, workflow_id: "resolve_listing", readonly_only: true, external_side_effects_performed: false,
            page: null, evidence: [], challenge: null, error: null,
            data: {
              data_schema: "ota-public.resolve_listing", schema_version: "1.0.0", provider: "expedia", providerFamily: "EXPEDIA_GROUP", identityQuality: "complete", unitIdentityStatus: "not_public",
              sourceListingId: "expedia:18258191", canonicalUrl, canonicalName: "Novotel Christchurch Airport", address: check.property!.address, city: check.property!.city, region: check.property!.region, territorialAuthority: check.property!.territorialAuthority, postcode: check.property!.postcode, countryCode: check.property!.countryCode, latitude: check.property!.latitude, longitude: check.property!.longitude, propertyType: "Hotel", units: [], observedAt: "2026-08-09T00:00:00.000Z", fieldSources: { units: "not public" }, warnings: ["EXPEDIA_UNIT_IDENTITY_NOT_PUBLIC"], quality: "partial",
            },
          },
        }],
        error: null,
      };
      await prisma.argusExecution.create({ data: { orchestrationKey: `${job.id}:${traceId}`, parentJobId: job.id, collectionRunId: run.id, dataSourceId: source.id, argusJobId: result.job_id, traceId, connectorId, workflowId: "resolve_listing", requestedUrl: canonicalUrl, status: "COMPLETED", result: result as Prisma.InputJsonValue, deadlineAt: new Date(Date.now() + 60_000), completedAt: new Date() } });
      const unitCountBefore = await prisma.sellableUnit.count({ where: { propertyId: check.propertyId! } });

      await new WorkerService({ ...environment, PROVIDER_MODE: "live" }).validatePriceCheckOtaListing(check.id, job.id);

      expect(await prisma.priceCheck.findUniqueOrThrow({ where: { id: check.id } })).toMatchObject({ status: "NEEDS_CONFIRMATION", listingValidationStatus: "CONFLICT", unitId: null });
      expect(await prisma.collectionRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: "FAILED", errorCode: "UNIT_IDENTITY_NOT_PUBLIC" });
      expect(await prisma.sellableUnit.count({ where: { propertyId: check.propertyId! } })).toBe(unitCountBefore);
      expect(await prisma.listing.count({ where: { propertyId: check.propertyId!, dataSourceId: source.id } })).toBe(0);
    } finally {
      await prisma.dataSource.update({ where: { id: source.id }, data: sourceBefore });
      await service.cancelAnalysis(request!.id);
    }
  });

  it("runs two idempotent nationwide address pipelines without cross-region market contamination", async () => {
    const originalSearch = linzAddressIdentityProvider.search.bind(linzAddressIdentityProvider);
    const cases = [
      { input: "100 Queen Street, Auckland", id: "1110540", city: "Auckland", region: "Auckland", authority: "Auckland", rto: "Tātaki Auckland Unlimited", latitude: -36.8467, longitude: 174.7662, market: "auckland", level: "FULL" },
      { input: "1 Mackay Street, Greymouth", id: "west-coast-live", city: "Greymouth", region: "West Coast", authority: "Grey District", rto: "Development West Coast", latitude: -42.4504, longitude: 171.2108, market: "nz-region-west-coast", level: "REGIONAL" },
    ] as const;
    try {
      for (const [index, item] of cases.entries()) {
        linzAddressIdentityProvider.search = async (query) => ({
          query,
          normalizedQuery: query.toLowerCase(),
          matchStatus: "UNIQUE",
          cache: { hit: index > 0, expiresAt: new Date(Date.now() + 60_000).toISOString() },
          warnings: [],
          candidates: [{ provider: "linz-nz-addresses", externalId: `linz-address:${item.id}`, normalizedAddress: item.input, city: item.city, countryCode: "NZ", region: item.region, territorialAuthority: item.authority, rto: item.rto, postcode: null, latitude: item.latitude, longitude: item.longitude, confidence: 1, matchStatus: "UNIQUE", lifecycle: "Current", sourceUrl: "https://data.linz.govt.nz/layer/105689-nz-addresses/" }],
        });
        const idempotencyKey = `${prefix}:national-address:${index}`;
        const request = await service.createPreview({ input: item.input, idempotencyKey, locale: "en", deviceId: `${prefix}:national-address-device:${index}`, ipAddress: testIp(30 + index) });
        const repeated = await service.createPreview({ input: item.input, idempotencyKey, locale: "en", deviceId: `${prefix}:national-address-device:${index}`, ipAddress: testIp(30 + index) });
        expect(repeated?.id).toBe(request?.id);
        await drainRequest(request!.id);
        const result = await service.getResult(request!.id);
        const marketScope = result!.marketSnapshots[0].marketScope as Record<string, unknown>;
        const addressCoverage = marketScope.addressCoverage as Record<string, unknown>;
        expect(marketScope.market).toBe(item.market);
        expect(addressCoverage).toMatchObject({ level: item.level, regionName: item.region });
        expect(JSON.stringify(marketScope)).not.toContain(item.region === "Auckland" ? "West Coast" : "Auckland regional coverage");
      }
    } finally {
      linzAddressIdentityProvider.search = originalSearch;
    }
  });

  it("persists resolved nationwide geography and uses a regional market key instead of Christchurch", async () => {
    const adapter = otaAdapters.booking;
    const originalResolve = adapter.resolveListing.bind(adapter);
    adapter.resolveListing = async (input, context) => {
      const resolved = await originalResolve(input, context);
      return {
        ...resolved,
        property: {
          ...resolved.property,
          externalId: `booking:west-coast-${prefix.slice(-8)}`,
          canonicalName: "Fixture Greymouth Stay",
          address: "1 Mackay Street, Greymouth 7805",
          city: "Greymouth",
          region: "West Coast",
          territorialAuthority: "Grey District",
          rto: "Development West Coast",
          postcode: "7805",
          latitude: -42.4504,
          longitude: 171.2108,
          microMarket: null,
        },
      };
    };
    try {
      const request = await service.createFormalAnalysis({
        input: `https://www.booking.com/hotel/nz/west-coast-${prefix.slice(-8)}.html`,
        email: `west-coast-${prefix.slice(-8)}@tymra.test`,
        serviceConsent: true,
        idempotencyKey: `${prefix}:west-coast`,
        locale: "en",
        deviceId: `${prefix}:west-coast-device`,
        ipAddress: testIp(29),
      });
      const [property, check] = await Promise.all([
        prisma.property.findUniqueOrThrow({ where: { id: request!.propertyId! } }),
        prisma.priceCheck.findUniqueOrThrow({ where: { id: request!.priceCheckId! } }),
      ]);
      expect(property).toMatchObject({ city: "Greymouth", region: "West Coast", territorialAuthority: "Grey District", rto: "Development West Coast", supportStatus: "PILOT_AVAILABLE" });
      expect(check.marketKey).toBe("nz-region-west-coast");
      await service.cancelAnalysis(request!.id);
    } finally {
      adapter.resolveListing = originalResolve;
    }
  });

  it("reuses idempotent requests and enforces the per-device/unit preview limit", async () => {
    const input = `https://www.booking.com/hotel/nz/integration-limit-${prefix.slice(-8)}.html`;
    const first = await service.createPreview({ input, idempotencyKey: `${prefix}:limit:first`, locale: "en", deviceId: `${prefix}:limit-device`, ipAddress: testIp(13) });
    const repeated = await service.createPreview({ input, idempotencyKey: `${prefix}:limit:first`, locale: "en", deviceId: `${prefix}:limit-device`, ipAddress: testIp(13) });
    expect(repeated?.id).toBe(first?.id);
    await expect(service.createPreview({ input, idempotencyKey: `${prefix}:limit:second`, locale: "en", deviceId: `${prefix}:limit-device`, ipAddress: testIp(13) })).rejects.toMatchObject({ code: "ABUSE_LIMIT", statusCode: 429 });
    await service.cancelAnalysis(first!.id);
  });

  it("publishes a formal 30-day result and queues exactly one service email", async () => {
    const request = await service.createFormalAnalysis({ input: `https://www.booking.com/hotel/nz/integration-formal-${prefix.slice(-8)}.html`, email: `${prefix.slice(-8)}@tymra.test`, serviceConsent: true, marketingConsent: false, idempotencyKey: `${prefix}:formal`, locale: "en", deviceId: `${prefix}:formal-device`, ipAddress: testIp(12) });
    const plan = await prisma.queryPlan.findFirstOrThrow({ where: { analysisRequestId: request!.id }, orderBy: { version: "desc" } });
    const checkIn = (plan.dateBasket as unknown as Array<{ checkIn: string }>)[0].checkIn;
    const signalId = `${prefix}:formal-market-signal`;
    const demandSignalId = `${prefix}:formal-demand-signal`;
    const startsAt = new Date(`${checkIn}T00:00:00.000Z`);
    await prisma.marketSignal.create({ data: { id: signalId, marketKey: "christchurch", type: "MAJOR_EVENT", region: "Christchurch", startsAt, endsAt: new Date(startsAt.getTime() + 86_400_000), status: "CONFIRMED", evidence: { regression: true }, isDemo: true } });
    await prisma.marketSignal.create({ data: { id: demandSignalId, marketKey: "christchurch", type: "TOURISM_DEMAND", region: "Christchurch", startsAt: new Date(startsAt.getTime() - 50 * 86_400_000), endsAt: new Date(startsAt.getTime() - 20 * 86_400_000), status: "CONFIRMED", evidence: { title: "Latest MBIE market context", direction: "POSITIVE", confidence: 0.9 }, isDemo: true } });
    try {
      await drainRequest(request!.id);
      const result = await service.getResult(request!.id);
      expect(result?.resultVersions[0]).toMatchObject({ status: "PUBLISHED", outcome: "PUBLISHED", isDemo: true });
      expect(result?.marketSnapshots[0].dateSnapshots).toHaveLength(30);
      expect(result?.priceAnalyses[0].eventImpact).not.toBeNull();
      expect(result?.priceAnalyses[0].eventEvidence).toMatchObject({ causalClaim: false, policyVersion: "event-impact-v2", signalIds: [signalId], publicSignalCoverage: { complete: false } });
      expect(result?.marketSnapshots[0].marketScope).toMatchObject({ market: "christchurch", country: "NZ" });
      expect(result?.marketSnapshots[0].dateSnapshots.some((snapshot) => (snapshot.eventEvidence as { signalIds?: string[] }).signalIds?.includes(signalId))).toBe(true);
      expect(result?.marketSnapshots[0].dateSnapshots.every((snapshot) => (snapshot.eventEvidence as { signalIds?: string[] }).signalIds?.includes(demandSignalId))).toBe(true);
      expect(result?.priceAnalyses[0].demandPressure).toBeGreaterThan(0);
      await waitForEmailDelivery(request!.id);
      const deliveries = await prisma.emailDelivery.findMany({ where: { analysisRequestId: request!.id } });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toMatchObject({ type: "RESULT_READY", status: "SENT" });
      const signalRuns = await prisma.collectionRun.findMany({ where: { analysisRequestId: request!.id }, include: { dataSource: true } });
      expect(signalRuns.some((run) => run.dataSource.key === "public_holidays_nz" && run.status === "SUCCEEDED")).toBe(true);
      expect(signalRuns.some((run) => run.dataSource.key === "eventfinda")).toBe(true);
    } finally {
      await prisma.marketSignal.deleteMany({ where: { id: { in: [signalId, demandSignalId] } } });
    }
  });

  it("refreshes an expired cache entry instead of presenting it as fresh", async () => {
    const input = `https://www.booking.com/hotel/nz/integration-stale-${prefix.slice(-8)}.html`;
    const first = await service.createPreview({ input, idempotencyKey: `${prefix}:stale:first`, locale: "en", deviceId: `${prefix}:stale-device-a`, ipAddress: testIp(23) });
    await drainRequest(first!.id);
    const firstState = await service.getAnalysis(first!.id);
    const signature = firstState!.queryPlans[0].querySignatureHash;
    await prisma.queryCacheEntry.updateMany({ where: { querySignatureHash: signature }, data: { validUntil: new Date(Date.now() - 1_000), hitType: "STALE" } });

    const refreshed = await service.createPreview({ input, idempotencyKey: `${prefix}:stale:refresh`, locale: "en", deviceId: `${prefix}:stale-device-b`, ipAddress: testIp(24) });
    await drainRequest(refreshed!.id);
    const refreshedState = await service.getAnalysis(refreshed!.id);
    expect(refreshedState?.cacheHitType).toBe("MISS");
    expect(refreshedState?.collectionRuns.length).toBeGreaterThan(0);
  });

  it("publishes the target price but no recommendation when fewer than three unique competitors exist", async () => {
    const request = await service.createFormalAnalysis({ input: `https://www.booking.com/hotel/nz/fixture-insufficient-${prefix.slice(-8)}.html`, email: `insufficient-${prefix.slice(-8)}@tymra.test`, serviceConsent: true, idempotencyKey: `${prefix}:insufficient`, locale: "en", deviceId: `${prefix}:insufficient-device`, ipAddress: testIp(25) });
    await drainRequest(request!.id);
    expect((await service.getAnalysis(request!.id))?.status).toBe("COMPLETED");
    expect(await prisma.resultVersion.findFirst({ where: { analysisRequestId: request!.id }, select: { priceResultStatus: true, recommendationStatus: true, recommendationReasonCode: true } })).toEqual({ priceResultStatus: "COMPLETED", recommendationStatus: "NOT_AVAILABLE", recommendationReasonCode: "NOT_ENOUGH_COMPARABLE_EVIDENCE" });
    expect(await prisma.emailDelivery.count({ where: { analysisRequestId: request!.id, type: "RESULT_READY" } })).toBe(1);
  });

  it("returns a fee-incomplete target price while withholding the recommendation", async () => {
    const request = await service.createFormalAnalysis({ input: `https://www.booking.com/hotel/nz/fixture-fees-unknown-${prefix.slice(-8)}.html`, email: `fees-${prefix.slice(-8)}@tymra.test`, serviceConsent: true, idempotencyKey: `${prefix}:fees-unknown`, locale: "en", deviceId: `${prefix}:fees-device`, ipAddress: testIp(26) });
    await drainRequest(request!.id);
    expect((await service.getAnalysis(request!.id))?.status).toBe("COMPLETED");
    expect(await prisma.dateSnapshot.count({ where: { analysisRequestId: request!.id, qualityFlags: { array_contains: "FEES_UNKNOWN" } } })).toBeGreaterThan(0);
    expect(await prisma.resultVersion.findFirst({ where: { analysisRequestId: request!.id }, select: { priceResultStatus: true, recommendationStatus: true } })).toEqual({ priceResultStatus: "COMPLETED", recommendationStatus: "NOT_AVAILABLE" });
  });

  it("returns SOURCE_UNAVAILABLE without publishing when the rate source is unavailable", async () => {
    const request = await service.createFormalAnalysis({ input: `https://www.booking.com/hotel/nz/source-suspended-${prefix.slice(-8)}.html`, email: `suspended-${prefix.slice(-8)}@tymra.test`, serviceConsent: true, idempotencyKey: `${prefix}:source-suspended`, locale: "en", deviceId: `${prefix}:source-suspended-device`, ipAddress: testIp(28) });
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "development-demo" } });
    try {
      await prisma.dataSource.update({ where: { id: source.id }, data: { operationalStatus: "BLOCKED" } });
      await drainRequest(request!.id);
      expect(await service.getAnalysis(request!.id)).toMatchObject({ status: "SOURCE_UNAVAILABLE", failureCode: "SOURCE_UNAVAILABLE" });
      expect(await prisma.resultVersion.count({ where: { analysisRequestId: request!.id } })).toBe(0);
      expect(await prisma.emailDelivery.count({ where: { analysisRequestId: request!.id } })).toBe(0);
    } finally {
      await prisma.dataSource.update({ where: { id: source.id }, data: { operationalStatus: source.operationalStatus, enabled: source.enabled, lifecycle: source.lifecycle } });
    }
  });

  it("never falls back to fixture collection in production mode", async () => {
    const liveService = new WorkerService({ ...environment, NODE_ENV: "production", PROVIDER_MODE: "live", FIXTURE_COLLECTION_ENABLED: false });
    await expect(liveService.createPreview({ input: `https://www.booking.com/hotel/nz/production-no-fallback-${prefix.slice(-8)}.html`, idempotencyKey: `${prefix}:production-no-fallback`, locale: "en", deviceId: `${prefix}:production-device`, ipAddress: testIp(27) })).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("restricts Eventfinda local acceptance to development", async () => {
    for (const NODE_ENV of ["test", "production"] as const) {
      const guardedService = new WorkerService({ ...environment, NODE_ENV, SCHEDULER_ENABLED: false });
      await expect(guardedService.collectSource("eventfinda", "new-zealand", undefined, { phase: "discovery", localAcceptance: true }))
        .rejects.toMatchObject({ code: "CONFIGURATION_ERROR", message: "Local Eventfinda acceptance is restricted to the development environment" });
    }

    const productionBootstrap = new WorkerService({ ...environment, NODE_ENV: "production", SCHEDULER_ENABLED: false });
    await expect(productionBootstrap.collectSource("eventfinda", "new-zealand", undefined, { phase: "discovery", developmentBootstrap: true }))
      .rejects.toMatchObject({ code: "CONFIGURATION_ERROR", message: "Eventfinda development bootstrap is restricted to the development environment" });
    const developmentService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: false });
    await expect(developmentService.collectSource("eventfinda", "new-zealand", undefined, { phase: "discovery", localAcceptance: true, developmentBootstrap: true }))
      .rejects.toMatchObject({ code: "INVALID_COLLECTION_MODE" });
  });

  it("enables source-bound schedules only for an enabled healthy source", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "mot_airline_performance" } });
    const schedules = await prisma.scheduleDefinition.findMany({ where: { key: "mot-airline-performance-daily" } });
    const auditWhere = { entityType: "CollectionRuntime", entityId: source.key, eventType: { in: ["source_schedules_enabled", "source_schedules_disabled"] as const } };
    const auditCountBefore = await prisma.auditEvent.count({ where: auditWhere });
    expect(schedules).toHaveLength(1);
    try {
      await prisma.dataSource.update({ where: { id: source.id }, data: {
        enabled: false,
        operationalStatus: "DEGRADED",
      } });
      expect(await service.sourceSchedulePlan([source.key])).toMatchObject({
        ready: false,
        sources: [{ sourceId: source.key, schedules: [{ key: "mot-airline-performance-daily", enabled: false }] }],
        mutationPerformed: false,
      });
      await expect(service.configureSourceSchedules([source.key], { enabled: true, reason: "integration source gate" }))
        .rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });

      await prisma.dataSource.update({ where: { id: source.id }, data: {
        enabled: true,
        operationalStatus: "HEALTHY",
      } });
      expect(await service.sourceSchedulePlan([source.key])).toMatchObject({ ready: true });
      expect(await service.configureSourceSchedules([source.key], { enabled: true, reason: "integration source ready" })).toMatchObject({
        enabled: true,
        sources: [source.key],
        schedules: [{ key: "mot-airline-performance-daily", enabled: true }],
        mutationPerformed: true,
      });
      expect(await service.configureSourceSchedules([source.key], { enabled: false, reason: "integration rollback check" })).toMatchObject({
        enabled: false,
        schedules: [{ key: "mot-airline-performance-daily", enabled: false }],
      });
      expect(await prisma.auditEvent.count({ where: auditWhere })).toBe(auditCountBefore + 2);
    } finally {
      await prisma.dataSource.update({ where: { id: source.id }, data: {
        enabled: source.enabled,
        operationalStatus: source.operationalStatus,
      } });
      await Promise.all(schedules.map((schedule) => prisma.scheduleDefinition.update({ where: { id: schedule.id }, data: { enabled: schedule.enabled, nextRunAt: schedule.nextRunAt } })));
    }
  });

  it("activates a healthy source in every environment", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "mot_airline_performance" } });
    const startedAt = new Date();
    const adapter: PublicDataAdapter = {
      metadata: { sourceId: source.key, sourceName: source.name, sourceType: "PUBLIC_DATA", supportedDomains: ["www.transport.govt.nz"], adapterKey: "integration:development-activation", accessMethod: "PUBLIC_WEB", concurrencyLimit: 1, dailyBudget: 1, collectorVersion: "test", parserVersion: "test" },
      async discover() { return []; },
      async fetch() { return []; },
      async normalise() { return []; },
      async healthCheck() { return { status: "HEALTHY", checkedAt: new Date(), message: "integration healthy", latencyMs: 0, mode: "live" }; },
    };
    const developmentService = new WorkerService({ ...environment, NODE_ENV: "development" }, { [source.key]: adapter });
    const productionService = new WorkerService({ ...environment, NODE_ENV: "production" }, { [source.key]: adapter });
    try {
      await prisma.dataSource.update({ where: { id: source.id }, data: {
        enabled: true,
        lifecycle: "RESEARCH",
        operationalStatus: "DEGRADED",
      } });
      const activated = await developmentService.activateSource(source.key);
      expect(activated).toMatchObject({
        enabled: true,
        operationalStatus: "HEALTHY",
        metadata: { activation: { environment: "development" } },
      });
      await expect(productionService.activateSource(source.key)).resolves.toMatchObject({ enabled: true, operationalStatus: "HEALTHY" });
    } finally {
      await prisma.sourceHealthCheck.deleteMany({ where: { dataSourceId: source.id, checkedAt: { gte: startedAt } } });
      await prisma.dataSource.update({ where: { id: source.id }, data: {
        enabled: source.enabled,
        lifecycle: source.lifecycle,
        operationalStatus: source.operationalStatus,
        status: source.status,
        healthStatus: source.healthStatus,
        lastReviewedAt: source.lastReviewedAt,
        lastSuccessAt: source.lastSuccessAt,
        healthSummary: source.healthSummary as Prisma.InputJsonValue,
        metadata: source.metadata as Prisma.InputJsonValue,
      } });
    }
  });

  it("applies the shared development-only local-acceptance guard to public sources", async () => {
    for (const NODE_ENV of ["test", "production"] as const) {
      const guardedService = new WorkerService({ ...environment, NODE_ENV, SCHEDULER_ENABLED: false });
      await expect(guardedService.collectSource("geonet", "new-zealand", undefined, { localAcceptance: true }))
        .rejects.toMatchObject({ code: "CONFIGURATION_ERROR", message: "Local source acceptance is available only in development" });
    }
  });

  it("persists generic source signals, canonical signals and lineage idempotently", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "geonet" } });
    const externalPrefix = `${prefix}:signal`;
    const adapter: PublicDataAdapter = {
      metadata: { sourceId: "geonet", sourceName: "GeoNet", sourceType: "PUBLIC_DATA", supportedDomains: ["api.geonet.org.nz"], adapterKey: "public:geonet:integration", accessMethod: "OFFICIAL_OPEN_API", concurrencyLimit: 1, dailyBudget: 10, collectorVersion: "test", parserVersion: "test" },
      async discover() { return ["https://api.geonet.org.nz/quake?MMI=3", "https://api.geonet.org.nz/quake?MMI=3"]; },
      async fetch() { return [0, 1, 2].map((index) => ({ sourceId: "geonet", externalId: `${externalPrefix}:${index}`, payload: { publicID: `${externalPrefix}:${index}`, token: "must-redact" }, fetchedAt: new Date(), fixture: false })); },
      async normalise(records) { return records.map((record, index) => ({ sourceId: "geonet", externalId: record.externalId, marketKey: "new-zealand", type: "WEATHER_OR_ACCESS_DISRUPTION", title: `Integration quake ${index}`, region: "New Zealand", startsAt: new Date("2026-08-01T00:00:00Z"), endsAt: new Date("2026-08-02T00:00:00Z"), direction: "UNKNOWN", confidence: 0.5, evidenceRef: `https://api.geonet.org.nz/quake/${index}`, metadata: { magnitude: 4.2, sequence: index }, fixture: false })); },
      async healthCheck() { return { status: "HEALTHY", checkedAt: new Date(), message: "fixture transport", latencyMs: 0, mode: "live" }; },
    };
    const acceptanceService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: false }, { geonet: adapter });
    const runIds: string[] = [];
    let canonicalIds: string[] = [];
    try {
      const first = await acceptanceService.collectSource("geonet", "new-zealand", undefined, { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z"), limit: 999, localAcceptance: true });
      const second = await acceptanceService.collectSource("geonet", "new-zealand", undefined, { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z"), limit: 999, localAcceptance: true });
      runIds.push(first.runId, second.runId);
      expect(first).toMatchObject({ localAcceptance: true, references: 1, records: 2, signals: 2, counters: { requests: 1, discovered: 2, persisted: 2, duplicatesSkipped: 1 } });
      expect(second).toMatchObject({ counters: { unchangedSkipped: 2 } });
      const sourceSignals = await prisma.sourceMarketSignal.findMany({ where: { dataSourceId: source.id, externalId: { startsWith: externalPrefix } }, include: { canonicalLink: true } });
      expect(sourceSignals).toHaveLength(2);
      expect(sourceSignals.every((signal) => signal.lastCollectionRunId === second.runId && signal.canonicalLink !== null)).toBe(true);
      expect(sourceSignals[0].metadata).toMatchObject({ canonicalisationVersion: "source-isolated-signal-v1", signal: { magnitude: 4.2 } });
      canonicalIds = sourceSignals.flatMap((signal) => signal.canonicalLink ? [signal.canonicalLink.marketSignalId] : []);
      expect(await prisma.marketSignal.count({ where: { id: { in: canonicalIds } } })).toBe(2);
      expect(await prisma.marketSignalSourceLink.count({ where: { sourceMarketSignalId: { in: sourceSignals.map((signal) => signal.id) } } })).toBe(2);
      expect(await prisma.rawArtifact.count({ where: { collectionRunId: { in: runIds } } })).toBe(4);
      const run = await prisma.collectionRun.findUniqueOrThrow({ where: { id: second.runId } });
      expect(run.scope).toMatchObject({ localAcceptance: true, effective: { limit: 2 }, limits: { maxRequests: 2, maxRecords: 2, maxWindowDays: 31 }, configurationUnchanged: true, schedulesUnchanged: true });
      expect(await prisma.dataSource.findUnique({ where: { id: source.id } })).toMatchObject({ lifecycle: source.lifecycle, operationalStatus: source.operationalStatus, healthStatus: source.healthStatus });
    } finally {
      await prisma.sourceMarketSignal.deleteMany({ where: { dataSourceId: source.id, externalId: { startsWith: externalPrefix } } });
      await prisma.marketSignal.deleteMany({ where: { id: { in: canonicalIds } } });
      await prisma.rawArtifact.deleteMany({ where: { collectionRunId: { in: runIds } } });
    }
  });

  it("validates impact evidence, enriches a trusted venue and promotes only the qualified real-source shape", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "canterbury_major_annual_events" } });
    const observedAt = new Date("2026-08-05T00:00:00.000Z");
    const externalIds = [`${prefix}:te-pae-pending`, `${prefix}:show-promoted`];
    const baseEvent = {
      sourceId: source.key, category: "Conference", subcategory: null, address: null, city: "Christchurch", region: "Canterbury",
      territorialAuthority: null, postcode: null, countryCode: "NZ", latitude: null, longitude: null, timezone: "Pacific/Auckland",
      startsAt: new Date("2026-11-11T08:00:00+13:00"), endsAt: new Date("2026-11-11T17:00:00+13:00"), status: "SCHEDULED" as const,
      ticketStatus: null, impactStatus: "PENDING_EVIDENCE" as const, impactScore: null, impactConfidence: null,
      sourceUpdatedAt: null, observedAt, fixture: false,
    };
    const events = [
      {
        ...baseEvent, externalId: externalIds[0]!, title: "Integration Te Pae Conference",
        sourceUrl: "https://www.tepae.co.nz/whats-on/integration", venueName: "Te Pae Christchurch Convention Centre",
        impactEvidence: {}, metadata: {},
      },
      {
        ...baseEvent, externalId: externalIds[1]!, title: "Ravensdown Canterbury A&P Show Integration",
        sourceUrl: "https://www.theshow.co.nz/", venueName: "Canterbury Agricultural Park",
        impactEvidence: { ...emptyEventImpactEvidence(), items: [{ evidenceType: "EXPECTED_ATTENDANCE" as const, value: 70_000, unit: "people", sourceUrl: "https://www.theshow.co.nz/", observedAt: observedAt.toISOString(), confidence: 0.96 }] },
        metadata: {},
      },
    ];
    const adapter: PublicDataAdapter = {
      metadata: { sourceId: source.key, sourceName: source.name, sourceType: "PUBLIC_DATA", supportedDomains: ["www.theshow.co.nz"], adapterKey: "public:event-impact:integration", accessMethod: "OFFICIAL_PUBLIC_HTML", concurrencyLimit: 1, dailyBudget: 10, collectorVersion: "test", parserVersion: "test" },
      async discover() { return ["https://www.theshow.co.nz/"]; },
      async fetch() { return events.map((event) => ({ sourceId: source.key, externalId: event.externalId, payload: event, fetchedAt: observedAt, fixture: false })); },
      async normaliseEvents() { return events; },
      async normalise() { return []; },
      async healthCheck() { return { status: "HEALTHY", checkedAt: new Date(), message: "integration", latencyMs: 0, mode: "live" }; },
    };
    const acceptanceService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: false }, { [source.key]: adapter });

    try {
      const first = await acceptanceService.collectSource(source.key, "christchurch", undefined, { localAcceptance: true });
      const second = await acceptanceService.collectSource(source.key, "christchurch", undefined, { localAcceptance: true });
      expect(first.events).toBe(2);
      expect(second.counters.unchangedSkipped).toBe(2);
      const occurrences = await prisma.sourceEventOccurrence.findMany({
        where: { dataSourceId: source.id, externalId: { in: externalIds } },
        include: { canonicalLinks: { include: { eventOccurrence: { include: { venue: true } } } } },
        orderBy: { externalId: "asc" },
      });
      const pending = occurrences.find((occurrence) => occurrence.externalId === externalIds[0])!;
      const promoted = occurrences.find((occurrence) => occurrence.externalId === externalIds[1])!;
      expect(pending).toMatchObject({ impactStatus: "PENDING_EVIDENCE", impactScore: null, address: "188 Oxford Terrace, Christchurch 8011", timePrecision: "DATETIME", evidenceRef: "https://www.tepae.co.nz/whats-on/integration" });
      expect(pending.canonicalLinks[0]?.eventOccurrence.venue).toMatchObject({ capacity: 3_600, capacitySourceUrl: "https://www.tepae.co.nz/spaces/exhibition-hall" });
      expect(pending.impactEvidence).toMatchObject({ schemaVersion: "event-impact-evidence-v1", items: [expect.objectContaining({ evidenceType: "VENUE_CAPACITY", value: 3_600 })] });
      expect(promoted.impactStatus).toBe("PROMOTED");
      expect(promoted.impactScore).toBeGreaterThan(0.75);
      expect(promoted.impactEvidence).toMatchObject({ items: [expect.objectContaining({ evidenceType: "EXPECTED_ATTENDANCE", value: 70_000 })] });
      const majorSignal = await prisma.marketSignal.findFirst({ where: { eventOccurrenceId: promoted.canonicalLinks[0]?.eventOccurrence.id } });
      expect(majorSignal).toMatchObject({ marketKey: "christchurch", type: "MAJOR_EVENT", status: "CONFIRMED" });
    } finally {
      const sourceEvents = await prisma.sourceEvent.findMany({ where: { dataSourceId: source.id, externalId: { in: externalIds } }, select: { id: true } });
      const sourceOccurrences = await prisma.sourceEventOccurrence.findMany({ where: { dataSourceId: source.id, externalId: { in: externalIds } }, include: { canonicalLinks: true } });
      const occurrenceIds = sourceOccurrences.flatMap((occurrence) => occurrence.canonicalLinks.map((link) => link.eventOccurrenceId));
      const canonicalOccurrences = await prisma.eventOccurrence.findMany({ where: { id: { in: occurrenceIds } }, select: { id: true, canonicalEventId: true, venueId: true } });
      await prisma.sourceMarketSignal.deleteMany({ where: { dataSourceId: source.id, externalId: { startsWith: "event:" } } });
      await prisma.marketSignal.deleteMany({ where: { eventOccurrenceId: { in: occurrenceIds } } });
      await prisma.eventOccurrenceSourceLink.deleteMany({ where: { sourceEventOccurrenceId: { in: sourceOccurrences.map((occurrence) => occurrence.id) } } });
      await prisma.eventSourceLink.deleteMany({ where: { sourceEventId: { in: sourceEvents.map((event) => event.id) } } });
      await prisma.sourceEventOccurrence.deleteMany({ where: { id: { in: sourceOccurrences.map((occurrence) => occurrence.id) } } });
      await prisma.sourceEvent.deleteMany({ where: { id: { in: sourceEvents.map((event) => event.id) } } });
      await prisma.eventOccurrence.deleteMany({ where: { id: { in: canonicalOccurrences.map((occurrence) => occurrence.id) } } });
      await prisma.canonicalEvent.deleteMany({ where: { id: { in: canonicalOccurrences.map((occurrence) => occurrence.canonicalEventId) } } });
      for (const venueId of canonicalOccurrences.flatMap((occurrence) => occurrence.venueId ? [occurrence.venueId] : [])) {
        if (await prisma.eventOccurrence.count({ where: { venueId } }) === 0) await prisma.canonicalVenue.deleteMany({ where: { id: venueId } });
      }
    }
  });

  it("merges independent event-impact evidence into one canonical major-event signal", async () => {
    const officialSource = await prisma.dataSource.findUniqueOrThrow({ where: { key: "canterbury_major_annual_events" } });
    const demandSource = await prisma.dataSource.findUniqueOrThrow({ where: { key: "eventfinda" } });
    const observedAt = new Date("2026-08-05T00:00:00.000Z");
    const title = `Integration Regional Major Event ${prefix}`;
    const base = {
      title, category: "Festival", subcategory: null, venueName: "Integration Regional Park", address: null,
      city: "Christchurch", region: "Canterbury", territorialAuthority: "Christchurch City", postcode: null,
      countryCode: "NZ", latitude: null, longitude: null, timezone: "Pacific/Auckland", timePrecision: "DATE" as const,
      startsAt: new Date("2026-12-05T00:00:00.000Z"), endsAt: new Date("2026-12-06T00:00:00.000Z"),
      status: "SCHEDULED" as const, ticketStatus: null, impactStatus: "PENDING_EVIDENCE" as const,
      impactScore: null, impactConfidence: null, sourceUpdatedAt: null, observedAt, fixture: false, metadata: {},
    };
    const officialEvent = {
      ...base, sourceId: officialSource.key, externalId: `${prefix}:official-scale`, sourceUrl: "https://event.ccc.govt.nz/major-event",
      impactEvidence: { ...emptyEventImpactEvidence(), items: [{ evidenceType: "OFFICIAL_SCALE_LABEL" as const, value: "MAJOR" as const, sourceUrl: "https://event.ccc.govt.nz/major-event", observedAt: observedAt.toISOString(), confidence: 0.94 }] },
    };
    const demandEvent = {
      ...base, sourceId: demandSource.key, externalId: `${prefix}:demand-corroboration`, sourceUrl: "https://www.eventfinda.co.nz/major-event",
      impactEvidence: { ...emptyEventImpactEvidence(), items: [{ evidenceType: "CORROBORATING_DEMAND" as const, value: "HIGH" as const, sourceUrl: "https://www.eventfinda.co.nz/major-event-demand", observedAt: observedAt.toISOString(), confidence: 0.88 }] },
    };
    const runs = await Promise.all([officialSource, demandSource, officialSource].map((source, index) => prisma.collectionRun.create({
      data: { dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "RUNNING", scope: { integration: true, index }, startedAt: new Date(), attemptCount: 1, isDemo: true },
    })));
    let occurrenceId: string | undefined;
    try {
      const first = await service.persistNormalisedEvent(officialEvent, officialSource.id, runs[0]!.id);
      expect(first.eventOccurrence.impactStatus).toBe("PENDING_EVIDENCE");
      const second = await service.persistNormalisedEvent(demandEvent, demandSource.id, runs[1]!.id);
      expect(second.eventOccurrence).toMatchObject({ impactStatus: "PROMOTED", impactConfidence: 0.88 });
      occurrenceId = second.eventOccurrence.id;
      await service.persistNormalisedEvent(officialEvent, officialSource.id, runs[2]!.id);

      const occurrence = await prisma.eventOccurrence.findUniqueOrThrow({ where: { id: occurrenceId }, include: { sourceLinks: true, marketSignals: { include: { sourceLinks: true } } } });
      expect(occurrence.sourceLinks).toHaveLength(2);
      expect(occurrence.impactEvidence).toMatchObject({ policyVersion: "event-impact-promotion-v2", items: expect.arrayContaining([
        expect.objectContaining({ evidenceType: "OFFICIAL_SCALE_LABEL", value: "MAJOR" }),
        expect.objectContaining({ evidenceType: "CORROBORATING_DEMAND", value: "HIGH" }),
      ]) });
      expect(occurrence.marketSignals).toHaveLength(1);
      expect(occurrence.marketSignals[0]).toMatchObject({ type: "MAJOR_EVENT", status: "CONFIRMED", marketKey: "christchurch" });
      expect(occurrence.marketSignals[0]!.sourceLinks).toHaveLength(2);
    } finally {
      const sourceOccurrences = await prisma.sourceEventOccurrence.findMany({ where: { externalId: { in: [officialEvent.externalId, demandEvent.externalId] } }, include: { canonicalLinks: true } });
      const occurrenceIds = [...new Set(sourceOccurrences.flatMap((item) => item.canonicalLinks.map((link) => link.eventOccurrenceId)))];
      const canonicalOccurrences = await prisma.eventOccurrence.findMany({ where: { id: { in: occurrenceIds } }, select: { canonicalEventId: true, venueId: true } });
      await prisma.sourceMarketSignal.deleteMany({ where: { externalId: { in: [`event:${officialEvent.externalId}`, `event:${demandEvent.externalId}`] } } });
      await prisma.marketSignal.deleteMany({ where: { eventOccurrenceId: { in: occurrenceIds } } });
      await prisma.sourceEvent.deleteMany({ where: { dataSourceId: { in: [officialSource.id, demandSource.id] }, externalId: { in: [officialEvent.externalId, demandEvent.externalId] } } });
      await prisma.eventOccurrence.deleteMany({ where: { id: { in: occurrenceIds } } });
      await prisma.canonicalEvent.deleteMany({ where: { id: { in: canonicalOccurrences.map((item) => item.canonicalEventId) } } });
      for (const venueId of canonicalOccurrences.flatMap((item) => item.venueId ? [item.venueId] : [])) {
        if (await prisma.eventOccurrence.count({ where: { venueId } }) === 0) await prisma.canonicalVenue.deleteMany({ where: { id: venueId } });
      }
    }
  });

  it("retains generic parser failures with the longer evidence TTL", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "geonet" } });
    const externalId = `${prefix}:parser-failure`;
    const adapter: PublicDataAdapter = {
      metadata: { sourceId: "geonet", sourceName: "GeoNet", sourceType: "PUBLIC_DATA", supportedDomains: ["api.geonet.org.nz"], adapterKey: "public:geonet:parser-failure", accessMethod: "OFFICIAL_OPEN_API", concurrencyLimit: 1, dailyBudget: 10, collectorVersion: "test", parserVersion: "test" },
      async discover() { return ["https://api.geonet.org.nz/quake?MMI=3"]; },
      async fetch() { return [{ sourceId: "geonet", externalId, payload: { malformed: true }, fetchedAt: new Date(), fixture: false }]; },
      async normalise() { throw new AdapterError("PARSING_ERROR", "Integration parser failure", false); },
      async healthCheck() { return { status: "HEALTHY", checkedAt: new Date(), message: "fixture transport", latencyMs: 0, mode: "live" }; },
    };
    const acceptanceService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: false, RAW_ARTIFACT_FAILURE_TTL_HOURS: 168 }, { geonet: adapter });
    const startedAt = new Date();
    await expect(acceptanceService.collectSource("geonet", "new-zealand", undefined, { localAcceptance: true })).rejects.toMatchObject({ code: "PARSING_ERROR" });
    const run = await prisma.collectionRun.findFirstOrThrow({ where: { dataSourceId: source.id, createdAt: { gte: startedAt }, errorCode: "PARSING_ERROR" }, orderBy: { createdAt: "desc" } });
    const artifacts = await prisma.rawArtifact.findMany({ where: { collectionRunId: run.id } });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].parserFailure).toBe(true);
    expect(artifacts[0].expiresAt.getTime() - artifacts[0].createdAt.getTime()).toBeGreaterThanOrEqual(167 * 3_600_000);
    await prisma.rawArtifact.deleteMany({ where: { collectionRunId: run.id } });
  });

  it("persists redacted short-lived public artifacts and removes expired payloads", async () => {
    const before = new Date();
    const collection = await service.collectSource("school_holidays_nz", "new-zealand");
    expect(collection.records).toBeGreaterThan(0);
    const artifact = await prisma.rawArtifact.findFirstOrThrow({ where: { createdAt: { gte: before } }, orderBy: { createdAt: "desc" } });
    expect(artifact.payload).not.toBeNull();
    await prisma.rawArtifact.update({ where: { id: artifact.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const cleanup = await service.retentionCleanup();
    expect(cleanup.rawArtifactsDeleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.rawArtifact.findUnique({ where: { id: artifact.id } })).toMatchObject({ storageRef: "DELETED", payload: null });
  });

  it("applies the Release 1.5 retention windows without deleting active formal-report ownership", async () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    const old = new Date(now.getTime() - 91 * 86_400_000);
    const recent = new Date(now.getTime() - 10 * 86_400_000);
    const customer = await prisma.customerUser.create({
      data: { emailHash: `${prefix}:retention-email`, encryptedEmail: "encrypted", locale: "en" },
    });
    const oldCheck = await prisma.anonymousCheck.create({
      data: { locale: "en", platform: "booking.com", listingId: `${prefix}:old`, cacheKey: `${prefix}:old-cache`, idempotencyKey: `${prefix}:old-check`, status: "ROUGH_READY", pricingContext: {}, expiresAt: old, createdAt: old },
    });
    const recentMetadataCheck = await prisma.anonymousCheck.create({
      data: { locale: "en", platform: "booking.com", listingId: `${prefix}:recent`, cacheKey: `${prefix}:recent-cache`, idempotencyKey: `${prefix}:recent-check`, status: "ROUGH_READY", pricingContext: {}, expiresAt: old, createdAt: old },
    });
    const oldMagicLink = await prisma.magicLink.create({
      data: { tokenHash: `${prefix}:old-token`, idempotencyKey: `${prefix}:old-link`, status: "EXPIRED", emailHash: customer.emailHash, encryptedEmail: "encrypted", locale: "en", anonymousCheckId: oldCheck.id, expiresAt: old, createdAt: old },
    });
    const recentMagicLink = await prisma.magicLink.create({
      data: { tokenHash: `${prefix}:recent-token`, idempotencyKey: `${prefix}:recent-link`, status: "CONSUMED", emailHash: customer.emailHash, encryptedEmail: "encrypted", locale: "en", anonymousCheckId: recentMetadataCheck.id, customerUserId: customer.id, expiresAt: old, consumedAt: recent, createdAt: recent },
    });
    const pendingCheck = await prisma.anonymousCheck.create({
      data: { locale: "en", platform: "booking.com", listingId: `${prefix}:pending`, cacheKey: `${prefix}:pending-cache`, idempotencyKey: `${prefix}:pending-check`, pricingContext: {}, expiresAt: old, createdAt: old },
    });
    const pendingLink = await prisma.magicLink.create({
      data: { tokenHash: `${prefix}:pending-token`, idempotencyKey: `${prefix}:pending-link`, emailHash: customer.emailHash, encryptedEmail: "encrypted", locale: "en", anonymousCheckId: pendingCheck.id, expiresAt: old, createdAt: recent },
    });
    const oldSession = await prisma.customerSession.create({
      data: { customerUserId: customer.id, tokenHash: `${prefix}:old-session`, expiresAt: old, createdAt: old },
    });
    const recentSession = await prisma.customerSession.create({
      data: { customerUserId: customer.id, tokenHash: `${prefix}:recent-session`, expiresAt: new Date(now.getTime() + 86_400_000), createdAt: recent },
    });
    const oldUsage = await prisma.usageLedger.create({ data: { action: "ROUGH_CHECK", subjectType: "IP", subjectHash: `${prefix}:old-hash`, metadata: {}, createdAt: old } });
    const recentUsage = await prisma.usageLedger.create({ data: { action: "ROUGH_CHECK", subjectType: "IP", subjectHash: `${prefix}:recent-hash`, metadata: {}, createdAt: recent } });
    const oldDecision = await prisma.abuseDecision.create({ data: { action: "ROUGH_CHECK", subjectHash: `${prefix}:old-hash`, outcome: "ALLOW", reasonCodes: [], createdAt: old } });

    try {
      const cleanup = await service.retentionCleanup(now);

      expect(cleanup).toMatchObject({ magicLinksExpired: 1, terminalMagicLinksDeleted: 1, customerSessionsDeleted: 1, usageLedgerDeleted: 1, abuseDecisionsDeleted: 1 });
      expect(await prisma.magicLink.findUnique({ where: { id: oldMagicLink.id } })).toBeNull();
      expect(await prisma.anonymousCheck.findUnique({ where: { id: oldCheck.id } })).toBeNull();
      expect(await prisma.magicLink.findUnique({ where: { id: recentMagicLink.id } })).not.toBeNull();
      expect(await prisma.anonymousCheck.findUnique({ where: { id: recentMetadataCheck.id } })).not.toBeNull();
      expect(await prisma.magicLink.findUnique({ where: { id: pendingLink.id } })).toMatchObject({ status: "EXPIRED" });
      expect(await prisma.customerSession.findUnique({ where: { id: oldSession.id } })).toBeNull();
      expect(await prisma.customerSession.findUnique({ where: { id: recentSession.id } })).not.toBeNull();
      expect(await prisma.usageLedger.findUnique({ where: { id: oldUsage.id } })).toBeNull();
      expect(await prisma.usageLedger.findUnique({ where: { id: recentUsage.id } })).not.toBeNull();
      expect(await prisma.abuseDecision.findUnique({ where: { id: oldDecision.id } })).toBeNull();
    } finally {
      await prisma.magicLink.deleteMany({ where: { anonymousCheckId: { in: [oldCheck.id, recentMetadataCheck.id, pendingCheck.id] } } });
      await prisma.anonymousCheck.deleteMany({ where: { id: { in: [oldCheck.id, recentMetadataCheck.id, pendingCheck.id] } } });
      await prisma.customerSession.deleteMany({ where: { customerUserId: customer.id } });
      await prisma.usageLedger.deleteMany({ where: { subjectHash: { in: [`${prefix}:old-hash`, `${prefix}:recent-hash`] } } });
      await prisma.abuseDecision.deleteMany({ where: { subjectHash: `${prefix}:old-hash` } });
      await prisma.customerUser.delete({ where: { id: customer.id } });
    }
  });

  it("enforces every membership history window and the cancelled-account grace boundary", async () => {
    const now = new Date("2026-08-11T12:00:00.000Z");
    const customers: string[] = [];
    const checks: Array<{ id: string; expected: "ARCHIVED" | "PUBLISHED" }> = [];
    try {
      for (const [plan, days] of [["FREE", 30], ["HOST", 183], ["PRO", 365], ["PORTFOLIO", 730]] as const) {
        const customer = await prisma.customerUser.create({ data: { emailHash: `${prefix}:retention:${plan}`, encryptedEmail: "encrypted", emailVerifiedAt: now, locale: "en" } });
        customers.push(customer.id);
        await prisma.membershipSubscription.create({ data: { customerUserId: customer.id, plan, status: "ACTIVE" } });
        for (const [suffix, ageDays, expected] of [["old", days + 1, "ARCHIVED"], ["recent", Math.max(1, days - 1), "PUBLISHED"]] as const) {
          const check = await prisma.priceCheck.create({ data: { rawInput: `${plan}-${suffix}`, locale: "en", emailHash: customer.emailHash, encryptedEmail: "encrypted", serviceConsent: true, marketKey: "christchurch", status: "PUBLISHED", accessKeyHash: `${prefix}:retention:${plan}:${suffix}:access`, idempotencyKey: `${prefix}:retention:${plan}:${suffix}`, customerUserId: customer.id, createdAt: new Date(now.getTime() - ageDays * 86_400_000) } });
          checks.push({ id: check.id, expected });
        }
      }
      const cancelled = await prisma.customerUser.create({ data: { emailHash: `${prefix}:retention:cancelled`, encryptedEmail: "encrypted", emailVerifiedAt: now, locale: "en" } });
      customers.push(cancelled.id);
      await prisma.membershipSubscription.create({ data: { customerUserId: cancelled.id, plan: "PRO", status: "CANCELLED", currentPeriodEnd: new Date(now.getTime() - 31 * 86_400_000) } });
      const cancelledCheck = await prisma.priceCheck.create({ data: { rawInput: "cancelled", locale: "en", emailHash: cancelled.emailHash, encryptedEmail: "encrypted", serviceConsent: true, marketKey: "christchurch", status: "PUBLISHED", accessKeyHash: `${prefix}:retention:cancelled:access`, idempotencyKey: `${prefix}:retention:cancelled`, customerUserId: cancelled.id, createdAt: new Date(now.getTime() - 1 * 86_400_000) } });
      checks.push({ id: cancelledCheck.id, expected: "ARCHIVED" });

      const cleanup = await service.retentionCleanup(now);
      expect(cleanup.membershipHistoryArchived).toBeGreaterThanOrEqual(5);
      for (const check of checks) expect(await prisma.priceCheck.findUniqueOrThrow({ where: { id: check.id } })).toMatchObject({ status: check.expected });
    } finally {
      await prisma.priceCheck.deleteMany({ where: { id: { in: checks.map((item) => item.id) } } });
      await prisma.customerUser.deleteMany({ where: { id: { in: customers } } });
    }
  });

  it("exposes privacy-safe membership queue, risk, CAPTCHA and plan-economics metrics", async () => {
    const metrics = await membershipOperationalMetrics(new Date());
    expect(metrics).toHaveProperty("scheduler.pending");
    expect(metrics).toHaveProperty("captcha.manualRequiredLast24Hours");
    expect(metrics.planEconomics.map((item) => item.plan)).toEqual(["FREE", "HOST", "PRO", "PORTFOLIO"]);
    expect(JSON.stringify(metrics)).not.toMatch(/email|password|token|address/i);
  });

  it("idempotently persists direct Ticketmaster listings and Argus details without changing configuration", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "ticketmaster" } });
    const externalId = `tm-${prefix.replace(/[^a-z0-9]/gi, "").slice(-12)}`;
    const sourceUrl = `https://www.ticketmaster.co.nz/integration-auckland-16-08-2026/event/${externalId}`;
    let challenge = false;
    let listingComplete = true;
    let eventStatus = "EventScheduled";
    const requestedUrls: string[] = [];
    const argusServer = createArgusServer((capture) => {
      requestedUrls.push(capture.url);
      const listing = capture.workflow_id === "collect_listing";
      if (!listing) expect(capture.entry_url).toBe("https://www.ticketmaster.co.nz/discover/auckland");
      if (challenge) return argusChallenge(capture, listing ? "Auckland Events" : "Integration Stadium Event", "b");
      const venue = listing && !listingComplete ? undefined : { name: "Integration Stadium", address: { streetAddress: "1 Test Street", addressLocality: "Auckland", addressRegion: "NZ", postalCode: "1010", addressCountry: "NZ" }, latitude: -36.8485, longitude: 174.7633 };
      const event = { eventId: externalId, title: "Integration Stadium Event", sourceUrl, description: listing ? undefined : "Full Ticketmaster detail metadata", category: "SportsEvent", startsAt: "2026-08-16T19:30:00", endsAt: "2026-08-16T22:30:00", eventStatus: listing && !listingComplete ? undefined : eventStatus, venue, offers: listing ? [{ availability: "InStock", url: sourceUrl }] : { availability: "InStock", url: sourceUrl }, performers: listing ? [] : ["Integration Performer"], imageUrls: listing ? [] : ["https://s1.ticketm.net/test.jpg"] };
      const data = listing
        ? { data_schema: "ticketmaster-public.collect_listing", schema_version: "1.0.0", extractor: "ticketmaster", kind: "listing", title: "Auckland Events", canonicalUrl: capture.url, events: [event] }
        : { data_schema: "ticketmaster-public.collect_detail", schema_version: "1.0.0", extractor: "ticketmaster", kind: "detail", canonicalUrl: capture.url, event };
      return argusSuccess(capture, data, listing ? "Auckland Events" : "Integration Stadium Event", "b");
    });
    await new Promise<void>((resolve) => argusServer.listen(0, "127.0.0.1", resolve));
    const address = argusServer.address();
    if (!address || typeof address === "string") throw new Error("Ticketmaster Argus server did not bind");
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const existingTicketmasterHtml = await prisma.rawArtifact.count({ where: { dataSourceId: source.id, artifactType: "HTML", createdAt: { gte: today } } });
    const acceptanceService = new WorkerService(
      { ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: false, ARGUS_API_BASE_URL: `http://127.0.0.1:${address.port}`, ARGUS_API_TOKEN: "integration-argus-token-with-thirty-two-characters", TICKETMASTER_MIN_DELAY_MS: 0, TICKETMASTER_DELAY_JITTER_MS: 0, TICKETMASTER_DAILY_REQUEST_BUDGET: existingTicketmasterHtml + 20, TICKETMASTER_DISCOVERY_MAX_PAGES: 1, TICKETMASTER_DETAIL_BATCH_SIZE: 1, RAW_ARTIFACT_TTL_HOURS: 72, RAW_ARTIFACT_FAILURE_TTL_HOURS: 168 },
      undefined,
      async ({ url }) => {
        requestedUrls.push(url);
        const venue = listingComplete ? { "@type": "Place", name: "Integration Stadium", address: { "@type": "PostalAddress", streetAddress: "1 Test Street", addressLocality: "Auckland", addressRegion: "NZ", postalCode: "1010", addressCountry: "NZ" }, geo: { "@type": "GeoCoordinates", latitude: -36.8485, longitude: 174.7633 } } : undefined;
        const event = { "@type": "SportsEvent", name: "Integration Stadium Event", url: sourceUrl, startDate: "2026-08-16T19:30:00", endDate: "2026-08-16T22:30:00", ...(listingComplete ? { eventStatus, location: venue } : {}) };
        return { html: `<title>Auckland Events</title><script type="application/ld+json">${JSON.stringify(event)}</script>`, finalUrl: url };
      },
    );
    const runIds: string[] = [];
    const acceptanceMetadata = { ...(source.metadata as Prisma.JsonObject) };
    delete acceptanceMetadata.ticketmasterCooldownUntil;
    delete acceptanceMetadata.ticketmasterCooldownReason;
    await prisma.dataSource.update({
      where: { id: source.id },
      data: { metadata: acceptanceMetadata as Prisma.InputJsonValue },
    });
    try {
      const range = { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z") };
      const discovery = await acceptanceService.collectSource("ticketmaster", "new-zealand", undefined, { ...range, phase: "discovery", maxPages: 1, maxDetails: 1, localAcceptance: true });
      runIds.push(discovery.runId);
      expect(discovery).toMatchObject({ localAcceptance: true, references: 1, records: 0, events: 1, counters: { discovered: 1, targetsUpserted: 1, listingEventsPersisted: 1, detailRequestsAvoided: 1, detailsFetched: 0 } });
      const target = await prisma.sourceCrawlTarget.findFirstOrThrow({ where: { dataSourceId: source.id, url: sourceUrl } });
      expect(target).toMatchObject({ active: true, status: "LISTING_COMPLETE", nextFetchAt: null, consecutiveFailures: 0, metadata: { detailRequired: false, listingComplete: true } });

      const second = await acceptanceService.collectSource("ticketmaster", "new-zealand", undefined, { ...range, phase: "discovery", maxPages: 1, maxDetails: 1, localAcceptance: true });
      runIds.push(second.runId);
      expect(second).toMatchObject({ localAcceptance: true, references: 1, records: 0, events: 1, signals: 0, dryRun: false, counters: { requests: 1, listingEventsPersisted: 1, detailRequestsAvoided: 1, detailsFetched: 0, unchangedEventsSkipped: 1 } });
      const sourceOccurrences = await prisma.sourceEventOccurrence.findMany({
        where: { dataSourceId: source.id, externalId },
        include: { canonicalLinks: { include: { eventOccurrence: { include: { canonicalEvent: true, venue: true } } } } },
      });
      expect(sourceOccurrences).toHaveLength(1);
      expect(sourceOccurrences[0]).toMatchObject({ title: "Integration Stadium Event", city: "Auckland", region: "Auckland", impactStatus: "PENDING_EVIDENCE", isDemo: false, lastCollectionRunId: second.runId });
      expect(sourceOccurrences[0].canonicalLinks).toHaveLength(1);
      expect(sourceOccurrences[0].canonicalLinks[0].eventOccurrence).toMatchObject({
        canonicalEvent: { title: "Integration Stadium Event", category: "SportsEvent" },
        venue: { name: "Integration Stadium", city: "Auckland", region: "Auckland" },
      });
      expect(await prisma.sourceCrawlTarget.findUnique({ where: { id: target.id } })).toMatchObject({ active: true, status: "LISTING_COMPLETE", nextFetchAt: null, consecutiveFailures: 0, lastErrorCode: null });
      const successArtifacts = await prisma.rawArtifact.findMany({ where: { collectionRunId: second.runId } });
      expect(successArtifacts).toHaveLength(1);
      expect(successArtifacts.every((artifact) => !artifact.parserFailure && artifact.expiresAt.getTime() - artifact.createdAt.getTime() >= 71 * 3_600_000)).toBe(true);
      const secondRun = await prisma.collectionRun.findUniqueOrThrow({ where: { id: second.runId } });
      expect(secondRun.scope).toMatchObject({ localAcceptance: true, configurationUnchanged: true, schedulesUnchanged: true, limits: { maxRequests: 1, maxPages: 1, maxDetails: 1, maxRecords: 2, maxWindowDays: 31 } });
      expect(await prisma.dataSource.findUnique({ where: { id: source.id } })).toMatchObject({ lifecycle: source.lifecycle, operationalStatus: source.operationalStatus, healthStatus: source.healthStatus });
      listingComplete = false;
      const incompleteDiscovery = await acceptanceService.collectSource("ticketmaster", "new-zealand", undefined, { ...range, phase: "discovery", maxPages: 1, maxDetails: 1, localAcceptance: true });
      runIds.push(incompleteDiscovery.runId);
      expect(incompleteDiscovery).toMatchObject({ events: 0, counters: { detailRequestsAvoided: 0, listingEventsPersisted: 0 } });
      expect(await prisma.sourceCrawlTarget.findUnique({ where: { id: target.id } })).toMatchObject({ active: true, status: "PENDING", metadata: { detailRequired: true, listingComplete: false } });
      await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { priority: 0, nextFetchAt: new Date(0) } });
      const hydrated = await acceptanceService.collectSource("ticketmaster", "new-zealand", undefined, { ...range, phase: "details", maxDetails: 1, localAcceptance: true });
      runIds.push(hydrated.runId);
      expect(hydrated).toMatchObject({ records: 1, events: 1, counters: { detailsFetched: 1 } });
      expect(await prisma.sourceEventOccurrence.findFirstOrThrow({ where: { dataSourceId: source.id, externalId } })).toMatchObject({ lastCollectionRunId: hydrated.runId, metadata: { description: "Full Ticketmaster detail metadata" } });

      listingComplete = true;
      eventStatus = "EventCancelled";
      const cancelledDiscovery = await acceptanceService.collectSource("ticketmaster", "new-zealand", undefined, { ...range, phase: "discovery", maxPages: 1, maxDetails: 1, localAcceptance: true });
      runIds.push(cancelledDiscovery.runId);
      expect(cancelledDiscovery).toMatchObject({ references: 1, records: 0, events: 1, counters: { targetsUpserted: 1, detailsFetched: 0 } });
      expect(await prisma.sourceCrawlTarget.findUnique({ where: { id: target.id } })).toMatchObject({ active: false, status: "CANCELLED", nextFetchAt: null, consecutiveFailures: 0 });
      expect(await prisma.sourceEventOccurrence.findFirstOrThrow({ where: { dataSourceId: source.id, externalId } })).toMatchObject({ status: "CANCELLED", lastCollectionRunId: cancelledDiscovery.runId });

      challenge = true;
      await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { status: "PENDING", priority: 0, nextFetchAt: new Date(0), active: true } });
      const challenged = await acceptanceService.collectSource("ticketmaster", "new-zealand", undefined, { ...range, phase: "details", maxDetails: 1, localAcceptance: true });
      runIds.push(challenged.runId);
      expect(challenged).toMatchObject({ records: 0, events: 0, counters: { failures: 1, rawArtifacts: 2 } });
      expect(await prisma.sourceCrawlTarget.findUnique({ where: { id: target.id } })).toMatchObject({ status: "RATE_LIMITED", consecutiveFailures: 1, lastErrorCode: "RATE_LIMITED" });
      const failedArtifacts = await prisma.rawArtifact.findMany({ where: { collectionRunId: challenged.runId } });
      expect(failedArtifacts).toHaveLength(2);
      expect(failedArtifacts.every((artifact) => artifact.parserFailure && artifact.expiresAt.getTime() - artifact.createdAt.getTime() >= 167 * 3_600_000)).toBe(true);

      const challengedSource = await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } });
      expect(challengedSource.metadata).toMatchObject({ ticketmasterChallengeCount: 1, ticketmasterCircuitState: "OPEN", ticketmasterCooldownReason: "RATE_LIMITED_OR_CHALLENGE" });
      await prisma.dataSource.update({
        where: { id: source.id },
        data: { metadata: { ...(challengedSource.metadata as Prisma.JsonObject), ticketmasterCooldownUntil: new Date(0).toISOString() } },
      });
      challenge = false;
      eventStatus = "EventScheduled";
      const requestCountBeforeProbe = requestedUrls.length;
      const halfOpen = await acceptanceService.collectSource("ticketmaster", "new-zealand", undefined, { ...range, phase: "details", maxPages: 1, maxDetails: 1, localAcceptance: true });
      runIds.push(halfOpen.runId);
      expect(halfOpen).toMatchObject({ requestedPhase: "details", phase: "discovery", halfOpenProbe: true, references: 1, records: 0, counters: { requests: 1, pages: 1, detailsFetched: 0 } });
      expect(requestedUrls.slice(requestCountBeforeProbe)).toEqual(["https://www.ticketmaster.co.nz/discover/auckland"]);
      const recoveredSource = await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } });
      expect(recoveredSource.metadata).toMatchObject({ ticketmasterChallengeCount: 0, ticketmasterCircuitState: "CLOSED" });
      expect(recoveredSource.metadata).not.toHaveProperty("ticketmasterCooldownUntil");
    } finally {
      await new Promise<void>((resolve, reject) => argusServer.close((error) => error ? reject(error) : resolve()));
      const sourceEvents = await prisma.sourceEvent.findMany({ where: { dataSourceId: source.id, externalId }, include: { canonicalLinks: true, occurrences: { include: { canonicalLinks: true } } } });
      const canonicalEventIds = sourceEvents.flatMap((item) => item.canonicalLinks.map((link) => link.canonicalEventId));
      const eventOccurrenceIds = sourceEvents.flatMap((item) => item.occurrences.flatMap((occurrence) => occurrence.canonicalLinks.map((link) => link.eventOccurrenceId)));
      const venues = eventOccurrenceIds.length ? await prisma.eventOccurrence.findMany({ where: { id: { in: eventOccurrenceIds } }, select: { venueId: true } }) : [];
      await prisma.sourceEvent.deleteMany({ where: { id: { in: sourceEvents.map((item) => item.id) } } });
      await prisma.eventOccurrence.deleteMany({ where: { id: { in: eventOccurrenceIds } } });
      await prisma.canonicalEvent.deleteMany({ where: { id: { in: canonicalEventIds } } });
      await prisma.canonicalVenue.deleteMany({ where: { id: { in: venues.flatMap((item) => item.venueId ? [item.venueId] : []) } } });
      await prisma.sourceCrawlTarget.deleteMany({ where: { dataSourceId: source.id, url: sourceUrl } });
      await prisma.rawArtifact.deleteMany({ where: { collectionRunId: { in: runIds } } });
      await prisma.dataSource.update({
        where: { id: source.id },
        data: { metadata: source.metadata as Prisma.InputJsonValue },
      });
    }
  });

  it("persists both School Sport sources and Ticketek idempotently across two bounded passes", async () => {
    const sourceIds = ["school_sport_nz", "school_sport_canterbury", "ticketek_events"] as const;
    const sources = await prisma.dataSource.findMany({ where: { key: { in: [...sourceIds] } } });
    expect(sources).toHaveLength(3);
    const sourceByKey = new Map(sources.map((source) => [source.key, source]));
    const suffix = prefix.replace(/[^a-z0-9]/giu, "").slice(-10);
    const sportySeriesId = `sporty:ssc:${suffix}`;
    const sportyOccurrenceId = `${sportySeriesId}:2026-08-20`;
    const sportyNzSeriesId = `sporty:ssnz:${suffix}`;
    const sportyNzOccurrenceId = `${sportyNzSeriesId}:2026-08-19`;
    const ticketekSeriesId = `ticketek:${suffix}`;
    const ticketekOccurrenceId = `${ticketekSeriesId}:PERF1`;
    const ticketekUrl = `https://premier.ticketek.co.nz/shows/show.aspx?sh=${suffix.toUpperCase()}`;
    let ticketekDetailChallenge = false;
    const argusServer = createArgusServer((capture) => {
      if (capture.connector_id === "sporty-school-sport-public") {
        const isNational = capture.url.includes("/SSNZ/");
        const canonicalUrl = isNational ? "https://www.sporty.co.nz/SSNZ/Sport-1/Events" : "https://www.sporty.co.nz/sscanterbury";
        const sourceOrganisation = isNational ? "School Sport NZ" : "School Sport Canterbury";
        const seriesId = isNational ? sportyNzSeriesId : sportySeriesId;
        const occurrenceId = isNational ? sportyNzOccurrenceId : sportyOccurrenceId;
        const startsAt = isNational ? "2026-08-19" : "2026-08-20";
        return argusSuccess(capture, {
          data_schema: "sporty-school-sport-public.collect_events", schema_version: "1.0.0", extractor: "sporty_school_sport", kind: "event_listing",
          title: `Canterbury Tournament ${suffix}`, canonicalUrl, sourceOrganisation, window: { startsOn: "2026-08-01", endsOn: "2026-09-30" },
          series: [{ seriesId, title: `Canterbury Tournament ${suffix}`, sport: "Athletics", genderGrade: "Secondary", sourceOrganisation, canonicalUrl, sourceUpdated: null, imageUrl: null, description: null, fieldSources: { title: "fixture" } }],
          occurrences: [{ seriesId, occurrenceId, title: `Canterbury Tournament ${suffix}`, sport: "Athletics", genderGrade: "Secondary", venue: "Nga Puna Wai", address: null, locality: "Christchurch", region: "Canterbury", startsAt, endsAt: startsAt, timePrecision: "DATE", timezone: "Pacific/Auckland", status: "SCHEDULED", canonicalUrl, sourceOrganisation, sourceUpdated: null, imageUrl: null, description: null, canterburyHosted: true, fieldSources: { title: "fixture" } }],
          totalSeries: 1, totalOccurrences: 1, truncated: false, quality: "complete", missingFields: [], warnings: [], fieldSources: { series: "fixture", occurrences: "fixture" },
        }, `Canterbury Tournament ${suffix}`, "d");
      }
      const series = { seriesId: ticketekSeriesId, title: `Ticketek Show ${suffix}`, category: "Theatre", imageUrl: null, canonicalUrl: ticketekUrl, status: "SCHEDULED", sourceUpdated: null, description: "Integration detail", fieldSources: { title: "fixture" } };
      const occurrence = { occurrenceId: ticketekOccurrenceId, seriesId: ticketekSeriesId, title: `Ticketek Show ${suffix}`, startsAt: "2026-08-21T19:30:00", endsAt: null, timePrecision: "DATETIME", timezone: "Pacific/Auckland", venue: "Isaac Theatre Royal", city: "Christchurch", region: "Canterbury", status: "SCHEDULED", ticketState: "AVAILABLE", canonicalUrl: ticketekUrl, fieldSources: { title: "fixture" } };
      if (capture.workflow_id === "collect_detail" && ticketekDetailChallenge) return argusChallenge(capture, "Access challenge", "e");
      return argusSuccess(capture, capture.workflow_id === "collect_listing" ? {
        data_schema: "ticketek-public.collect_listing", schema_version: "1.0.0", extractor: "ticketek", kind: "event_listing", title: "What's On", canonicalUrl: capture.url, currentPage: 1,
        series: [{ ...series, description: undefined }], occurrences: [occurrence], totalSeries: 1, totalOccurrences: 1, truncated: false, quality: "complete", missingFields: [], warnings: [], fieldSources: { series: "fixture", occurrences: "fixture" },
      } : {
        data_schema: "ticketek-public.collect_detail", schema_version: "1.0.0", extractor: "ticketek", kind: "event_detail", title: series.title, canonicalUrl: ticketekUrl,
        series, occurrences: [occurrence], quality: "complete", missingFields: [], warnings: [], fieldSources: { series: "fixture", occurrences: "fixture" },
      }, `Ticketek Show ${suffix}`, "e");
    });
    await new Promise<void>((resolve) => argusServer.listen(0, "127.0.0.1", resolve));
    const address = argusServer.address();
    if (!address || typeof address === "string") throw new Error("Argus event integration server did not bind");
    const acceptanceService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: false, ARGUS_API_BASE_URL: `http://127.0.0.1:${address.port}`, ARGUS_API_TOKEN: "integration-argus-token-with-thirty-two-characters" });
    const runIds: string[] = [];
    const counts = async (dataSourceId: string) => ({
      sourceEvents: await prisma.sourceEvent.count({ where: { dataSourceId } }),
      sourceOccurrences: await prisma.sourceEventOccurrence.count({ where: { dataSourceId } }),
      eventLinks: await prisma.eventSourceLink.count({ where: { sourceEvent: { dataSourceId } } }),
      occurrenceLinks: await prisma.eventOccurrenceSourceLink.count({ where: { sourceEventOccurrence: { dataSourceId } } }),
    });
    try {
      for (const sourceId of sourceIds) {
        const source = sourceByKey.get(sourceId)!;
        const options = { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-30T00:00:00Z"), phase: "full" as const, limit: 10, maxDetails: 1, localAcceptance: true };
        const first = await acceptanceService.collectSource(sourceId, "christchurch", undefined, options);
        runIds.push(first.runId);
        const afterFirst = await counts(source.id);
        const second = await acceptanceService.collectSource(sourceId, "christchurch", undefined, options);
        runIds.push(second.runId);
        expect(await counts(source.id)).toEqual(afterFirst);
        expect(second.counters.unchangedSkipped).toBeGreaterThanOrEqual(1);
        expect(second.events).toBeGreaterThanOrEqual(1);
        const secondRun = await prisma.collectionRun.findUniqueOrThrow({ where: { id: second.runId } });
        expect(secondRun.scope).toMatchObject({ configurationUnchanged: true, schedulesUnchanged: true });
      }
      ticketekDetailChallenge = true;
      const ticketekCountsBeforeChallenge = await counts(sourceByKey.get("ticketek_events")!.id);
      const challenged = await acceptanceService.collectSource("ticketek_events", "christchurch", undefined, { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-30T00:00:00Z"), phase: "full", limit: 10, maxDetails: 1, localAcceptance: true });
      runIds.push(challenged.runId);
      expect(challenged).toMatchObject({ events: 1, counters: { failures: 1 } });
      expect(await counts(sourceByKey.get("ticketek_events")!.id)).toEqual(ticketekCountsBeforeChallenge);
      expect(await prisma.collectionRun.findUniqueOrThrow({ where: { id: challenged.runId } })).toMatchObject({ status: "PARTIAL", errorCode: "RATE_LIMITED" });
      expect(await prisma.sourceCrawlTarget.findFirstOrThrow({ where: { dataSourceId: sourceByKey.get("ticketek_events")!.id, url: ticketekUrl } })).toMatchObject({ status: "RATE_LIMITED", consecutiveFailures: 1, lastErrorCode: "RATE_LIMITED" });
    } finally {
      await new Promise<void>((resolve, reject) => argusServer.close((error) => error ? reject(error) : resolve()));
      for (const [sourceId, externalId] of [["school_sport_nz", sportyNzOccurrenceId], ["school_sport_canterbury", sportyOccurrenceId], ["ticketek_events", ticketekOccurrenceId]] as const) {
        const source = sourceByKey.get(sourceId)!;
        const sourceEvents = await prisma.sourceEvent.findMany({ where: { dataSourceId: source.id }, include: { canonicalLinks: true, occurrences: { include: { canonicalLinks: true } } } });
        const ownedEvents = sourceEvents.filter((item) => item.occurrences.some((occurrence) => occurrence.externalId === externalId));
        const canonicalEventIds = ownedEvents.flatMap((item) => item.canonicalLinks.map((link) => link.canonicalEventId));
        const eventOccurrenceIds = ownedEvents.flatMap((item) => item.occurrences.flatMap((occurrence) => occurrence.canonicalLinks.map((link) => link.eventOccurrenceId)));
        const venues = eventOccurrenceIds.length ? await prisma.eventOccurrence.findMany({ where: { id: { in: eventOccurrenceIds } }, select: { venueId: true } }) : [];
        await prisma.sourceEvent.deleteMany({ where: { id: { in: ownedEvents.map((item) => item.id) } } });
        await prisma.eventOccurrence.deleteMany({ where: { id: { in: eventOccurrenceIds } } });
        await prisma.canonicalEvent.deleteMany({ where: { id: { in: canonicalEventIds } } });
        await prisma.canonicalVenue.deleteMany({ where: { id: { in: venues.flatMap((item) => item.venueId ? [item.venueId] : []) } } });
        await prisma.sourceCrawlTarget.deleteMany({ where: { dataSourceId: source.id, url: ticketekUrl } });
      }
      await prisma.rawArtifact.deleteMany({ where: { collectionRunId: { in: runIds } } });
    }
  });

  it("idempotently persists bounded RBNZ values and Argus evidence", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "fx_rates" } });
    const argusServer = createArgusServer((capture) => argusSuccess(capture, {
          data_schema: "rbnz-fx.collect_exchange_rates",
          schema_version: "1.0.0",
          extractor: "rbnz_fx",
          kind: "exchange_rates",
          title: "Exchange rates and TWI",
          canonicalUrl: "https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index",
          asOf: "2026-07-20",
          previousAsOf: "2026-07-17",
          baseCurrency: "NZD",
          quoteConvention: "foreign_currency_units_per_NZD",
          rates: [
            { series: "TWI", label: "17 currency basket", value: 66.94, previousValue: 66.87 },
            { series: "USD", label: "United States dollar", value: 0.58435, previousValue: 0.58375 },
            { series: "EUR", label: "European euro", value: 0.51095, previousValue: 0.5103 },
          ],
        }, "Exchange rates and TWI", "c"));
    await new Promise<void>((resolve) => argusServer.listen(0, "127.0.0.1", resolve));
    const address = argusServer.address();
    if (!address || typeof address === "string") throw new Error("RBNZ Argus server did not bind");
    const acceptanceService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: false, ARGUS_API_BASE_URL: `http://127.0.0.1:${address.port}`, ARGUS_API_TOKEN: "integration-argus-token-with-thirty-two-characters" });
    const runIds: string[] = [];
    let canonicalIds: string[] = [];
    try {
      const first = await acceptanceService.collectSource("fx_rates", "new-zealand", undefined, { from: new Date("2026-07-20T00:00:00Z"), to: new Date("2026-09-20T00:00:00Z"), limit: 99, localAcceptance: true });
      const second = await acceptanceService.collectSource("fx_rates", "new-zealand", undefined, { from: new Date("2026-07-20T00:00:00Z"), to: new Date("2026-09-20T00:00:00Z"), limit: 99, localAcceptance: true });
      runIds.push(first.runId, second.runId);
      expect(first).toMatchObject({ localAcceptance: true, references: 1, records: 2, signals: 2, counters: { requests: 1, pages: 1, records: 2, signals: 2 } });
      expect(second).toMatchObject({ counters: { unchangedSignalsSkipped: 2 } });
      const sourceSignals = await prisma.sourceMarketSignal.findMany({ where: { dataSourceId: source.id, externalId: { startsWith: "rbnz-b1:2026-07-20:" } }, include: { canonicalLink: true }, orderBy: { externalId: "asc" } });
      expect(sourceSignals).toHaveLength(2);
      expect(sourceSignals.every((signal) => signal.type === "FX_RATE" && signal.lastCollectionRunId === second.runId)).toBe(true);
      expect(sourceSignals[0].metadata).toMatchObject({ signal: { baseCurrency: "NZD", quoteConvention: "foreign_currency_units_per_NZD" } });
      canonicalIds = sourceSignals.flatMap((signal) => signal.canonicalLink ? [signal.canonicalLink.marketSignalId] : []);
      expect(await prisma.rawArtifact.count({ where: { collectionRunId: { in: runIds } } })).toBe(4);
      const secondRun = await prisma.collectionRun.findUniqueOrThrow({ where: { id: second.runId } });
      expect(secondRun.scope).toMatchObject({ localAcceptance: true, configurationUnchanged: true, schedulesUnchanged: true, effective: { limit: 2 }, limits: { maxRequests: 1, maxPages: 1, maxRecords: 2, maxWindowDays: 31 } });
    } finally {
      await new Promise<void>((resolve, reject) => argusServer.close((error) => error ? reject(error) : resolve()));
      await prisma.sourceMarketSignal.deleteMany({ where: { dataSourceId: source.id, externalId: { startsWith: "rbnz-b1:2026-07-20:" } } });
      await prisma.marketSignal.deleteMany({ where: { id: { in: canonicalIds } } });
      await prisma.rawArtifact.deleteMany({ where: { collectionRunId: { in: runIds } } });
    }
  });

  it("idempotently persists Eventfinda series and occurrences through the canonical event pipeline", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "eventfinda" } });
    const eventId = `${prefix}:eventfinda-series`;
    const sourceUrl = `https://www.eventfinda.co.nz/2026/${encodeURIComponent(prefix.slice(-8))}/christchurch`;
    const detail: EventfindaDetailExtraction = {
      extractor: "eventfinda",
      kind: "event_detail",
      eventId,
      title: "Integration Eventfinda Theatre",
      canonicalUrl: sourceUrl,
      category: null,
      description: "Integration event used for canonical persistence regression.",
      imageUrls: ["https://cdn.eventfinda.co.nz/integration.jpg"],
      venue: { name: "Integration Eventfinda Venue", address: { streetAddress: "134 Oxford Terrace", addressLocality: "Christchurch", addressCountry: "New Zealand" }, latitude: -43.5324, longitude: 172.6345 },
      offers: [{ name: "Adult", price: "20.00", url: `${sourceUrl}/tickets` }],
      performers: [],
      restrictions: "All Ages",
      phoneSales: null,
      websites: [],
      listedBy: [],
      tour: [],
      occurrences: [
        { name: "Integration Eventfinda Theatre", description: null, sourceUrl, startDate: "2026-08-16T18:00:00+12:00", endDate: "2026-08-16T23:59:59+12:00", previousStartDate: null, eventStatus: null, attendanceMode: "OfflineEventAttendanceMode", imageUrls: [], location: null, offers: [], performers: [], organizer: null },
        { name: "Integration Eventfinda Theatre", description: null, sourceUrl, startDate: "2026-09-20T18:00:00+12:00", endDate: "2026-09-20T20:00:00+12:00", previousStartDate: null, eventStatus: "EventScheduled", attendanceMode: "OfflineEventAttendanceMode", imageUrls: [], location: null, offers: [], performers: [], organizer: null },
      ],
    };
    const events = normaliseEventfindaDetail(detail, { category: "Theatre", ticketAction: "Buy Tickets" });
    const runIds: string[] = [];
    let canonicalEventIds: string[] = [];
    let eventOccurrenceIds: string[] = [];
    let venueIds: string[] = [];
    let secondPassUnchanged = 0;
    try {
      for (let pass = 1; pass <= 2; pass += 1) {
        const run = await prisma.collectionRun.create({ data: { dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "RUNNING", scope: { sourceId: "eventfinda", regression: true, pass }, startedAt: new Date(), attemptCount: 1, isDemo: true } });
        runIds.push(run.id);
        const persisted = await service.persistNormalisedEvents(events, source.id, run.id);
        if (pass === 2) secondPassUnchanged = [...persisted.values()].filter((item) => item.unchanged).length;
        await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: events.length, finishedAt: new Date() } });
      }

      const sourceEvents = await prisma.sourceEvent.findMany({ where: { dataSourceId: source.id, externalId: eventId }, include: { canonicalLinks: true, occurrences: { include: { canonicalLinks: true } } } });
      expect(sourceEvents).toHaveLength(1);
      expect(sourceEvents[0].status).toBe("SCHEDULED");
      expect(sourceEvents[0].occurrences).toHaveLength(2);
      expect(sourceEvents[0].canonicalLinks).toHaveLength(1);
      expect(sourceEvents[0].occurrences.every((occurrence) => occurrence.lastCollectionRunId === runIds[1])).toBe(true);
      expect(secondPassUnchanged).toBe(2);

      canonicalEventIds = sourceEvents.flatMap((item) => item.canonicalLinks.map((link) => link.canonicalEventId));
      eventOccurrenceIds = sourceEvents.flatMap((item) => item.occurrences.flatMap((occurrence) => occurrence.canonicalLinks.map((link) => link.eventOccurrenceId)));
      const canonicalEvents = await prisma.canonicalEvent.findMany({ where: { id: { in: canonicalEventIds } }, include: { occurrences: { include: { venue: true, sourceLinks: true } }, sourceLinks: true } });
      expect(canonicalEvents).toHaveLength(1);
      expect(canonicalEvents[0].occurrences).toHaveLength(2);
      expect(canonicalEvents[0].sourceLinks).toHaveLength(1);
      expect(canonicalEvents[0].occurrences.every((occurrence) => occurrence.sourceLinks.length === 1)).toBe(true);
      expect(canonicalEvents[0].occurrences[0].venue).toMatchObject({ city: "Christchurch", region: "Canterbury" });
      expect(canonicalEvents[0].occurrences[0]).toMatchObject({ status: "SCHEDULED", ticketStatus: "ONSALE" });
      const placeholderEndOccurrence = canonicalEvents[0].occurrences.find((occurrence) => occurrence.startsAt.toISOString() === "2026-08-16T06:00:00.000Z");
      expect(placeholderEndOccurrence?.endsAt).toEqual(placeholderEndOccurrence?.startsAt);
      venueIds = canonicalEvents[0].occurrences.flatMap((occurrence) => occurrence.venueId ? [occurrence.venueId] : []);

      const unchangedSource = await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } });
      expect(unchangedSource).toMatchObject({ lifecycle: source.lifecycle, operationalStatus: source.operationalStatus, healthStatus: source.healthStatus });
    } finally {
      await prisma.sourceEvent.deleteMany({ where: { dataSourceId: source.id, externalId: eventId } });
      await prisma.eventOccurrence.deleteMany({ where: { id: { in: eventOccurrenceIds } } });
      await prisma.canonicalEvent.deleteMany({ where: { id: { in: canonicalEventIds } } });
      await prisma.canonicalVenue.deleteMany({ where: { id: { in: venueIds } } });
    }
  });

  it("persists bounded Eventfinda discovery and details through direct HTTP", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "eventfinda" } });
    const suffix = prefix.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase();
    const eventId = `acceptance-${suffix}`;
    const sourceUrl = `https://www.eventfinda.co.nz/2026/acceptance-${suffix}/christchurch`;
    const unseenUrl = `https://www.eventfinda.co.nz/2026/unseen-${suffix}/wellington`;
    const protectedUrl = `https://www.eventfinda.co.nz/2026/nationwide-${suffix}/auckland`;
    let challenge = false;
    let listingTotalPages = 1;
    const argusServer = createArgusServer((capture) => {
      if (challenge) return argusChallenge(capture, "Security check", "a");
      if (capture.workflow_id === "collect_listing") {
        return argusSuccess(capture, { data_schema: "eventfinda-public.collect_listing", schema_version: "1.0.0", extractor: "eventfinda", kind: "listing", title: "Events", canonicalUrl: capture.url, currentPage: 1, totalPages: listingTotalPages, nextUrl: listingTotalPages > 1 ? `${capture.url}/page/2` : null, events: [{ eventId, title: "Acceptance Theatre", sourceUrl, startsAt: "2026-08-16T18:00:00+12:00", venueName: "Acceptance Venue", location: "Acceptance Venue, Christchurch", category: "Theatre", imageUrl: null, sponsored: false, ticketAction: "Buy Tickets" }] }, "Events", "a");
      }
      return argusSuccess(capture, { data_schema: "eventfinda-public.collect_detail", schema_version: "1.0.0", extractor: "eventfinda", kind: "event_detail", eventId, title: "Acceptance Theatre", canonicalUrl: sourceUrl, category: "Theatre", description: "Bounded Argus persistence acceptance.", imageUrls: [], venue: { name: "Acceptance Venue", address: { streetAddress: "1 Acceptance Street", addressLocality: "Christchurch", addressRegion: "Canterbury", postalCode: "8011", addressCountry: "New Zealand" }, latitude: -43.53, longitude: 172.63 }, offers: [{ name: "Adult", price: "20.00", priceCurrency: "NZD", availability: "InStock", url: `${sourceUrl}/tickets` }], performers: [], restrictions: null, phoneSales: null, websites: [], listedBy: [], tour: [], occurrences: [{ name: "Acceptance Theatre", description: null, sourceUrl, startDate: "2026-08-16T18:00:00+12:00", endDate: "2026-08-16T20:00:00+12:00", previousStartDate: null, eventStatus: "EventScheduled", attendanceMode: "OfflineEventAttendanceMode", imageUrls: [], location: null, offers: [], performers: [], organizer: null }] }, "Acceptance Theatre", "a");
    });
    await new Promise<void>((resolve) => argusServer.listen(0, "127.0.0.1", resolve));
    const address = argusServer.address();
    if (!address || typeof address === "string") throw new Error("Acceptance Argus server did not bind to a TCP port");
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const existingEventfindaHtml = await prisma.rawArtifact.count({
      where: { dataSourceId: source.id, artifactType: "HTML", createdAt: { gte: today } },
    });
    const acceptanceService = new WorkerService({
      ...environment,
      NODE_ENV: "development",
      SCHEDULER_ENABLED: false,
      ARGUS_API_BASE_URL: `http://127.0.0.1:${address.port}`,
      ARGUS_API_TOKEN: "integration-argus-token-with-thirty-two-characters",
      EVENTFINDA_MIN_DELAY_MS: 0,
      EVENTFINDA_DELAY_JITTER_MS: 0,
      EVENTFINDA_DAILY_REQUEST_BUDGET: existingEventfindaHtml + 100,
      EVENTFINDA_DISCOVERY_MAX_PAGES: 1,
      EVENTFINDA_DETAIL_BATCH_SIZE: 1,
      RAW_ARTIFACT_TTL_HOURS: 72,
      RAW_ARTIFACT_FAILURE_TTL_HOURS: 168,
    }, undefined, async ({ url }) => {
      if (challenge) throw new AdapterError("RATE_LIMITED", "Synthetic direct HTTP 429", true);
      if (url.includes("/whatson/events/")) {
        return { html: `<title>Events</title><div class="listings-events"><article class="card h-event"><h2 class="p-name"><a href="${sourceUrl}">Acceptance Theatre</a></h2><div class="dtstart"><span class="value-title" title="2026-08-16T18:00:00+12:00"></span></div><div class="p-location"><a class="location">Acceptance Venue</a> Christchurch</div><div class="meta-date"><span class="category">Theatre</span></div><script>_efC(3, ${JSON.stringify(eventId)})</script></article></div>${listingTotalPages > 1 ? `<nav class="pagination"><a href="/whatson/events/new-zealand/page/${listingTotalPages}">${listingTotalPages}</a></nav>` : ""}`, finalUrl: url };
      }
      const jsonLd = [{ "@type": "Place", "@id": "place:acceptance", name: "Acceptance Venue", address: { streetAddress: "1 Acceptance Street", addressLocality: "Christchurch", addressRegion: "Canterbury", postalCode: "8011", addressCountry: "New Zealand" }, geo: { latitude: -43.53, longitude: 172.63 } }, { "@type": "Event", name: "Acceptance Theatre", url: sourceUrl, startDate: "2026-08-16T18:00:00+12:00", endDate: "2026-08-16T20:00:00+12:00", eventStatus: "https://schema.org/EventScheduled", location: { "@id": "place:acceptance" } }];
      return { html: `<title>Acceptance Theatre</title><h1 class="p-name">Acceptance Theatre</h1><span class="p-category">Theatre</span><div id="eventDescription">Bounded direct HTTP persistence acceptance.</div><div data-watchable-type="event" data-watchable-id="${eventId}"></div><script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`, finalUrl: url };
    });
    const runIds: string[] = [];
    let canonicalEventIds: string[] = [];
    let eventOccurrenceIds: string[] = [];
    let venueIds: string[] = [];
    const protectedTarget = await prisma.sourceCrawlTarget.create({
      data: { dataSourceId: source.id, url: protectedUrl, urlHash: `nationwide-${suffix}`, kind: "EVENT_DETAIL", active: true, status: "PENDING", missedDiscoveryCount: 1, lastSeenAt: new Date(0) },
    });
    try {
      const discovery = await acceptanceService.collectSource("eventfinda", "new-zealand", undefined, { phase: "discovery", maxPages: 1, maxDetails: 1, localAcceptance: true });
      runIds.push(discovery.runId);
      expect(discovery).toMatchObject({ localAcceptance: true, pagesScanned: 1, totalPages: 1, discovered: 1, targetsUpserted: 1, failureCount: 0 });
      expect(await prisma.sourceCrawlTarget.findUnique({ where: { id: protectedTarget.id } })).toMatchObject({ active: true, missedDiscoveryCount: 1, status: "PENDING" });
      const target = await prisma.sourceCrawlTarget.findFirstOrThrow({ where: { dataSourceId: source.id, url: sourceUrl } });
      await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { priority: 0, nextFetchAt: new Date(0) } });

      const first = await acceptanceService.collectSource("eventfinda", "new-zealand", undefined, { phase: "details", maxPages: 1, maxDetails: 1, localAcceptance: true });
      runIds.push(first.runId);
      expect(first).toMatchObject({ detailsFetched: 1, eventsPersisted: 1, failureCount: 0 });
      await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { priority: 0, nextFetchAt: new Date(0) } });

      const second = await acceptanceService.collectSource("eventfinda", "new-zealand", undefined, { phase: "details", maxPages: 1, maxDetails: 1, localAcceptance: true });
      runIds.push(second.runId);
      expect(second).toMatchObject({ detailsFetched: 1, unchangedDetails: 1, eventsPersisted: 1, unchangedEventsSkipped: 1, failureCount: 0 });
      expect(await prisma.sourceCrawlTarget.findUnique({ where: { id: target.id } })).toMatchObject({ metadata: { detailUnchanged: true, unchangedDetailFetchCount: 1 } });
      const sourceEvents = await prisma.sourceEvent.findMany({ where: { dataSourceId: source.id, externalId: eventId }, include: { canonicalLinks: true, occurrences: { include: { canonicalLinks: true } } } });
      expect(sourceEvents).toHaveLength(1);
      expect(sourceEvents[0].occurrences).toHaveLength(1);
      expect(sourceEvents[0].canonicalLinks).toHaveLength(1);
      expect(sourceEvents[0].occurrences[0].canonicalLinks).toHaveLength(1);
      expect(sourceEvents[0].occurrences[0].lastCollectionRunId).toBe(second.runId);
      canonicalEventIds = sourceEvents.flatMap((item) => item.canonicalLinks.map((link) => link.canonicalEventId));
      eventOccurrenceIds = sourceEvents.flatMap((item) => item.occurrences.flatMap((occurrence) => occurrence.canonicalLinks.map((link) => link.eventOccurrenceId)));
      venueIds = (await prisma.eventOccurrence.findMany({ where: { id: { in: eventOccurrenceIds } }, select: { venueId: true } })).flatMap((item) => item.venueId ? [item.venueId] : []);
      const successArtifacts = await prisma.rawArtifact.findMany({ where: { collectionRunId: second.runId } });
      expect(successArtifacts).toHaveLength(1);
      expect(successArtifacts.every((artifact) => !artifact.parserFailure && artifact.expiresAt.getTime() - artifact.createdAt.getTime() >= 71 * 3_600_000)).toBe(true);

      const unseenTarget = await prisma.sourceCrawlTarget.create({ data: { dataSourceId: source.id, url: unseenUrl, urlHash: `unseen-${suffix}`, kind: "EVENT_DETAIL", active: true, status: "PENDING", missedDiscoveryCount: 1, lastSeenAt: new Date(0) } });
      listingTotalPages = 2;
      const partialDiscovery = await acceptanceService.collectSource("eventfinda", "new-zealand", undefined, { phase: "discovery", maxPages: 1, maxDetails: 1, localAcceptance: true });
      runIds.push(partialDiscovery.runId);
      expect(partialDiscovery).toMatchObject({ pagesScanned: 1, totalPages: 2 });
      expect(await prisma.sourceCrawlTarget.findUnique({ where: { id: unseenTarget.id } })).toMatchObject({ active: true, missedDiscoveryCount: 1 });

      await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { priority: 0, nextFetchAt: new Date(0) } });
      challenge = true;
      const challenged = await acceptanceService.collectSource("eventfinda", "new-zealand", undefined, { phase: "details", maxPages: 1, maxDetails: 1, localAcceptance: true });
      runIds.push(challenged.runId);
      expect(challenged).toMatchObject({ failureCount: 1, rateLimited: true });
      const failureArtifacts = await prisma.rawArtifact.findMany({ where: { collectionRunId: challenged.runId } });
      expect(failureArtifacts).toHaveLength(0);
      expect(await prisma.sourceCrawlTarget.findUnique({ where: { id: target.id } })).toMatchObject({ status: "RATE_LIMITED", consecutiveFailures: 1 });
      expect(await prisma.dataSource.findUnique({ where: { id: source.id } })).toMatchObject({ operationalStatus: source.operationalStatus, healthStatus: source.healthStatus, metadata: { collectionCooldownReason: "RATE_LIMITED_OR_CHALLENGE" } });
    } finally {
      await new Promise<void>((resolve, reject) => argusServer.close((error) => error ? reject(error) : resolve()));
      const sourceEvents = await prisma.sourceEvent.findMany({ where: { dataSourceId: source.id, externalId: eventId }, include: { canonicalLinks: true, occurrences: { include: { canonicalLinks: true } } } });
      canonicalEventIds = [...new Set([...canonicalEventIds, ...sourceEvents.flatMap((item) => item.canonicalLinks.map((link) => link.canonicalEventId))])];
      eventOccurrenceIds = [...new Set([...eventOccurrenceIds, ...sourceEvents.flatMap((item) => item.occurrences.flatMap((occurrence) => occurrence.canonicalLinks.map((link) => link.eventOccurrenceId)))])];
      await prisma.sourceEvent.deleteMany({ where: { dataSourceId: source.id, externalId: eventId } });
      await prisma.sourceCrawlTarget.deleteMany({ where: { dataSourceId: source.id, url: { in: [sourceUrl, unseenUrl, protectedUrl] } } });
      await prisma.eventOccurrence.deleteMany({ where: { id: { in: eventOccurrenceIds } } });
      await prisma.canonicalEvent.deleteMany({ where: { id: { in: canonicalEventIds } } });
      await prisma.canonicalVenue.deleteMany({ where: { id: { in: venueIds } } });
      await prisma.rawArtifact.deleteMany({ where: { collectionRunId: { in: runIds } } });
      await prisma.dataSource.update({ where: { id: source.id }, data: { lifecycle: source.lifecycle, operationalStatus: source.operationalStatus, status: source.status, healthStatus: source.healthStatus, enabled: source.enabled, lastSuccessAt: source.lastSuccessAt, errorRate: source.errorRate, metadata: source.metadata as Prisma.InputJsonValue } });
    }
  });
});

type TestArgusCapture = {
  trace_id: string;
  connector_id: "ticketmaster-public" | "eventfinda-public" | "ourauckland-public" | "rbnz-fx" | "sporty-school-sport-public" | "ticketek-public";
  workflow_id: "collect_events" | "collect_listing" | "collect_detail" | "collect_exchange_rates";
  url: string;
  entry_url?: string;
  start_date?: string;
  end_date?: string;
};

function createArgusServer(captureResult: (capture: TestArgusCapture) => Record<string, unknown>) {
  const results = new Map<string, { capture: TestArgusCapture; result: Record<string, unknown> }>();
  const acknowledged = new Set<string>();
  return createServer(async (request, response) => {
    expect(request.headers.authorization).toBe("Bearer integration-argus-token-with-thirty-two-characters");
    if (request.method === "POST" && request.url === "/v1/jobs") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { captures: TestArgusCapture[] };
      const capture = body.captures[0];
      if (!capture) throw new Error("Argus integration request contained no capture");
      const jobId = `job_${randomUUID().replaceAll("-", "")}`;
      results.set(jobId, { capture, result: captureResult(capture) });
      return sendJson(response, 202, { contract_version: "1.0", job_id: jobId, status: "COMPLETED" });
    }
    const match = request.url?.match(/^\/v1\/jobs\/([^/]+)(\/result)?$/u);
    if (request.method === "GET" && match) {
      if (match[2] && acknowledged.has(match[1]!)) return sendJson(response, 410, { error: "PURGED" });
      const stored = results.get(match[1]!);
      if (!stored) return sendJson(response, 404, { error: "NOT_FOUND" });
      if (!match[2]) return sendJson(response, 200, { contract_version: "1.0", job_id: match[1], status: "COMPLETED" });
      return sendJson(response, 200, {
        contract_version: "1.0",
        job_id: match[1],
        status: "COMPLETED",
        result_sha256: "f".repeat(64),
        items: [{ trace_id: stored.capture.trace_id, status: "COMPLETED", result: stored.result, error_category: null }],
        error: null,
      });
    }
    const acknowledgement = request.url?.match(/^\/v1\/jobs\/([^/]+)\/ack$/u);
    if (request.method === "POST" && acknowledgement) {
      if (!results.has(acknowledgement[1]!)) return sendJson(response, 404, { error: "NOT_FOUND" });
      acknowledged.add(acknowledgement[1]!);
      return sendJson(response, 200, { contract_version: "1.0", job_id: acknowledgement[1] });
    }
    const evidence = request.url?.match(/^\/v1\/event-captures\/([^/]+)\/evidence\/(html|screenshot)$/u);
    if (request.method === "GET" && evidence) {
      const stored = [...results.values()].find((value) => value.capture.trace_id === evidence[1]);
      const pointer = (stored?.result.evidence as Array<{ kind: string; sha256: string }> | undefined)?.find((item) => item.kind === evidence[2]);
      if (!pointer) return sendJson(response, 404, { error: "NOT_FOUND" });
      const content = evidenceContent(evidence[2]!, pointer.sha256);
      response.writeHead(200, { "content-type": evidence[2] === "html" ? "text/html" : "image/png", "x-argus-content-sha256": pointer.sha256 });
      return response.end(content);
    }
    return sendJson(response, 404, { error: "NOT_FOUND" });
  });
}

function argusSuccess(capture: TestArgusCapture, data: Record<string, unknown>, title: string, hashCharacter: string) {
  return argusResult(capture, true, "success", data, title, hashCharacter, null);
}

function argusChallenge(capture: TestArgusCapture, title: string, hashCharacter: string) {
  return argusResult(capture, false, "challenge", null, title, hashCharacter, { kind: "access_challenge_detected", signals: ["integration"] });
}

function argusResult(capture: TestArgusCapture, ok: boolean, status: "success" | "challenge", data: Record<string, unknown> | null, title: string, hashCharacter: string, challenge: Record<string, unknown> | null) {
  const evidence = (["html", "screenshot"] as const).map((kind) => ({
    kind,
    traceId: capture.trace_id,
    relativePath: `results/argus/${capture.trace_id}/${kind === "html" ? "page.html" : "screenshot.png"}`,
    storageRef: `argus-evidence:results/argus/${capture.trace_id}/${kind === "html" ? "page.html" : "screenshot.png"}`,
    sha256: createHash("sha256").update(Buffer.alloc(100, `${hashCharacter}:${kind}`)).digest("hex"),
    sizeBytes: 100,
    containsSensitiveData: false,
    createdAt: "2026-08-02T00:00:00.000Z",
  }));
  return {
    contract_version: "1.0",
    ok,
    status,
    trace_id: capture.trace_id,
    connector_id: capture.connector_id,
    workflow_id: capture.workflow_id,
    readonly_only: true,
    external_side_effects_performed: false,
    page: { title, final_url: capture.url, html_bytes: 100, screenshot_bytes: 100 },
    data,
    evidence,
    challenge,
    error: null,
  };
}

function evidenceContent(kind: string, expectedSha256: string): Buffer {
  for (const character of ["b", "c", "d", "e"]) {
    const content = Buffer.alloc(100, `${character}:${kind}`);
    if (createHash("sha256").update(content).digest("hex") === expectedSha256) return content;
  }
  throw new Error(`Unknown integration evidence hash for ${kind}`);
}

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function drainRequest(analysisRequestId: string) {
  const terminalStatuses = new Set(["COMPLETED", "PARTIAL", "INSUFFICIENT_DATA", "SOURCE_UNAVAILABLE", "CANCELLED"]);
  for (let step = 0; step < 100; step += 1) {
    const job = await prisma.job.findFirst({ where: { analysisRequestId, status: "PENDING", runAt: { lte: new Date() } }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
    if (!job) {
      const request = await prisma.workerAnalysisRequest.findUniqueOrThrow({ where: { id: analysisRequestId }, select: { status: true } });
      if (terminalStatuses.has(request.status)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    const claimed = await prisma.job.updateMany({ where: { id: job.id, status: "PENDING" }, data: { status: "RUNNING", lockedBy: "integration-test", lockedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000), attemptCount: { increment: 1 } } });
    if (!claimed.count) continue;
    await handleJob({ ...job, status: "RUNNING", lockedBy: "integration-test", attemptCount: job.attemptCount + 1 }, environment);
    await prisma.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", completedAt: new Date(), lockedBy: null, lockedAt: null, leaseExpiresAt: null } });
  }
  throw new Error(`Worker pipeline did not settle for ${analysisRequestId}`);
}

async function waitForEmailDelivery(analysisRequestId: string) {
  for (let step = 0; step < 100; step += 1) {
    const delivery = await prisma.emailDelivery.findFirst({ where: { analysisRequestId }, orderBy: { createdAt: "desc" } });
    if (delivery?.status === "SENT") return;
    if (delivery?.status === "FAILED") throw new Error(`Email delivery failed for ${analysisRequestId}: ${delivery.lastError ?? "unknown error"}`);

    // A concurrently running local worker may claim this test-created email
    // with a different encryption key and return it to PENDING with backoff.
    // Reclaim that retry immediately with the test environment so integration
    // verification is deterministic without requiring local services to stop.
    const job = await prisma.job.findFirst({
      where: { analysisRequestId, type: "EMAIL_DELIVERY", status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (job) {
      const claimed = await prisma.job.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: { status: "RUNNING", lockedBy: "integration-test", lockedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000), attemptCount: { increment: 1 } },
      });
      if (claimed.count) {
        await handleJob({ ...job, status: "RUNNING", lockedBy: "integration-test", attemptCount: job.attemptCount + 1 }, environment);
        await prisma.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", completedAt: new Date(), lockedBy: null, lockedAt: null, leaseExpiresAt: null } });
        continue;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Email delivery did not settle for ${analysisRequestId}`);
}
