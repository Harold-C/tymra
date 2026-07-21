import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { getEnvironment } from "@tymra/config";
import { prisma, Prisma } from "@tymra/db";
import { AdapterError, type PublicDataAdapter } from "@tymra/providers";
import { afterAll, describe, expect, it } from "vitest";

import { handleJob } from "../src/job-handlers";
import { normaliseEventfindaDetail, type EventfindaDetailExtraction } from "../src/eventfinda";
import { WorkerService } from "../src/worker-service";

const environment = getEnvironment();
const service = new WorkerService(environment);
const prefix = `worker-integration:${randomUUID()}`;
const ipSeed = prefix.replace(/[^0-9a-f]/gi, "").padEnd(16, "0").slice(-16);
const testIp = (offset: number) => `2001:db8:${ipSeed.slice(0, 4)}:${ipSeed.slice(4, 8)}:${ipSeed.slice(8, 12)}:${ipSeed.slice(12, 16)}:${offset.toString(16)}:1`;

describe("Worker baseline pipeline", () => {
  afterAll(async () => prisma.$disconnect());

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

  it("returns NEEDS_CONFIRMATION when an address resolves to multiple hotel units", async () => {
    const request = await service.createPreview({ input: `88 ${prefix.slice(-8)} Fixture Hotel Road, Christchurch 8011`, idempotencyKey: `${prefix}:address-multiple`, locale: "en", deviceId: `${prefix}:address-multiple-device`, ipAddress: testIp(22) });
    expect(request).toMatchObject({ inputType: "ADDRESS", status: "NEEDS_CONFIRMATION" });
    expect(request?.confirmationCandidates).toHaveLength(2);
    await service.cancelAnalysis(request!.id);
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
    const startsAt = new Date(`${checkIn}T00:00:00.000Z`);
    await prisma.marketSignal.create({ data: { id: signalId, marketKey: "christchurch", type: "MAJOR_EVENT", region: "Christchurch", startsAt, endsAt: new Date(startsAt.getTime() + 86_400_000), status: "CONFIRMED", evidence: { regression: true }, isDemo: true } });
    try {
      await drainRequest(request!.id);
      const result = await service.getResult(request!.id);
      expect(result?.resultVersions[0]).toMatchObject({ status: "PUBLISHED", outcome: "PUBLISHED", isDemo: true });
      expect(result?.marketSnapshots[0].dateSnapshots).toHaveLength(30);
      expect(result?.priceAnalyses[0].eventImpact).not.toBeNull();
      expect(result?.priceAnalyses[0].eventEvidence).toMatchObject({ causalClaim: false, policyVersion: "event-impact-v1" });
      expect(result?.marketSnapshots[0].dateSnapshots.some((snapshot) => Object.keys(snapshot.eventEvidence as object).length > 0)).toBe(true);
      expect(result?.priceAnalyses[0].demandPressure).toBeGreaterThan(0);
      await waitForEmailDelivery(request!.id);
      const deliveries = await prisma.emailDelivery.findMany({ where: { analysisRequestId: request!.id } });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toMatchObject({ type: "RESULT_READY", status: "SENT" });
      const signalRuns = await prisma.collectionRun.findMany({ where: { analysisRequestId: request!.id }, include: { dataSource: true } });
      expect(signalRuns.some((run) => run.dataSource.key === "public_holidays_nz" && run.status === "SUCCEEDED")).toBe(true);
      expect(signalRuns.some((run) => run.dataSource.key === "eventfinda" && run.status === "FAILED" && run.errorCode === "RIGHTS_BLOCKED")).toBe(true);
    } finally {
      await prisma.marketSignal.deleteMany({ where: { id: signalId } });
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

  it("returns INSUFFICIENT_DATA and publishes no result when fewer than three unique competitors exist", async () => {
    const request = await service.createFormalAnalysis({ input: `https://www.booking.com/hotel/nz/fixture-insufficient-${prefix.slice(-8)}.html`, email: `insufficient-${prefix.slice(-8)}@tymra.test`, serviceConsent: true, idempotencyKey: `${prefix}:insufficient`, locale: "en", deviceId: `${prefix}:insufficient-device`, ipAddress: testIp(25) });
    await drainRequest(request!.id);
    expect((await service.getAnalysis(request!.id))?.status).toBe("INSUFFICIENT_DATA");
    expect(await prisma.resultVersion.count({ where: { analysisRequestId: request!.id } })).toBe(0);
    expect(await prisma.emailDelivery.count({ where: { analysisRequestId: request!.id } })).toBe(0);
  });

  it("blocks a formal result when target mandatory fee completeness is unknown", async () => {
    const request = await service.createFormalAnalysis({ input: `https://www.booking.com/hotel/nz/fixture-fees-unknown-${prefix.slice(-8)}.html`, email: `fees-${prefix.slice(-8)}@tymra.test`, serviceConsent: true, idempotencyKey: `${prefix}:fees-unknown`, locale: "en", deviceId: `${prefix}:fees-device`, ipAddress: testIp(26) });
    await drainRequest(request!.id);
    expect((await service.getAnalysis(request!.id))?.status).toBe("INSUFFICIENT_DATA");
    expect(await prisma.dateSnapshot.count({ where: { analysisRequestId: request!.id, qualityFlags: { array_contains: "FEES_UNKNOWN" } } })).toBeGreaterThan(0);
    expect(await prisma.resultVersion.count({ where: { analysisRequestId: request!.id } })).toBe(0);
  });

  it("returns SOURCE_UNAVAILABLE without publishing when the approved rate source is suspended", async () => {
    const request = await service.createFormalAnalysis({ input: `https://www.booking.com/hotel/nz/source-suspended-${prefix.slice(-8)}.html`, email: `suspended-${prefix.slice(-8)}@tymra.test`, serviceConsent: true, idempotencyKey: `${prefix}:source-suspended`, locale: "en", deviceId: `${prefix}:source-suspended-device`, ipAddress: testIp(28) });
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "development-demo" } });
    try {
      await prisma.dataSource.update({ where: { id: source.id }, data: { internalApprovalStatus: "SUSPENDED", legalRightsStatus: "BLOCKED", operationalStatus: "BLOCKED" } });
      await drainRequest(request!.id);
      expect(await service.getAnalysis(request!.id)).toMatchObject({ status: "SOURCE_UNAVAILABLE", failureCode: "SOURCE_UNAVAILABLE" });
      expect(await prisma.resultVersion.count({ where: { analysisRequestId: request!.id } })).toBe(0);
      expect(await prisma.emailDelivery.count({ where: { analysisRequestId: request!.id } })).toBe(0);
    } finally {
      await prisma.dataSource.update({ where: { id: source.id }, data: { internalApprovalStatus: source.internalApprovalStatus, legalRightsStatus: source.legalRightsStatus, operationalStatus: source.operationalStatus, enabled: source.enabled, lifecycle: source.lifecycle } });
    }
  });

  it("never falls back to fixture collection in production mode", async () => {
    const liveService = new WorkerService({ ...environment, NODE_ENV: "production", PROVIDER_MODE: "live", FIXTURE_COLLECTION_ENABLED: false });
    await expect(liveService.createPreview({ input: `https://www.booking.com/hotel/nz/production-no-fallback-${prefix.slice(-8)}.html`, idempotencyKey: `${prefix}:production-no-fallback`, locale: "en", deviceId: `${prefix}:production-device`, ipAddress: testIp(27) })).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("restricts Eventfinda local acceptance to development with the scheduler disabled", async () => {
    for (const NODE_ENV of ["test", "production"] as const) {
      const guardedService = new WorkerService({ ...environment, NODE_ENV, SCHEDULER_ENABLED: false });
      await expect(guardedService.collectSource("eventfinda", "new-zealand", undefined, { phase: "discovery", localAcceptance: true }))
        .rejects.toMatchObject({ code: "RIGHTS_BLOCKED", message: "Local Eventfinda acceptance is restricted to the development environment" });
    }

    const scheduledService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: true });
    await expect(scheduledService.collectSource("eventfinda", "new-zealand", undefined, { phase: "discovery", localAcceptance: true }))
      .rejects.toMatchObject({ code: "RIGHTS_BLOCKED", message: "Disable the scheduler before local Eventfinda acceptance" });

    const productionBootstrap = new WorkerService({ ...environment, NODE_ENV: "production", SCHEDULER_ENABLED: false });
    await expect(productionBootstrap.collectSource("eventfinda", "new-zealand", undefined, { phase: "discovery", developmentBootstrap: true }))
      .rejects.toMatchObject({ code: "RIGHTS_BLOCKED", message: "Eventfinda development bootstrap is restricted to the development environment" });
    const scheduledBootstrap = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: true });
    await expect(scheduledBootstrap.collectSource("eventfinda", "new-zealand", undefined, { phase: "discovery", developmentBootstrap: true }))
      .rejects.toMatchObject({ code: "RIGHTS_BLOCKED", message: "Disable the scheduler before Eventfinda development bootstrap" });
    const developmentService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: false });
    await expect(developmentService.collectSource("eventfinda", "new-zealand", undefined, { phase: "discovery", localAcceptance: true, developmentBootstrap: true }))
      .rejects.toMatchObject({ code: "INVALID_COLLECTION_MODE" });
  });

  it("applies shared local-acceptance guards to public sources", async () => {
    for (const NODE_ENV of ["test", "production"] as const) {
      const guardedService = new WorkerService({ ...environment, NODE_ENV, SCHEDULER_ENABLED: false });
      await expect(guardedService.collectSource("geonet", "new-zealand", undefined, { localAcceptance: true }))
        .rejects.toMatchObject({ code: "RIGHTS_BLOCKED", message: "Local source acceptance is available only in development" });
    }
    const scheduledService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: true });
    await expect(scheduledService.collectSource("geonet", "new-zealand", undefined, { localAcceptance: true }))
      .rejects.toMatchObject({ code: "RIGHTS_BLOCKED", message: "Disable the scheduler before local source acceptance" });
  });

  it("persists generic source signals, canonical signals and lineage idempotently", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "geonet" } });
    const externalPrefix = `${prefix}:signal`;
    const adapter: PublicDataAdapter = {
      metadata: { sourceId: "geonet", sourceName: "GeoNet", sourceType: "PUBLIC_DATA", supportedDomains: ["api.geonet.org.nz"], adapterKey: "public:geonet:integration", accessMethod: "OFFICIAL_OPEN_API", concurrencyLimit: 1, dailyBudget: 10, collectorVersion: "test", parserVersion: "test" },
      async discover() { return ["https://api.geonet.org.nz/quake?MMI=3", "https://api.geonet.org.nz/quake?MMI=4"]; },
      async fetch() { return [0, 1, 2].map((index) => ({ sourceId: "geonet", externalId: `${externalPrefix}:${index}`, payload: { publicID: `${externalPrefix}:${index}`, token: "must-redact" }, fetchedAt: new Date(), fixture: false })); },
      async normalise(records) { return records.map((record, index) => ({ sourceId: "geonet", externalId: record.externalId, marketKey: "new-zealand", type: "WEATHER_OR_ACCESS_DISRUPTION", title: `Integration quake ${index}`, region: "New Zealand", startsAt: new Date("2026-08-01T00:00:00Z"), endsAt: new Date("2026-08-02T00:00:00Z"), direction: "UNKNOWN", confidence: 0.5, evidenceRef: `https://api.geonet.org.nz/quake/${index}`, metadata: { magnitude: 4.2, sequence: index }, fixture: false })); },
      async healthCheck() { return { status: "HEALTHY", checkedAt: new Date(), message: "fixture transport", latencyMs: 0, mode: "live" }; },
      rightsMetadata() { return { internalApprovalStatus: "APPROVED", legalRightsStatus: "ALLOWED", lifecycle: "PILOT", environments: ["DEVELOPMENT", "TEST"], allowedUsage: ["COLLECTION"], displayPermission: true, derivedAnalysisPermission: true, retentionPolicy: { rawHours: 72, parserFailureHours: 168, normalizedDays: null }, basis: "integration" }; },
    };
    const acceptanceService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: false }, { geonet: adapter });
    const runIds: string[] = [];
    let canonicalIds: string[] = [];
    try {
      const first = await acceptanceService.collectSource("geonet", "new-zealand", undefined, { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z"), limit: 999, localAcceptance: true });
      const second = await acceptanceService.collectSource("geonet", "new-zealand", undefined, { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z"), limit: 999, localAcceptance: true });
      runIds.push(first.runId, second.runId);
      expect(first).toMatchObject({ localAcceptance: true, references: 1, records: 2, signals: 2, counters: { requests: 1, discovered: 2, persisted: 2 } });
      const sourceSignals = await prisma.sourceMarketSignal.findMany({ where: { dataSourceId: source.id, externalId: { startsWith: externalPrefix } }, include: { canonicalLink: true } });
      expect(sourceSignals).toHaveLength(2);
      expect(sourceSignals.every((signal) => signal.lastCollectionRunId === second.runId && signal.canonicalLink !== null)).toBe(true);
      expect(sourceSignals[0].metadata).toMatchObject({ canonicalisationVersion: "source-isolated-signal-v1", signal: { magnitude: 4.2 } });
      canonicalIds = sourceSignals.flatMap((signal) => signal.canonicalLink ? [signal.canonicalLink.marketSignalId] : []);
      expect(await prisma.marketSignal.count({ where: { id: { in: canonicalIds } } })).toBe(2);
      expect(await prisma.marketSignalSourceLink.count({ where: { sourceMarketSignalId: { in: sourceSignals.map((signal) => signal.id) } } })).toBe(2);
      expect(await prisma.rawArtifact.count({ where: { collectionRunId: { in: runIds } } })).toBe(4);
      const run = await prisma.collectionRun.findUniqueOrThrow({ where: { id: second.runId } });
      expect(run.scope).toMatchObject({ localAcceptance: true, effective: { limit: 2 }, limits: { maxRequests: 1, maxRecords: 2, maxWindowDays: 31 }, governanceUnchanged: true, schedulesUnchanged: true });
      expect(await prisma.dataSource.findUnique({ where: { id: source.id } })).toMatchObject({ internalApprovalStatus: source.internalApprovalStatus, legalRightsStatus: source.legalRightsStatus, lifecycle: source.lifecycle, operationalStatus: source.operationalStatus, healthStatus: source.healthStatus });
    } finally {
      await prisma.sourceMarketSignal.deleteMany({ where: { dataSourceId: source.id, externalId: { startsWith: externalPrefix } } });
      await prisma.marketSignal.deleteMany({ where: { id: { in: canonicalIds } } });
      await prisma.rawArtifact.deleteMany({ where: { collectionRunId: { in: runIds } } });
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
      rightsMetadata() { return { internalApprovalStatus: "APPROVED", legalRightsStatus: "ALLOWED", lifecycle: "PILOT", environments: ["DEVELOPMENT", "TEST"], allowedUsage: ["COLLECTION"], displayPermission: true, derivedAnalysisPermission: true, retentionPolicy: { rawHours: 72, parserFailureHours: 168, normalizedDays: null }, basis: "integration" }; },
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

  it("idempotently persists bounded Ticketmaster browser events without changing governance", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "ticketmaster" } });
    const externalId = `tm-${prefix.replace(/[^a-z0-9]/gi, "").slice(-12)}`;
    const sourceUrl = `https://www.ticketmaster.co.nz/integration-auckland-16-08-2026/event/${externalId}`;
    let challenge = false;
    let eventStatus = "EventScheduled";
    const requestedUrls: string[] = [];
    const browserServer = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { traceId: string; extractor: string; url: string; profileKey: string };
      requestedUrls.push(body.url);
      expect(body.profileKey).toBe("ticketmaster-nz-public-v1");
      const artifact = (kind: string) => ({ kind, traceId: body.traceId, relativePath: `${body.traceId}/${kind}.json`, sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false });
      const listing = body.url.includes("/discover/");
      const common = { traceId: body.traceId, taskType: "read_only_capture", readonlyOnly: true, externalSideEffectsPerformed: false, evidence: [artifact("html"), artifact("manifest_json")], page: { title: listing ? "Auckland Events" : "Integration Stadium Event", finalUrl: body.url, htmlBytes: 100, screenshotBytes: 0 } };
      const payload = challenge
        ? { ...common, ok: false, status: "manual_required", extracted: null, manualRequired: { reason: "access_challenge_detected" } }
        : { ...common, ok: true, status: "success", extracted: { extractor: "ticketmaster", kind: listing ? "listing" : "event_detail", title: listing ? "Auckland Events" : "Integration Stadium Event", canonicalUrl: body.url, events: [{ eventId: externalId, title: "Integration Stadium Event", sourceUrl, description: listing ? undefined : "Full Ticketmaster detail metadata", category: "SportsEvent", startsAt: "2026-08-16T19:30:00", endsAt: "2026-08-16T22:30:00", eventStatus, venue: { name: "Integration Stadium", address: { streetAddress: "1 Test Street", addressLocality: "Auckland", addressRegion: "NZ", postalCode: "1010", addressCountry: "NZ" }, latitude: -36.8485, longitude: 174.7633 }, offers: [{ availability: "InStock", url: sourceUrl }], performers: listing ? [] : [{ name: "Integration Performer", type: "Person", url: sourceUrl }], imageUrls: listing ? [] : ["https://s1.ticketm.net/test.jpg"] }] } };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    });
    await new Promise<void>((resolve) => browserServer.listen(0, "127.0.0.1", resolve));
    const address = browserServer.address();
    if (!address || typeof address === "string") throw new Error("Ticketmaster browser server did not bind");
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const existingTicketmasterHtml = await prisma.rawArtifact.count({ where: { dataSourceId: source.id, artifactType: "HTML", createdAt: { gte: today } } });
    const acceptanceService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: false, BROWSER_WORKER_INTERNAL_URL: `http://127.0.0.1:${address.port}`, BROWSER_WORKER_TOKEN: "integration-browser-token-with-thirty-two-characters", TICKETMASTER_MIN_DELAY_MS: 0, TICKETMASTER_DELAY_JITTER_MS: 0, TICKETMASTER_DAILY_REQUEST_BUDGET: existingTicketmasterHtml + 20, TICKETMASTER_DISCOVERY_MAX_PAGES: 1, TICKETMASTER_DETAIL_BATCH_SIZE: 1, RAW_ARTIFACT_TTL_HOURS: 72, RAW_ARTIFACT_FAILURE_TTL_HOURS: 168 });
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
      expect(discovery).toMatchObject({ localAcceptance: true, references: 1, records: 0, events: 0, counters: { discovered: 1, targetsUpserted: 1, detailsFetched: 0 } });
      const target = await prisma.sourceCrawlTarget.findFirstOrThrow({ where: { dataSourceId: source.id, url: sourceUrl } });
      expect(target).toMatchObject({ active: true, status: "PENDING", consecutiveFailures: 0 });
      await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { priority: 0, nextFetchAt: new Date(0) } });

      const first = await acceptanceService.collectSource("ticketmaster", "new-zealand", undefined, { ...range, phase: "details", maxDetails: 1, localAcceptance: true });
      runIds.push(first.runId);
      await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { priority: 0, nextFetchAt: new Date(0), active: true } });
      const second = await acceptanceService.collectSource("ticketmaster", "new-zealand", undefined, { ...range, phase: "details", maxDetails: 1, localAcceptance: true });
      runIds.push(second.runId);
      expect(first).toMatchObject({ localAcceptance: true, records: 1, events: 1, signals: 0, dryRun: false });
      expect(second).toMatchObject({ localAcceptance: true, records: 1, events: 1, signals: 0, dryRun: false });
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
      expect(await prisma.sourceCrawlTarget.findUnique({ where: { id: target.id } })).toMatchObject({ active: true, status: "FETCHED", consecutiveFailures: 0, lastErrorCode: null });
      const successArtifacts = await prisma.rawArtifact.findMany({ where: { collectionRunId: second.runId } });
      expect(successArtifacts).toHaveLength(2);
      expect(successArtifacts.every((artifact) => !artifact.parserFailure && artifact.expiresAt.getTime() - artifact.createdAt.getTime() >= 71 * 3_600_000)).toBe(true);
      const secondRun = await prisma.collectionRun.findUniqueOrThrow({ where: { id: second.runId } });
      expect(secondRun.scope).toMatchObject({ localAcceptance: true, governanceUnchanged: true, schedulesUnchanged: true, limits: { maxRequests: 1, maxPages: 1, maxDetails: 1, maxRecords: 2, maxWindowDays: 31 } });
      expect(await prisma.dataSource.findUnique({ where: { id: source.id } })).toMatchObject({ internalApprovalStatus: source.internalApprovalStatus, legalRightsStatus: source.legalRightsStatus, lifecycle: source.lifecycle, operationalStatus: source.operationalStatus, healthStatus: source.healthStatus });
      await expect(acceptanceService.setTicketmasterSchedules(true)).rejects.toMatchObject({ code: "RIGHTS_BLOCKED" });
      expect(await acceptanceService.setTicketmasterSchedules(false)).toMatchObject([{ key: "ticketmaster-details-six-hour", enabled: false }, { key: "ticketmaster-discovery-daily", enabled: false }]);

      eventStatus = "EventCancelled";
      const cancelledDiscovery = await acceptanceService.collectSource("ticketmaster", "new-zealand", undefined, { ...range, phase: "discovery", maxPages: 1, maxDetails: 1, localAcceptance: true });
      runIds.push(cancelledDiscovery.runId);
      expect(cancelledDiscovery).toMatchObject({ references: 1, records: 0, events: 1, counters: { targetsUpserted: 1, detailsFetched: 0 } });
      expect(await prisma.sourceCrawlTarget.findUnique({ where: { id: target.id } })).toMatchObject({ active: false, status: "CANCELLED", nextFetchAt: null, consecutiveFailures: 0 });
      expect(await prisma.sourceEventOccurrence.findFirstOrThrow({ where: { dataSourceId: source.id, externalId } })).toMatchObject({ status: "CANCELLED", lastCollectionRunId: cancelledDiscovery.runId });

      challenge = true;
      await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { priority: 0, nextFetchAt: new Date(0), active: true } });
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
      await new Promise<void>((resolve, reject) => browserServer.close((error) => error ? reject(error) : resolve()));
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

  it("idempotently persists bounded RBNZ values and browser evidence", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "fx_rates" } });
    const browserServer = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { traceId: string; extractor: string };
      expect(body.extractor).toBe("rbnz_fx");
      const artifact = (kind: string) => ({ kind, traceId: body.traceId, relativePath: `${body.traceId}/${kind}.json`, sha256: "c".repeat(64), sizeBytes: 100, containsSensitiveData: false });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        status: "success",
        traceId: body.traceId,
        taskType: "read_only_capture",
        readonlyOnly: true,
        externalSideEffectsPerformed: false,
        evidence: [artifact("html"), artifact("manifest_json")],
        page: { title: "Exchange rates and TWI", finalUrl: "https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index", htmlBytes: 100, screenshotBytes: 0 },
        extracted: {
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
        },
      }));
    });
    await new Promise<void>((resolve) => browserServer.listen(0, "127.0.0.1", resolve));
    const address = browserServer.address();
    if (!address || typeof address === "string") throw new Error("RBNZ browser server did not bind");
    const acceptanceService = new WorkerService({ ...environment, NODE_ENV: "development", SCHEDULER_ENABLED: false, BROWSER_WORKER_INTERNAL_URL: `http://127.0.0.1:${address.port}`, BROWSER_WORKER_TOKEN: "integration-browser-token-with-thirty-two-characters" });
    const runIds: string[] = [];
    let canonicalIds: string[] = [];
    try {
      const first = await acceptanceService.collectSource("fx_rates", "new-zealand", undefined, { from: new Date("2026-07-20T00:00:00Z"), to: new Date("2026-09-20T00:00:00Z"), limit: 99, localAcceptance: true });
      const second = await acceptanceService.collectSource("fx_rates", "new-zealand", undefined, { from: new Date("2026-07-20T00:00:00Z"), to: new Date("2026-09-20T00:00:00Z"), limit: 99, localAcceptance: true });
      runIds.push(first.runId, second.runId);
      expect(first).toMatchObject({ localAcceptance: true, references: 1, records: 2, signals: 2, counters: { requests: 1, pages: 1, records: 2, signals: 2 } });
      const sourceSignals = await prisma.sourceMarketSignal.findMany({ where: { dataSourceId: source.id, externalId: { startsWith: "rbnz-b1:2026-07-20:" } }, include: { canonicalLink: true }, orderBy: { externalId: "asc" } });
      expect(sourceSignals).toHaveLength(2);
      expect(sourceSignals.every((signal) => signal.type === "FX_RATE" && signal.lastCollectionRunId === second.runId)).toBe(true);
      expect(sourceSignals[0].metadata).toMatchObject({ signal: { baseCurrency: "NZD", quoteConvention: "foreign_currency_units_per_NZD" } });
      canonicalIds = sourceSignals.flatMap((signal) => signal.canonicalLink ? [signal.canonicalLink.marketSignalId] : []);
      expect(await prisma.rawArtifact.count({ where: { collectionRunId: { in: runIds } } })).toBe(4);
      const secondRun = await prisma.collectionRun.findUniqueOrThrow({ where: { id: second.runId } });
      expect(secondRun.scope).toMatchObject({ localAcceptance: true, governanceUnchanged: true, schedulesUnchanged: true, effective: { limit: 2 }, limits: { maxRequests: 1, maxPages: 1, maxRecords: 2, maxWindowDays: 31 } });
    } finally {
      await new Promise<void>((resolve, reject) => browserServer.close((error) => error ? reject(error) : resolve()));
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
    try {
      for (let pass = 1; pass <= 2; pass += 1) {
        const run = await prisma.collectionRun.create({ data: { dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "RUNNING", scope: { sourceId: "eventfinda", regression: true, pass }, startedAt: new Date(), attemptCount: 1, isDemo: true } });
        runIds.push(run.id);
        for (const event of events) await service.persistNormalisedEvent(event, source.id, run.id);
        await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: events.length, finishedAt: new Date() } });
      }

      const sourceEvents = await prisma.sourceEvent.findMany({ where: { dataSourceId: source.id, externalId: eventId }, include: { canonicalLinks: true, occurrences: { include: { canonicalLinks: true } } } });
      expect(sourceEvents).toHaveLength(1);
      expect(sourceEvents[0].occurrences).toHaveLength(2);
      expect(sourceEvents[0].canonicalLinks).toHaveLength(1);
      expect(sourceEvents[0].occurrences.every((occurrence) => occurrence.lastCollectionRunId === runIds[1])).toBe(true);

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
      expect(unchangedSource).toMatchObject({ internalApprovalStatus: source.internalApprovalStatus, legalRightsStatus: source.legalRightsStatus, rightsAllowStorage: source.rightsAllowStorage, rightsAllowDerivedAnalysis: source.rightsAllowDerivedAnalysis });
    } finally {
      await prisma.sourceEvent.deleteMany({ where: { dataSourceId: source.id, externalId: eventId } });
      await prisma.eventOccurrence.deleteMany({ where: { id: { in: eventOccurrenceIds } } });
      await prisma.canonicalEvent.deleteMany({ where: { id: { in: canonicalEventIds } } });
      await prisma.canonicalVenue.deleteMany({ where: { id: { in: venueIds } } });
    }
  });

  it("persists a bounded Eventfinda discovery twice through the browser collection path", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "eventfinda" } });
    const suffix = prefix.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase();
    const eventId = `acceptance-${suffix}`;
    const sourceUrl = `https://www.eventfinda.co.nz/2026/acceptance-${suffix}/christchurch`;
    const unseenUrl = `https://www.eventfinda.co.nz/2026/unseen-${suffix}/wellington`;
    const protectedUrl = `https://www.eventfinda.co.nz/2026/nationwide-${suffix}/auckland`;
    let challenge = false;
    let listingTotalPages = 1;
    const browserServer = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { traceId: string; url: string };
      const artifact = (kind: string) => ({ kind, traceId: body.traceId, relativePath: `${body.traceId}/${kind}.json`, sha256: "a".repeat(64), sizeBytes: 100, containsSensitiveData: false });
      const common = { traceId: body.traceId, taskType: "read_only_capture", readonlyOnly: true, externalSideEffectsPerformed: false };
      let payload: Record<string, unknown>;
      if (challenge) {
        payload = { ...common, ok: false, status: "manual_required", page: { title: "Security check", finalUrl: body.url, htmlBytes: 100, screenshotBytes: 0 }, extracted: null, evidence: [artifact("html"), artifact("manifest_json")], manualRequired: { reason: "access_challenge_detected" } };
      } else if (body.url.includes("/whatson/events/new-zealand")) {
        payload = { ...common, ok: true, status: "success", page: { title: "Events", finalUrl: body.url, htmlBytes: 100, screenshotBytes: 0 }, evidence: [artifact("html"), artifact("manifest_json")], extracted: { extractor: "eventfinda", kind: "listing", title: "Events", canonicalUrl: body.url, currentPage: 1, totalPages: listingTotalPages, nextUrl: listingTotalPages > 1 ? `${body.url}/page/2` : null, events: [{ eventId, title: "Acceptance Theatre", sourceUrl, startsAt: "2026-08-16T18:00:00+12:00", venueName: "Acceptance Venue", location: "Acceptance Venue, Christchurch", category: "Theatre", imageUrl: null, sponsored: false, ticketAction: "Buy Tickets" }] } };
      } else {
        payload = { ...common, ok: true, status: "success", page: { title: "Acceptance Theatre", finalUrl: body.url, htmlBytes: 100, screenshotBytes: 0 }, evidence: [artifact("html"), artifact("manifest_json")], extracted: { extractor: "eventfinda", kind: "event_detail", eventId, title: "Acceptance Theatre", canonicalUrl: sourceUrl, category: "Theatre", description: "Bounded browser persistence acceptance.", imageUrls: [], venue: { name: "Acceptance Venue", address: { streetAddress: "1 Acceptance Street", addressLocality: "Christchurch", addressRegion: "Canterbury", postalCode: "8011", addressCountry: "New Zealand" }, latitude: -43.53, longitude: 172.63 }, offers: [{ name: "Adult", price: "20.00", priceCurrency: "NZD", availability: "InStock", url: `${sourceUrl}/tickets` }], performers: [], restrictions: null, phoneSales: null, websites: [], listedBy: [], tour: [], occurrences: [{ name: "Acceptance Theatre", description: null, sourceUrl, startDate: "2026-08-16T18:00:00+12:00", endDate: "2026-08-16T20:00:00+12:00", previousStartDate: null, eventStatus: "EventScheduled", attendanceMode: "OfflineEventAttendanceMode", imageUrls: [], location: null, offers: [], performers: [], organizer: null }] } };
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    });
    await new Promise<void>((resolve) => browserServer.listen(0, "127.0.0.1", resolve));
    const address = browserServer.address();
    if (!address || typeof address === "string") throw new Error("Acceptance browser server did not bind to a TCP port");
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const existingEventfindaHtml = await prisma.rawArtifact.count({
      where: { dataSourceId: source.id, artifactType: "HTML", createdAt: { gte: today } },
    });
    const acceptanceService = new WorkerService({
      ...environment,
      NODE_ENV: "development",
      SCHEDULER_ENABLED: false,
      BROWSER_WORKER_INTERNAL_URL: `http://127.0.0.1:${address.port}`,
      BROWSER_WORKER_TOKEN: "integration-browser-token-with-thirty-two-characters",
      EVENTFINDA_MIN_DELAY_MS: 0,
      EVENTFINDA_DELAY_JITTER_MS: 0,
      EVENTFINDA_DAILY_REQUEST_BUDGET: existingEventfindaHtml + 100,
      EVENTFINDA_DISCOVERY_MAX_PAGES: 1,
      EVENTFINDA_DETAIL_BATCH_SIZE: 1,
      RAW_ARTIFACT_TTL_HOURS: 72,
      RAW_ARTIFACT_FAILURE_TTL_HOURS: 168,
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
      expect(second).toMatchObject({ detailsFetched: 1, eventsPersisted: 1, failureCount: 0 });
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
      expect(successArtifacts).toHaveLength(2);
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
      expect(failureArtifacts).toHaveLength(2);
      expect(failureArtifacts.every((artifact) => artifact.parserFailure && artifact.expiresAt.getTime() - artifact.createdAt.getTime() >= 167 * 3_600_000)).toBe(true);
      expect(await prisma.sourceCrawlTarget.findUnique({ where: { id: target.id } })).toMatchObject({ status: "RATE_LIMITED", consecutiveFailures: 1 });
      expect(await prisma.dataSource.findUnique({ where: { id: source.id } })).toMatchObject({ internalApprovalStatus: source.internalApprovalStatus, legalRightsStatus: source.legalRightsStatus, operationalStatus: source.operationalStatus, healthStatus: source.healthStatus, rightsAllowStorage: source.rightsAllowStorage, rightsAllowDerivedAnalysis: source.rightsAllowDerivedAnalysis, metadata: { collectionCooldownReason: "RATE_LIMITED_OR_CHALLENGE" } });
    } finally {
      await new Promise<void>((resolve, reject) => browserServer.close((error) => error ? reject(error) : resolve()));
      const sourceEvents = await prisma.sourceEvent.findMany({ where: { dataSourceId: source.id, externalId: eventId }, include: { canonicalLinks: true, occurrences: { include: { canonicalLinks: true } } } });
      canonicalEventIds = [...new Set([...canonicalEventIds, ...sourceEvents.flatMap((item) => item.canonicalLinks.map((link) => link.canonicalEventId))])];
      eventOccurrenceIds = [...new Set([...eventOccurrenceIds, ...sourceEvents.flatMap((item) => item.occurrences.flatMap((occurrence) => occurrence.canonicalLinks.map((link) => link.eventOccurrenceId)))])];
      await prisma.sourceEvent.deleteMany({ where: { dataSourceId: source.id, externalId: eventId } });
      await prisma.sourceCrawlTarget.deleteMany({ where: { dataSourceId: source.id, url: { in: [sourceUrl, unseenUrl, protectedUrl] } } });
      await prisma.eventOccurrence.deleteMany({ where: { id: { in: eventOccurrenceIds } } });
      await prisma.canonicalEvent.deleteMany({ where: { id: { in: canonicalEventIds } } });
      await prisma.canonicalVenue.deleteMany({ where: { id: { in: venueIds } } });
      await prisma.rawArtifact.deleteMany({ where: { collectionRunId: { in: runIds } } });
      await prisma.dataSource.update({ where: { id: source.id }, data: { lifecycle: source.lifecycle, internalApprovalStatus: source.internalApprovalStatus, legalRightsStatus: source.legalRightsStatus, operationalStatus: source.operationalStatus, status: source.status, healthStatus: source.healthStatus, enabled: source.enabled, rightsAllowStorage: source.rightsAllowStorage, rightsAllowDerivedAnalysis: source.rightsAllowDerivedAnalysis, lastSuccessAt: source.lastSuccessAt, errorRate: source.errorRate, metadata: source.metadata as Prisma.InputJsonValue } });
    }
  });
});

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
