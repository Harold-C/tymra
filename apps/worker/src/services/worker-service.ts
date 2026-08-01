import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getEnvironment, type Environment } from "@tymra/config";
import {
  encryptPersonalData,
  enqueueJob,
  hashOpaqueToken,
  hashPersonalIdentifier,
  prisma,
  Prisma,
  syncCollectionIncident,
  type WorkerAnalysisRequest,
  type WorkerAnalysisStatus,
} from "@tymra/db";
import {
  buildFormalThirtyDayDates,
  buildNationalDateBasket,
  calculateAvailabilityCompression,
  calculatePriceDistribution,
  calculateTargetPercentile,
  collapseDuplicateListings,
  confidenceForDate,
  createQuerySignature,
  evaluateBlockingQualityGates,
  type ComparableRate,
  type QueryPlanDate,
} from "@tymra/domain";
import {
  AdapterError,
  getOtaAdapterForInput,
  otaAdapters,
  publicDataAdapters,
  type AdapterContext,
  type OtaAdapter,
  type PublicDataAdapter,
  type PublicEvent,
  type PublicRawRecord,
  type PublicSignal,
  type ResolvedOtaListing,
} from "@tymra/providers";
import { redisHealth, withRedisLock } from "@tymra/queue";
import {
  EVENTFINDA_ALLOWED_HOSTS,
  EVENTFINDA_EXTRACTOR,
  eventfindaEvidenceTtlHours,
  eventfindaFailureBackoff,
  groupEventfindaListingEvents,
  eventfindaListingPageUrl,
  eventfindaPaginationNeedsProbe,
  eventfindaRefreshPolicy,
  eventfindaRequestDelayMs,
  eventfindaUrlHash,
  normaliseEventfindaDetail,
  type EventfindaDetailExtraction,
  type EventfindaExtraction,
  type EventfindaListingEvent,
  type EventfindaListingExtraction,
} from "../collection/eventfinda";
import {
  canonicalEventKey,
  canonicalEventOccurrenceKey,
  canonicalVenueKey,
  eventDescription,
  sourceEventIdentity,
} from "../collection/event-canonicalisation";
import {
  canonicalTicketmasterUrl,
  groupTicketmasterListingEvents,
  isTicketmasterDetailExtraction,
  isTicketmasterDetailUrl,
  isTicketmasterExtraction,
  isTicketmasterListingExtraction,
  normaliseTicketmasterEvent,
  normaliseTicketmasterEvents,
  ticketmasterChallengeTransition,
  ticketmasterCircuitStatus,
  ticketmasterCircuitSuccessMetadata,
  ticketmasterFailureBackoff,
  ticketmasterListingCoverage,
  ticketmasterRefreshPolicy,
  ticketmasterRequestDelayMs,
  ticketmasterUrlHash,
  TICKETMASTER_ALLOWED_HOSTS,
  TICKETMASTER_EXTRACTOR,
  TICKETMASTER_LISTING_URLS,
  type TicketmasterListingEvent,
} from "../collection/ticketmaster";
import {
  isRbnzFxExtraction,
  normaliseRbnzFxSignals,
  RBNZ_FX_ALLOWED_HOSTS,
  RBNZ_FX_EXTRACTOR,
  RBNZ_FX_URL,
} from "../collection/rbnz-fx";
import { captureBrowserTaskWithArgus } from "../clients/argus-client";
import { DeferredJobError } from "../jobs/deferred-job";
import {
  captureBrowserTaskWithDurableArgus,
  durableArgusTraceId,
  settleCancelledCollectionRun,
} from "./argus-orchestrator";

type CreateWorkerRequest = {
  input: string;
  locale?: "en" | "zh";
  idempotencyKey: string;
  email?: string;
  serviceConsent?: boolean;
  marketingConsent?: boolean;
  deviceId?: string;
  ipAddress?: string;
};

type ConfirmWorkerRequest = {
  sellableUnitId: string;
};

type CollectSourceOptions = {
  jobId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  dryRun?: boolean;
  phase?: "discovery" | "details" | "full";
  maxPages?: number;
  maxDetails?: number;
  localAcceptance?: boolean;
  developmentBootstrap?: boolean;
};

type BrowserEvidencePointer = {
  kind: string;
  traceId: string;
  relativePath: string;
  storageRef?: string;
  sha256: string;
  sizeBytes: number;
  containsSensitiveData: boolean;
  createdAt: string;
};

type BrowserTaskResult = {
  ok: boolean;
  status: "success" | "manual_required" | "failed";
  traceId: string;
  taskType: "read_only_capture";
  page: { title: string; finalUrl: string; htmlBytes: number; screenshotBytes: number } | null;
  evidence: BrowserEvidencePointer[];
  error?: { category: string; message: string; retryable: boolean } | null;
  manualRequired?: { reason: string } | null;
  profilePersistence?: { attempted: boolean; saved: boolean; error?: string };
  readonlyOnly: true;
  externalSideEffectsPerformed: false;
  extracted?: unknown;
};

type ActivateSourceRequest = {
  approvedBy: string;
  licenseBasis: string;
  allowDisplay?: boolean;
};

type EventPersistenceCache = {
  series: Map<string, { sourceEventId: string; canonicalEventId: string }>;
  venues: Map<string, string>;
};

const fixtureSourceKey = "development-demo";
const collectionProfileKey = "worker-fixture:nz:en:nzd:desktop:anonymous:v1";

export class WorkerService {
  constructor(
    private readonly environment: Environment = getEnvironment(),
    private readonly publicAdapters: Record<string, PublicDataAdapter> = publicDataAdapters,
  ) {}

  async createPreview(input: CreateWorkerRequest) {
    return this.createRequest({ ...input, email: undefined, serviceConsent: false }, true);
  }

  async createFormalAnalysis(input: CreateWorkerRequest) {
    if (!input.email || !/^\S+@\S+\.\S+$/.test(input.email.trim().toLowerCase())) throw new WorkerRequestError("INVALID_EMAIL", "A valid email is required", 422);
    if (input.serviceConsent !== true) throw new WorkerRequestError("SERVICE_CONSENT_REQUIRED", "Service email consent is required", 422);
    return this.createRequest(input, false);
  }

  async confirmAnalysis(analysisRequestId: string, input: ConfirmWorkerRequest) {
    const request = await prisma.workerAnalysisRequest.findUniqueOrThrow({ where: { id: analysisRequestId } });
    if (request.status !== "NEEDS_CONFIRMATION") throw new WorkerRequestError("CONFIRMATION_NOT_REQUIRED", "This analysis is not waiting for confirmation", 409);
    const candidates = jsonStringArray(request.confirmationCandidates);
    if (!candidates.includes(input.sellableUnitId)) throw new WorkerRequestError("INVALID_UNIT", "The selected Sellable Unit is not an active candidate", 422);
    const listing = await prisma.listing.findFirstOrThrow({ where: { unitId: input.sellableUnitId, propertyId: request.propertyId! }, orderBy: { createdAt: "asc" } });
    const updated = await prisma.workerAnalysisRequest.update({
      where: { id: request.id },
      data: { sellableUnitId: input.sellableUnitId, targetListingId: listing.id, status: "QUEUED", confirmationCandidates: [] },
    });
    if (request.priceCheckId) {
      await prisma.priceCheck.update({ where: { id: request.priceCheckId }, data: { unitId: input.sellableUnitId, status: "QUEUED" } });
    }
    await this.ensureQueryPlan(updated);
    await this.enqueueCollection(updated);
    return this.getAnalysis(updated.id);
  }

  async getAnalysis(id: string) {
    return prisma.workerAnalysisRequest.findUnique({
      where: { id },
      include: {
        property: true,
        sellableUnit: true,
        targetListing: true,
        queryPlans: { orderBy: { version: "desc" }, take: 1 },
        collectionRuns: { orderBy: { createdAt: "desc" }, take: 10 },
        competitorSets: { orderBy: { version: "desc" }, take: 1, include: { members: true } },
        marketSnapshots: { orderBy: { asOf: "desc" }, take: 1 },
        priceAnalyses: { orderBy: { createdAt: "desc" }, take: 1 },
        resultVersions: { orderBy: { version: "desc" }, take: 1 },
        jobs: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async getResult(id: string) {
    const request = await prisma.workerAnalysisRequest.findUnique({
      where: { id },
      include: {
        property: true,
        sellableUnit: true,
        priceAnalyses: { orderBy: { createdAt: "desc" }, take: 1 },
        marketSnapshots: { orderBy: { asOf: "desc" }, take: 1, include: { dateSnapshots: { orderBy: { stayDate: "asc" } } } },
        resultVersions: { orderBy: { version: "desc" }, take: 1, include: { insights: { orderBy: { stayDate: "asc" }, take: 5 } } },
      },
    });
    if (!request) return null;
    if (!["COMPLETED", "PARTIAL", "INSUFFICIENT_DATA", "SOURCE_UNAVAILABLE"].includes(request.status)) {
      throw new WorkerRequestError("RESULT_NOT_READY", "The analysis result is not ready", 409);
    }
    return request;
  }

  async cancelAnalysis(id: string) {
    const request = await prisma.workerAnalysisRequest.findUniqueOrThrow({ where: { id } });
    if (["COMPLETED", "CANCELLED"].includes(request.status)) return request;
    await prisma.$transaction([
      prisma.workerAnalysisRequest.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } }),
      prisma.job.updateMany({ where: { analysisRequestId: id, status: { in: ["PENDING", "RUNNING"] } }, data: { status: "CANCELLED", completedAt: new Date(), lockedAt: null, lockedBy: null, leaseExpiresAt: null } }),
      ...(request.priceCheckId ? [prisma.priceCheck.update({ where: { id: request.priceCheckId }, data: { status: "CANCELLED" } })] : []),
    ]);
    return prisma.workerAnalysisRequest.findUniqueOrThrow({ where: { id } });
  }

  async resendLink(id: string) {
    const request = await prisma.workerAnalysisRequest.findUniqueOrThrow({ where: { id }, include: { resultVersions: { where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1 } } });
    const result = request.resultVersions[0];
    if (!result || !request.emailHash || !request.encryptedEmail) throw new WorkerRequestError("RESULT_NOT_READY", "No published result is available", 409);
    const key = `${request.id}:${request.emailHash}:link-reissued-v1:${result.version}`;
    const delivery = await prisma.emailDelivery.upsert({
      where: { idempotencyKey: key },
      create: { analysisRequestId: request.id, priceCheckId: request.priceCheckId, resultVersionId: result.id, type: "LINK_REISSUED", locale: request.locale, recipientHash: request.emailHash, encryptedRecipient: request.encryptedEmail, provider: "pending", idempotencyKey: key },
      update: {},
    });
    await enqueueJob({ type: "EMAIL_DELIVERY", payload: { deliveryId: delivery.id }, idempotencyKey: `${key}:job`, analysisRequestId: request.id, priceCheckId: request.priceCheckId ?? undefined, correlationId: request.correlationId });
    return delivery;
  }

  async collectAnalysis(analysisRequestId: string, jobId: string) {
    return withRedisLock(`analysis:${analysisRequestId}:collection`, 120_000, async () => {
      const request = await this.requireReadyIdentity(analysisRequestId);
      const plan = request.queryPlans[0] ?? await this.ensureQueryPlan(request);
      await this.setStatus(request, "CHECKING_CACHE");

      const cache = await prisma.queryCacheEntry.findUnique({ where: { querySignatureHash_collectionProfileKey: { querySignatureHash: plan.querySignatureHash, collectionProfileKey } } });
      if (cache && cache.validUntil > new Date() && jsonStringArray(cache.observationIds).length > 0) {
        await prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { cacheHitType: "EXACT_FRESH", status: "COLLECTING_COMPETITORS" } });
        await this.enqueueWorkerJob(request, "COMPETITOR_BUILD", { cacheObservationIds: cache.observationIds }, `${jobId}:competitors`);
        return;
      }

      if (!this.fixtureEnabled()) {
        await this.failBusiness(request, "SOURCE_UNAVAILABLE", "NO_APPROVED_LIVE_RATE_SOURCE", "No approved live OTA rate source is configured; production never falls back to fixture data");
        return;
      }

      await this.setStatus(request, "COLLECTING_TARGET");
      let fixtureSource;
      try {
        fixtureSource = await this.requireFixtureSource();
      } catch (error) {
        const code = error instanceof WorkerRequestError ? error.code : "SOURCE_UNAVAILABLE";
        const message = error instanceof Error ? error.message : "Approved development fixture source is unavailable";
        await this.failBusiness(request, "SOURCE_UNAVAILABLE", code, message);
        return;
      }
      const profile = await this.ensureCollectionProfile(request, fixtureSource.id);
      const run = await prisma.collectionRun.create({
        data: { jobId, analysisRequestId: request.id, dataSourceId: fixtureSource.id, collectionProfileId: profile.id, mode: "ON_DEMAND", status: "RUNNING", scope: { targetListingId: request.targetListingId, dateBasket: plan.dateBasket, mode: "APPROVED_DEVELOPMENT_FIXTURE" }, startedAt: new Date(), attemptCount: 1, correlationId: request.correlationId, isDemo: true },
      });
      const competitors = await this.ensureFixtureCompetitors(request.sellableUnitId!, fixtureCompetitorCount(request.rawInput));
      const listingIds = [request.targetListingId!, ...competitors.map((item) => item.listing.id)];
      const listings = await prisma.listing.findMany({ where: { id: { in: listingIds } }, include: { unit: true } });
      const dates = plan.dateBasket as unknown as QueryPlanDate[];
      const observationIds: string[] = [];
      const collectedAt = new Date();

      for (const [dateIndex, plannedDate] of dates.entries()) {
        const stayQuery = await this.ensureStayQueryForDate(plannedDate.checkIn, request.id);
        for (const [listingIndex, listing] of listings.entries()) {
          const isTarget = listing.id === request.targetListingId;
          const price = fixturePriceMinor(listing.sourceListingId, plannedDate.checkIn, isTarget);
          const total = price + 1_500 + Math.round((price + 1_500) * 0.15);
          const idempotencyKey = `worker:${request.id}:${plannedDate.checkIn}:${listing.id}:${profile.id}`;
          const observation = await prisma.rateObservation.upsert({
            where: { idempotencyKey },
            create: {
              propertyId: listing.propertyId,
              sellableUnitId: listing.unitId,
              listingId: listing.id,
              sourceListingId: listing.sourceListingId,
              stayQueryId: stayQuery.id,
              collectionProfileId: profile.id,
              dataSourceId: fixtureSource.id,
              collectionRunId: run.id,
              requestedAt: collectedAt,
              collectedAt: new Date(collectedAt.getTime() + (dateIndex * listings.length + listingIndex) * 10),
              observedAt: collectedAt,
              sourceUpdatedAt: null,
              checkIn: stayQuery.checkIn,
              checkOut: stayQuery.checkOut,
              nights: 1,
              adults: 2,
              childrenAges: [],
              units: 1,
              localTimezone: "Pacific/Auckland",
              roomTypeRaw: listing.platformUnitName,
              roomTypeNormalized: listing.unit.canonicalName,
              unitConstraints: {},
              occupancyCapacity: listing.unit.capacity,
              bedType: firstString(listing.unit.bedTypes),
              unitAttributesVersion: listing.unit.version,
              currency: "NZD",
              baseAmountMinor: price,
              mandatoryFeesMinor: 1_500,
              taxesMinor: Math.round((price + 1_500) * 0.15),
              platformFeesMinor: 0,
              optionalFeesMinor: 0,
              totalAmountMinor: total,
              exchangeRate: 1,
              nzdTotalMinor: total,
              effectiveNightlyTotalMinor: total,
              mealPlan: "ROOM_ONLY",
              cancellationCategory: "STANDARD",
              cancellationPolicy: "FLEXIBLE_PUBLIC",
              paymentTerms: "PAY_AT_PROPERTY",
              rateFence: "PUBLIC_ANONYMOUS",
              availabilityStatus: "AVAILABLE",
              restrictionReason: null,
              feeCompleteness: isTarget && fixtureFeesUnknown(request.rawInput) ? "UNKNOWN" : "COMPLETE",
              sourceUrl: listing.canonicalUrl,
              evidenceRef: `fixture://${request.id}/${plannedDate.checkIn}/${listing.sourceListingId}`,
              collectorVersion: "worker-fixture-collector-v1",
              parserVersion: "worker-fixture-parser-v1",
              qualityFlags: ["FIXTURE_RECORD_REPLAY", "NOT_REAL_MARKET_DATA"],
              legalRightsStatus: "ALLOWED",
              operationalStatus: "HEALTHY",
              rawDataStored: false,
              idempotencyKey,
              isDemo: true,
            },
            update: {},
          });
          observationIds.push(observation.id);
        }
      }

      await prisma.$transaction([
        prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: observationIds.length, failureCount: 0, finishedAt: new Date() } }),
        prisma.queryCacheEntry.upsert({ where: { querySignatureHash_collectionProfileKey: { querySignatureHash: plan.querySignatureHash, collectionProfileKey } }, create: { querySignatureHash: plan.querySignatureHash, collectionProfileKey, hitType: "EXACT_FRESH", observationIds, validUntil: new Date(Date.now() + this.environment.FRESHNESS_CORE_HOURS * 3_600_000) }, update: { hitType: "EXACT_FRESH", observationIds, negativeReason: null, validUntil: new Date(Date.now() + this.environment.FRESHNESS_CORE_HOURS * 3_600_000) } }),
        prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { cacheHitType: "MISS", status: "COLLECTING_COMPETITORS" } }),
      ]);
      await this.enqueueWorkerJob(request, "COMPETITOR_BUILD", { observationIds }, `${jobId}:competitors`);
    }, this.environment.REDIS_URL);
  }

  async buildCompetitorSet(analysisRequestId: string, jobId: string) {
    const request = await this.requireReadyIdentity(analysisRequestId);
    const competitors = await this.ensureFixtureCompetitors(request.sellableUnitId!, fixtureCompetitorCount(request.rawInput));
    const existing = await prisma.competitorSetVersion.findUnique({ where: { analysisRequestId_version: { analysisRequestId, version: 1 } } });
    const set = existing ?? await prisma.competitorSetVersion.create({
      data: {
        analysisRequestId,
        targetSellableUnitId: request.sellableUnitId!,
        version: 1,
        algorithmVersion: "deterministic-comparability-v1",
        marketScope: { market: "christchurch", expansionLevel: 0 },
        expansionLevel: 0,
        createdBy: "SYSTEM",
        members: { create: competitors.map((item, index) => ({ competitorSellableUnitId: item.unit.id, relationshipType: "CORE", comparabilityScore: 0.95 - index * 0.02, geographyScore: 0.95, propertyTypeScore: 1, unitScore: 1, qualityScore: 0.9, priceTierScore: 0.9, inclusionReason: "Same fixture micro-market and unit profile", createdBy: "SYSTEM", algorithmVersion: "deterministic-comparability-v1" })) },
      },
    });
    await prisma.workerAnalysisRequest.update({ where: { id: analysisRequestId }, data: { status: "COLLECTING_MARKET_SIGNALS" } });
    await this.collectPublicSignals(request);
    await this.setStatus(request, "NORMALISING");
    await this.enqueueWorkerJob(request, "SNAPSHOT_GENERATION", { competitorSetVersionId: set.id }, `${jobId}:snapshot`);
  }

  async buildSnapshots(analysisRequestId: string, jobId: string) {
    const request = await this.requireReadyIdentity(analysisRequestId);
    const targetUnit = await prisma.sellableUnit.findUniqueOrThrow({ where: { id: request.sellableUnitId! } });
    await this.setStatus(request, "VALIDATING");
    const plan = request.queryPlans[0] ?? await this.ensureQueryPlan(request);
    const competitorSet = await prisma.competitorSetVersion.findFirstOrThrow({ where: { analysisRequestId }, orderBy: { version: "desc" }, include: { members: true } });
    const observationIds = await this.analysisObservationIds(request, plan.querySignatureHash);
    const observations = await prisma.rateObservation.findMany({ where: { id: { in: observationIds } }, orderBy: { collectedAt: "asc" } });
    const dates = [...new Set(observations.map((item) => item.checkIn.toISOString().slice(0, 10)))].sort();
    const dateSnapshotIds: string[] = [];
    const allFlags = new Set<string>();

    for (const date of dates) {
      const items = observations.filter((item) => item.checkIn.toISOString().slice(0, 10) === date);
      const stayDate = new Date(`${date}T00:00:00.000Z`);
      const nextDate = new Date(stayDate.getTime() + 86_400_000);
      const marketSignals = await prisma.marketSignal.findMany({ where: { marketKey: "christchurch", startsAt: { lt: nextDate }, endsAt: { gt: stayDate }, status: "CONFIRMED" }, select: { id: true, type: true, region: true, evidence: true } });
      const eventImpactScore = marketSignals.length ? Math.min(1, marketSignals.length / 3) : null;
      const eventEvidence = marketSignals.length ? {
        signalIds: marketSignals.map((signal) => signal.id),
        signalTypes: [...new Set(marketSignals.map((signal) => signal.type))],
        regions: [...new Set(marketSignals.map((signal) => signal.region))],
        signalCount: marketSignals.length,
        weekday: stayDate.toLocaleDateString("en-NZ", { weekday: "long", timeZone: "UTC" }),
        bookingHorizonDays: Math.max(0, Math.round((stayDate.getTime() - Date.now()) / 86_400_000)),
        accommodationType: targetUnit.unitType,
        policyVersion: "event-impact-v1",
        causalClaim: false,
      } : {};
      const target = items.find((item) => item.sellableUnitId === request.sellableUnitId);
      const memberScores = new Map(competitorSet.members.map((member) => [member.competitorSellableUnitId, member.comparabilityScore]));
      const comparableRates: ComparableRate[] = items.filter((item) => memberScores.has(item.sellableUnitId)).map((item) => ({ sellableUnitId: item.sellableUnitId, listingId: item.listingId, amountMinor: item.effectiveNightlyTotalMinor, availabilityStatus: item.availabilityStatus, comparabilityScore: memberScores.get(item.sellableUnitId) ?? 0, collectedAt: item.collectedAt, feeComplete: item.feeCompleteness === "COMPLETE" }));
      const unique = collapseDuplicateListings(comparableRates);
      const distribution = calculatePriceDistribution(unique);
      const compression = calculateAvailabilityCompression(unique);
      const newest = maxDate(items.map((item) => item.collectedAt));
      const oldest = minDate(items.map((item) => item.collectedAt));
      const maxSkewMinutes = newest && oldest ? Math.round((newest.getTime() - oldest.getTime()) / 60_000) : null;
      const ageHours = newest ? Math.max(0, (Date.now() - newest.getTime()) / 3_600_000) : null;
      const horizonDays = Math.max(0, Math.round((new Date(`${date}T00:00:00.000Z`).getTime() - Date.now()) / 86_400_000));
      const flags = evaluateBlockingQualityGates({ targetRatePresent: Boolean(target), unitConfirmed: Boolean(request.sellableUnitId), feesKnown: target?.feeCompleteness === "COMPLETE", comparable: unique.length >= 3, sourceRightsAllowed: items.every((item) => item.legalRightsStatus === "ALLOWED"), sourceAvailable: items.every((item) => item.operationalStatus === "HEALTHY"), severeConflict: false, freshnessExpired: ageHours === null || ageHours > this.environment.FRESHNESS_CORE_HOURS, snapshotCoherent: maxSkewMinutes !== null && maxSkewMinutes <= (horizonDays <= 7 ? this.environment.FRESHNESS_NEAR_TERM_SKEW_HOURS * 60 : this.environment.FRESHNESS_LONG_TERM_SKEW_HOURS * 60), competitorCount: distribution.count });
      flags.forEach((flag) => allFlags.add(flag));
      const confidence = confidenceForDate({ competitorCount: distribution.count, freshnessHours: ageHours, feeComplete: target?.feeCompleteness === "COMPLETE", maxSkewMinutes, horizonDays, blockingFlags: flags });
      const snapshot = await prisma.dateSnapshot.upsert({
        where: { analysisRequestId_stayDate_snapshotVersion: { analysisRequestId, stayDate, snapshotVersion: "date-snapshot-v1" } },
        create: { analysisRequestId, stayDate, targetRateMinor: target?.effectiveNightlyTotalMinor, validCompetitorCount: distribution.count, availableCount: compression.available, restrictedCount: compression.restricted, unavailableCount: compression.unavailable, dataMissingCount: compression.dataMissing, sourceFailureCount: compression.sourceFailure, marketMedianMinor: distribution.weightedMedianMinor, lowerQuartileMinor: distribution.lowerQuartileMinor, upperQuartileMinor: distribution.upperQuartileMinor, availabilityCompression: compression.compression, eventImpact: eventImpactScore, eventEvidence, disruptionImpact: { accessibilityEffect: "UNKNOWN", demandDisplacementEffect: "UNKNOWN", strandedTravellerEffect: "UNKNOWN", direction: "UNKNOWN", confidence: 0 }, newestObservationAt: newest, oldestObservationAt: oldest, maxObservationSkewMinutes: maxSkewMinutes, freshness: { ageHours, policyVersion: "freshness-v1" }, qualityGateResult: flags.length ? "BLOCKED" : confidence.level === "HIGH" ? "PASSED" : "PASSED_WITH_LIMITATIONS", qualityFlags: flags, confidenceScore: confidence.score, confidenceLevel: confidence.level, observationIds: items.map((item) => item.id), snapshotVersion: "date-snapshot-v1" },
        update: {},
      });
      dateSnapshotIds.push(snapshot.id);
    }

    await this.setStatus(request, "BUILDING_SNAPSHOT");
    const newest = maxDate(observations.map((item) => item.collectedAt));
    const oldest = minDate(observations.map((item) => item.collectedAt));
    const contentHash = stableHash({ analysisRequestId, observationIds: [...observationIds].sort(), dateSnapshotIds: [...dateSnapshotIds].sort(), competitorSetVersionId: competitorSet.id, queryPlanId: plan.id });
    const marketSnapshot = await prisma.marketSnapshot.upsert({
      where: { contentHash },
      create: { analysisRequestId, priceCheckId: request.priceCheckId, targetPropertyId: request.propertyId!, targetSellableUnitId: request.sellableUnitId!, targetListingId: request.targetListingId!, queryPlanId: plan.id, queryPlanVersion: plan.version, competitorSetVersionId: competitorSet.id, asOf: new Date(), marketScope: { market: "christchurch", country: "NZ" }, observationIds, sourceRegistryVersions: [{ sourceId: fixtureSourceKey, version: "seed-v1" }], collectionProfileVersions: [{ key: collectionProfileKey, version: 1 }], newestObservationAt: newest, oldestObservationAt: oldest, maxObservationSkewMinutes: newest && oldest ? Math.round((newest.getTime() - oldest.getTime()) / 60_000) : null, sourceCoverage: observations.length > 0 ? 1 : 0, competitorCoverage: competitorSet.members.length / 8, missingRate: dates.length ? dates.filter((date) => !observations.some((item) => item.checkIn.toISOString().startsWith(date))).length / dates.length : 1, conflicts: [], exclusionReasons: [], qualityGateResult: allFlags.size ? "BLOCKED" : "PASSED", qualityFlags: [...allFlags], snapshotVersion: "market-snapshot-v1", generationPolicyVersion: "snapshot-generation-v1", freshnessPolicyVersion: "freshness-v1", qualityGateVersion: "blocking-gates-v1", contentHash, status: allFlags.size ? "BLOCKED" : "READY" },
      update: {},
    });
    await prisma.dateSnapshot.updateMany({ where: { id: { in: dateSnapshotIds }, marketSnapshotId: null }, data: { marketSnapshotId: marketSnapshot.id } });
    await this.enqueueWorkerJob(request, "PRICE_ANALYSIS", { marketSnapshotId: marketSnapshot.id }, `${jobId}:price-analysis`);
  }

  async analyseSnapshot(analysisRequestId: string, jobId: string) {
    const request = await this.requireReadyIdentity(analysisRequestId);
    await this.setStatus(request, "ANALYSING");
    const snapshot = await prisma.marketSnapshot.findFirstOrThrow({ where: { analysisRequestId }, orderBy: { asOf: "desc" }, include: { dateSnapshots: { orderBy: { stayDate: "asc" } } } });
    const usable = snapshot.dateSnapshots.filter((date) => date.qualityGateResult !== "BLOCKED" && date.marketMedianMinor !== null && date.targetRateMinor !== null);
    if (usable.length === 0) {
      await this.failBusiness(request, "INSUFFICIENT_DATA", "BLOCKING_QUALITY_GATES", "No date passed the blocking quality gates");
      return;
    }
    const ranked = usable.map((date) => ({ id: date.id, date: date.stayDate.toISOString().slice(0, 10), target: date.targetRateMinor!, median: date.marketMedianMinor!, gap: date.marketMedianMinor! - date.targetRateMinor!, confidence: date.confidenceLevel })).sort((left, right) => right.gap - left.gap);
    const keyDates = ranked.slice(0, request.isPreview ? 2 : 5);
    const medians = usable.map((date) => date.marketMedianMinor!).sort((a, b) => a - b);
    const targetPrices = usable.map((date) => date.targetRateMinor!).sort((a, b) => a - b);
    const marketMedian = medians[Math.floor(medians.length / 2)];
    const targetMedian = targetPrices[Math.floor(targetPrices.length / 2)];
    const percentileRates: ComparableRate[] = medians.map((amount, index) => ({ sellableUnitId: `aggregate-${index}`, listingId: `aggregate-${index}`, amountMinor: amount, availabilityStatus: "AVAILABLE", comparabilityScore: 1, collectedAt: snapshot.asOf, feeComplete: true }));
    const percentile = calculateTargetPercentile(targetMedian, percentileRates);
    const confidenceScore = usable.reduce((sum, date) => sum + date.confidenceScore, 0) / usable.length;
    const confidence = usable.every((date) => date.confidenceLevel === "HIGH") ? "HIGH" : usable.some((date) => date.confidenceLevel === "LOW") ? "LOW" : "MEDIUM";
    const position = targetMedian < marketMedian * 0.9 ? "BELOW_MARKET" : targetMedian > marketMedian * 1.1 ? "ABOVE_MARKET" : "NEAR_MARKET";
    const eventDates = usable.filter((date) => date.eventImpact !== null);
    const eventImpactScore = eventDates.length ? average(eventDates.map((date) => date.eventImpact!)) : null;
    const eventEvidence = eventDates.length ? {
      affectedDateCount: eventDates.length,
      affectedDates: eventDates.map((date) => date.stayDate.toISOString().slice(0, 10)),
      dateSnapshotIds: eventDates.map((date) => date.id),
      policyVersion: "event-impact-v1",
      causalClaim: false,
    } : {};
    const analysis = await prisma.priceAnalysis.create({
      data: { analysisRequestId, marketSnapshotId: snapshot.id, marketMedianMinor: marketMedian, weightedRange: { low: Math.min(...medians), high: Math.max(...medians) }, percentile, comparableCount: Math.min(...usable.map((date) => date.validCompetitorCount)), marketRateIndex: marketMedian / 100, availabilityCompression: average(usable.map((date) => date.availabilityCompression).filter((value): value is number => value !== null)), demandPressure: eventDates.length / usable.length, eventImpact: eventImpactScore, eventEvidence, accessibilityEffect: "UNKNOWN", demandDisplacementEffect: "UNKNOWN", strandedTravellerEffect: "UNKNOWN", disruptionDirection: "UNKNOWN", marketReferenceRange: { low: Math.min(...medians), high: Math.max(...medians) }, reviewRange: { low: Math.round(marketMedian * 0.9), high: Math.round(marketMedian * 1.1) }, targetPricePosition: position, keyDates, reasonCodes: position === "BELOW_MARKET" ? ["BELOW_COMPARABLE_RANGE"] : [], recommendedAction: position === "BELOW_MARKET" ? "REVIEW_RATE_UPWARD" : "MONITOR_DATE", confidenceScore, confidenceComponents: { datesPassing: usable.length, datesPlanned: snapshot.dateSnapshots.length, fixture: request.isFixture, eventDates: eventDates.length }, dataGaps: inputJson(snapshot.qualityFlags, []), modelVersion: "deterministic-pricing-v1", ruleVersion: "worker-baseline-v1" },
    });
    if (request.isPreview) {
      await prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      return analysis;
    }
    await this.publishFormalResult(request, snapshot.id, analysis.id, confidence, keyDates, jobId);
    return analysis;
  }

  async collectSource(sourceId: string, marketScope = "new-zealand", analysisRequestId?: string, options: CollectSourceOptions = {}) {
    if (sourceId === "eventfinda") return this.collectEventfindaSource(marketScope, analysisRequestId, options);
    if (sourceId === "ticketmaster") return this.collectTicketmasterSource(marketScope, analysisRequestId, options);
    if (sourceId === "fx_rates") return this.collectRbnzFxSource(marketScope, analysisRequestId, options);
    const adapter = this.publicAdapters[sourceId];
    if (!adapter) throw new WorkerRequestError("SOURCE_NOT_FOUND", `No public adapter exists for ${sourceId}`, 404);
    const localAcceptance = options.localAcceptance === true;
    const source = await prisma.dataSource.findUniqueOrThrow({
      where: { key: sourceId },
      select: {
        id: true, key: true, name: true, enabled: true, environments: true,
        internalApprovalStatus: true, legalRightsStatus: true, lifecycle: true,
        operationalStatus: true, healthStatus: true, allowedUsage: true,
        displayPermission: true, derivedAnalysisPermission: true,
        rightsAllowStorage: true, rightsAllowDerivedAnalysis: true, rightsAllowDisplay: true,
      },
    });
    this.assertLocalAcceptanceAllowed(source, localAcceptance);
    const requestedFrom = options.from ?? new Date();
    const requestedTo = options.to ?? new Date(requestedFrom.getTime() + 90 * 86_400_000);
    const localBounds = {
      maxRequests: sourceId === "council_calendars" ? 3 : 1,
      maxRecords: 2,
      maxWindowDays: 31,
      maxBytes: 2_000_000,
      concurrency: 1,
      timeoutMs: sourceId === "council_calendars" ? 120_000 : 10_000,
    } as const;
    const from = requestedFrom;
    const to = localAcceptance
      ? new Date(Math.min(requestedTo.getTime(), from.getTime() + localBounds.maxWindowDays * 86_400_000))
      : requestedTo;
    const limit = localAcceptance
      ? localBounds.maxRecords
      : options.limit === undefined ? undefined : Math.min(5_000, Math.max(1, Math.trunc(options.limit)));
    if (to <= from || to.getTime() - from.getTime() > 366 * 86_400_000) throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Collection range must be positive and no longer than 366 days", 422);
    const productionBounds = {
      maxRequests: Math.max(1, adapter.metadata.dailyBudget),
      maxRecords: limit ?? defaultPublicRecordLimit(sourceId),
      maxWindowDays: 366,
      maxBytes: 5_000_000,
      concurrency: Math.max(1, adapter.metadata.concurrencyLimit),
      timeoutMs: 120_000,
    } as const;
    const effectiveBounds = localAcceptance ? localBounds : productionBounds;
    const collectionState = sourceId === "metservice" ? await this.metServiceCollectionState(source.id) : undefined;
    const context: AdapterContext = {
      ...this.publicAdapterContext(),
      localAcceptance,
      collectionLimits: effectiveBounds,
      collectionRange: { from, to },
      ...(localAcceptance ? { signal: AbortSignal.timeout(localBounds.timeoutMs) } : {}),
      ...(collectionState ? { collectionState } : {}),
    };
    const governanceBefore = sourceGovernanceSnapshot(source);
    const schedulesBefore = await sourceScheduleSnapshot(sourceId);
    const initialScope = {
      localAcceptance, sourceId, marketScope,
      requested: { from: requestedFrom.toISOString(), to: requestedTo.toISOString(), limit: options.limit ?? null },
      effective: { from: from.toISOString(), to: to.toISOString(), limit: effectiveBounds.maxRecords },
      limits: effectiveBounds,
      dryRun: options.dryRun ?? false,
      counters: emptyPublicCollectionCounters(),
      governanceBefore,
      schedulesBefore,
    };
    const run = await prisma.collectionRun.create({ data: { jobId: options.jobId, dataSourceId: source.id, analysisRequestId, correlationId: context.correlationId, mode: "MARKET_COVERAGE", status: "RUNNING", scope: initialScope, startedAt: new Date(), attemptCount: 1, isDemo: this.environment.NODE_ENV === "test" } });
    const counters = emptyPublicCollectionCounters();
    try {
      if (!localAcceptance && (!source.enabled || source.internalApprovalStatus !== "APPROVED" || source.legalRightsStatus !== "ALLOWED" || !source.rightsAllowStorage || !source.rightsAllowDerivedAnalysis)) {
        throw new AdapterError("RIGHTS_BLOCKED", `${source.name} is not approved for collection and derived analysis`, false);
      }
      if (!localAcceptance && source.operationalStatus !== "HEALTHY") {
        throw new AdapterError("SOURCE_UNAVAILABLE", `${source.name} is ${source.operationalStatus.toLowerCase()}`, true);
      }
      const result = await withRedisLock(`source:${sourceId}`, 60_000, async () => {
        const discovered = await adapter.discover({ marketScope, from, to, limit }, context);
        counters.discovered = discovered.length;
        const uniqueReferences = [...new Set(discovered)];
        counters.duplicatesSkipped += discovered.length - uniqueReferences.length;
        const references = localAcceptance ? uniqueReferences.slice(0, localBounds.maxRequests) : uniqueReferences;
        counters.references = references.length;
        const rawById = new Map<string, Awaited<ReturnType<PublicDataAdapter["fetch"]>>[number]>();
        for (const reference of references) {
          const records = sourceId === "council_calendars"
            && this.environment.ARGUS_API_BASE_URL
            && this.environment.ARGUS_API_TOKEN
            ? await this.executeOurAucklandBrowserTask(
                source.id,
                run.id,
                reference,
                effectiveBounds.maxRecords,
                options.dryRun === true,
                options.jobId,
              )
            : await adapter.fetch(reference, context);
          counters.requests += Math.max(1, records.reduce((sum, record) => sum + (record.networkRequestCount ?? 0), 0));
          counters.requestsAvoided += records.reduce((sum, record) => sum + (record.networkRequestsAvoided ?? 0), 0);
          for (const record of records) {
            if (rawById.has(record.externalId)) counters.duplicatesSkipped += 1;
            else rawById.set(record.externalId, record);
            if (limit && rawById.size >= limit) break;
          }
          if (limit && rawById.size >= limit) break;
        }
        const raw = [...rawById.values()];
        counters.records = raw.length;
        if (!options.dryRun) {
          for (const record of raw) {
            const payload = redactArtifact(record.payload);
            const id = stableId("raw-artifact", `${run.id}:${record.externalId}`);
            await prisma.rawArtifact.upsert({ where: { id }, create: { id, collectionRunId: run.id, dataSourceId: source.id, artifactType: "NETWORK_RESPONSE", storageRef: `postgres:RawArtifact:${id}`, contentHash: stableHash(payload), payload, containsSensitiveData: false, parserFailure: false, expiresAt: new Date(Date.now() + this.environment.RAW_ARTIFACT_TTL_HOURS * 3_600_000) }, update: {} });
            counters.rawArtifacts += 1;
          }
        }
        let signals: PublicSignal[];
        let events: PublicEvent[];
        try {
          const normalisedSignals = await adapter.normalise(raw, context);
          const normalisedEvents = adapter.normaliseEvents ? await adapter.normaliseEvents(raw, context) : [];
          signals = uniqueByExternalId(normalisedSignals, counters);
          events = uniqueByExternalId(normalisedEvents, counters);
        } catch (error) {
          if (!options.dryRun) {
            await prisma.rawArtifact.updateMany({ where: { collectionRunId: run.id }, data: { parserFailure: true, expiresAt: new Date(Date.now() + this.environment.RAW_ARTIFACT_FAILURE_TTL_HOURS * 3_600_000) } });
          }
          throw error;
        }
        counters.signals = signals.length;
        counters.events = events.length;
        if (!options.dryRun) {
          const eventOccurrenceIds = new Map<string, string>();
          const persistedEvents = await this.persistNormalisedEvents(events, source.id, run.id);
          for (const event of events) {
            const persisted = persistedEvents.get(event.externalId)!;
            eventOccurrenceIds.set(event.externalId, persisted.eventOccurrence.id);
            if (persisted.unchanged) counters.unchangedSkipped += 1;
          }
          for (const signal of signals) {
            const persisted = await this.persistNormalisedSignal(signal, source.id, run.id, marketScope);
            if (persisted.unchanged) counters.unchangedSkipped += 1;
          }
          for (const event of events) {
            for (const signal of eventSignal(event)) {
              const persisted = await this.persistNormalisedSignal(signal, source.id, run.id, marketScope, eventOccurrenceIds.get(event.externalId));
              if (persisted.unchanged) counters.unchangedSkipped += 1;
            }
          }
        }
        counters.persisted = events.length + signals.length;
        return { references: references.length, records: raw.length, events: events.length, signals: signals.length + events.flatMap(eventSignal).length };
      });
      const governanceAfter = sourceGovernanceSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
      const schedulesAfter = await sourceScheduleSnapshot(sourceId);
      const scope = { ...initialScope, counters, governanceAfter, governanceUnchanged: stableHash(governanceBefore) === stableHash(governanceAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) };
      const successCount = result.events + result.signals;
      await prisma.$transaction([
        prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount, scope, finishedAt: new Date() } }),
        ...(localAcceptance ? [] : [prisma.dataSource.update({ where: { id: source.id }, data: { lastSuccessAt: new Date(), healthStatus: "HEALTHY", operationalStatus: "HEALTHY", errorRate: 0 } })]),
      ]);
      await this.syncCollectionIncidentSafely(run.id);
      return { runId: run.id, localAcceptance, dryRun: options.dryRun ?? false, ...result, counters };
    } catch (error) {
      counters.failures += 1;
      const governanceAfter = sourceGovernanceSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
      const schedulesAfter = await sourceScheduleSnapshot(sourceId);
      await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: counters.failures, errorCode: error instanceof AdapterError ? error.code : "COLLECTION_FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown public source failure", scope: { ...initialScope, counters, governanceAfter, governanceUnchanged: stableHash(governanceBefore) === stableHash(governanceAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) }, finishedAt: new Date() } });
      await this.syncCollectionIncidentSafely(run.id);
      throw error;
    }
  }

  private assertLocalAcceptanceAllowed(
    source: { name: string; enabled: boolean; environments: string[] },
    localAcceptance: boolean,
  ) {
    if (!localAcceptance) return;
    if (this.environment.NODE_ENV !== "development") throw new AdapterError("RIGHTS_BLOCKED", "Local source acceptance is available only in development", false);
    if (this.environment.SCHEDULER_ENABLED) throw new AdapterError("RIGHTS_BLOCKED", "Disable the scheduler before local source acceptance", false);
    if (!source.enabled) throw new AdapterError("RIGHTS_BLOCKED", `${source.name} must be enabled for local source acceptance`, false);
    if (!source.environments.includes("DEVELOPMENT")) throw new AdapterError("RIGHTS_BLOCKED", `${source.name} does not allow the DEVELOPMENT environment`, false);
  }

  private async metServiceCollectionState(dataSourceId: string): Promise<NonNullable<AdapterContext["collectionState"]>> {
    const signals = await prisma.sourceMarketSignal.findMany({
      where: { dataSourceId },
      select: { evidenceRef: true, metadata: true },
    });
    const knownReferenceVersions: Record<string, string> = {};
    for (const signal of signals) {
      const metadata = jsonRecord(signal.metadata);
      const signalMetadata = jsonRecord(metadata.signal);
      const feedItem = jsonRecord(signalMetadata.feedItem);
      const reference = typeof signal.evidenceRef === "string" ? signal.evidenceRef : "";
      const guid = typeof feedItem.guid === "string" ? feedItem.guid : "";
      const pubDate = typeof feedItem.pubDate === "string" ? feedItem.pubDate : "";
      if (reference && (guid || pubDate)) knownReferenceVersions[reference] = `${guid}|${pubDate}`;
    }
    return { knownReferenceVersions };
  }

  private async persistNormalisedSignal(
    signal: PublicSignal,
    dataSourceId: string,
    collectionRunId: string,
    defaultMarketKey: string,
    eventOccurrenceId?: string,
  ) {
    const seenAt = new Date();
    const signalType = mapSignalType(signal.type);
    const marketKey = signal.marketKey ?? defaultMarketKey;
    const signalMetadata = (signal.metadata ?? {}) as Prisma.InputJsonValue;
    const sourceContent = {
      marketKey, type: signalType, title: signal.title, region: signal.region,
      startsAt: signal.startsAt.toISOString(), endsAt: signal.endsAt.toISOString(),
      direction: signal.direction, confidence: signal.confidence, evidenceRef: signal.evidenceRef,
      metadata: signal.metadata ?? {},
    };
    const contentHash = stableHash(sourceContent);
    const existing = await prisma.sourceMarketSignal.findUnique({
      where: { dataSourceId_externalId: { dataSourceId, externalId: signal.externalId } },
      include: { canonicalLink: { include: { marketSignal: true } } },
    });
    if (existing?.contentHash === contentHash && existing.canonicalLink && existing.canonicalLink.marketSignal.eventOccurrenceId === (eventOccurrenceId ?? null)) {
      const sourceSignal = await prisma.sourceMarketSignal.update({
        where: { id: existing.id },
        data: { lastCollectionRunId: collectionRunId, lastSeenAt: seenAt },
      });
      return { sourceSignal, canonical: existing.canonicalLink.marketSignal, link: existing.canonicalLink, unchanged: true };
    }
    const sourceSignal = await prisma.sourceMarketSignal.upsert({
        where: { dataSourceId_externalId: { dataSourceId, externalId: signal.externalId } },
        create: {
          dataSourceId, lastCollectionRunId: collectionRunId, externalId: signal.externalId,
          marketKey, type: signalType, title: signal.title, region: signal.region,
          startsAt: signal.startsAt, endsAt: signal.endsAt, direction: signal.direction,
          confidence: signal.confidence, evidenceRef: signal.evidenceRef,
          contentHash, metadata: { canonicalisationVersion: "source-isolated-signal-v1", signal: signalMetadata },
          isDemo: signal.fixture || this.environment.NODE_ENV === "test", lastSeenAt: seenAt,
        },
        update: {
          lastCollectionRunId: collectionRunId, marketKey, type: signalType, title: signal.title,
          region: signal.region, startsAt: signal.startsAt, endsAt: signal.endsAt,
          direction: signal.direction, confidence: signal.confidence, evidenceRef: signal.evidenceRef,
          contentHash, metadata: { canonicalisationVersion: "source-isolated-signal-v1", signal: signalMetadata }, lastSeenAt: seenAt,
        },
      });
    const existingLink = await prisma.marketSignalSourceLink.findUnique({ where: { sourceMarketSignalId: sourceSignal.id }, select: { marketSignalId: true } });
    const canonicalId = existingLink?.marketSignalId ?? stableId("signal", `${dataSourceId}:${signal.externalId}`);
    const evidence = { title: signal.title, direction: signal.direction, confidence: signal.confidence, evidenceRef: signal.evidenceRef, metadata: signalMetadata } as Prisma.InputJsonValue;
    const canonical = await prisma.marketSignal.upsert({
        where: { id: canonicalId },
        create: { id: canonicalId, marketKey, type: signalType, region: signal.region, startsAt: signal.startsAt, endsAt: signal.endsAt, dataSourceId, eventOccurrenceId, status: "CONFIRMED", evidence, isDemo: signal.fixture || this.environment.NODE_ENV === "test" },
        update: { marketKey, type: signalType, region: signal.region, startsAt: signal.startsAt, endsAt: signal.endsAt, dataSourceId, eventOccurrenceId, status: "CONFIRMED", evidence },
      });
    const link = await prisma.marketSignalSourceLink.upsert({
        where: { sourceMarketSignalId: sourceSignal.id },
        create: { marketSignalId: canonical.id, sourceMarketSignalId: sourceSignal.id, matchMethod: "SOURCE_ISOLATED_IDENTITY_V1", matchConfidence: 1, evidence: { sourceExternalId: signal.externalId } },
        update: { marketSignalId: canonical.id, matchMethod: "SOURCE_ISOLATED_IDENTITY_V1", matchConfidence: 1, reviewStatus: "AUTO_ACCEPTED", evidence: { sourceExternalId: signal.externalId } },
      });
    return { sourceSignal, canonical, link, unchanged: false };
  }

  private async resumeOrCreateBrowserCollectionRun(
    jobId: string | undefined,
    dataSourceId: string,
    analysisRequestId: string | undefined,
    scope: Prisma.InputJsonValue,
    startedAt: Date,
  ) {
    if (jobId) {
      const running = await prisma.collectionRun.findFirst({
        where: { jobId, status: "RUNNING" },
        orderBy: { createdAt: "desc" },
      });
      if (running) return running;
    }
    return prisma.collectionRun.create({
      data: {
        jobId,
        dataSourceId,
        analysisRequestId,
        correlationId: randomUUID(),
        mode: "MARKET_COVERAGE",
        status: "RUNNING",
        scope,
        startedAt,
        attemptCount: 1,
        isDemo: false,
      },
    });
  }

  private async collectRbnzFxSource(marketScope: string, analysisRequestId?: string, options: CollectSourceOptions = {}) {
    if (marketScope !== "new-zealand") throw new WorkerRequestError("INVALID_MARKET_SCOPE", "RBNZ B1 collection supports New Zealand only", 422);
    const localAcceptance = options.localAcceptance === true;
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "fx_rates" } });
    this.assertLocalAcceptanceAllowed(source, localAcceptance);
    if (!localAcceptance && (!source.enabled || source.internalApprovalStatus !== "APPROVED" || source.legalRightsStatus !== "ALLOWED" || !source.rightsAllowStorage || !source.rightsAllowDerivedAnalysis)) {
      throw new AdapterError("RIGHTS_BLOCKED", `${source.name} is not approved for collection and derived analysis`, false);
    }
    if (!localAcceptance && source.operationalStatus !== "HEALTHY") throw new AdapterError("SOURCE_UNAVAILABLE", `${source.name} is ${source.operationalStatus.toLowerCase()}`, true);
    const browserWorkerConfigured = Boolean(this.environment.BROWSER_WORKER_INTERNAL_URL && this.environment.BROWSER_WORKER_TOKEN);
    const argusConfigured = Boolean(this.environment.ARGUS_API_BASE_URL && this.environment.ARGUS_API_TOKEN);
    if (!browserWorkerConfigured && !argusConfigured) throw new AdapterError("CONFIGURATION_ERROR", "Neither Argus nor Browser Worker is configured for RBNZ collection", false);
    const now = new Date();
    const requestedFrom = options.from ?? new Date(now.getTime() - 86_400_000);
    const requestedTo = options.to ?? new Date(now.getTime() + 31 * 86_400_000);
    const from = requestedFrom;
    const to = localAcceptance ? new Date(Math.min(requestedTo.getTime(), from.getTime() + 31 * 86_400_000)) : requestedTo;
    if (to <= from) throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "RBNZ B1 collection range must be positive", 422);
    const limits = { maxRequests: 1, maxPages: 1, maxRecords: localAcceptance ? 2 : Math.min(20, Math.max(1, options.limit ?? 20)), maxWindowDays: 31, concurrency: 1, timeoutMs: Math.min(argusConfigured ? this.environment.ARGUS_TIMEOUT_MS : this.environment.BROWSER_WORKER_TIMEOUT_MS, 60_000), maxBytes: 2_000_000 } as const;
    const governanceBefore = sourceGovernanceSnapshot(source);
    const schedulesBefore = await sourceScheduleSnapshot("fx_rates");
    const initialScope = { localAcceptance, sourceId: "fx_rates", marketScope, requested: { from: requestedFrom.toISOString(), to: requestedTo.toISOString(), limit: options.limit ?? null }, effective: { from: from.toISOString(), to: to.toISOString(), limit: limits.maxRecords }, limits, dryRun: options.dryRun === true, governanceBefore, schedulesBefore };
    const run = await this.resumeOrCreateBrowserCollectionRun(options.jobId, source.id, analysisRequestId, initialScope, now);
    const counters = { requests: 0, pages: 0, records: 0, signals: 0, unchangedSignalsSkipped: 0, rawArtifacts: 0, failures: 0 };
    try {
      const result = await withRedisLock("source:fx_rates", 60_000, async () => {
        counters.requests = 1;
        const browserResult = await this.executeRbnzFxBrowserTask(source.id, run.id, options.dryRun === true, options.jobId);
        counters.pages = 1;
        counters.rawArtifacts = options.dryRun ? 0 : browserResult.evidence.length;
        if (!isRbnzFxExtraction(browserResult.extracted)) {
          if (!options.dryRun) await this.markBrowserEvidenceParserFailure(run.id, browserResult.traceId);
          throw new AdapterError("PARSING_ERROR", "RBNZ B1 extractor returned an invalid payload", false);
        }
        const signals = normaliseRbnzFxSignals(browserResult.extracted, limits.maxRecords);
        counters.records = signals.length;
        counters.signals = signals.length;
        if (!options.dryRun) {
          for (const signal of signals) {
            const persisted = await this.persistNormalisedSignal(signal, source.id, run.id, marketScope);
            if (persisted.unchanged) counters.unchangedSignalsSkipped += 1;
          }
        }
        return { references: 1, records: signals.length, events: 0, signals: signals.length };
      });
      const governanceAfter = sourceGovernanceSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
      const schedulesAfter = await sourceScheduleSnapshot("fx_rates");
      const scope = { ...initialScope, counters, governanceAfter, governanceUnchanged: stableHash(governanceBefore) === stableHash(governanceAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) };
      await prisma.$transaction([
        prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: result.signals, scope, finishedAt: new Date() } }),
        ...(localAcceptance ? [] : [prisma.dataSource.update({ where: { id: source.id }, data: { lastSuccessAt: new Date(), healthStatus: "HEALTHY", operationalStatus: "HEALTHY", errorRate: 0 } })]),
      ]);
      await this.syncCollectionIncidentSafely(run.id);
      return { runId: run.id, localAcceptance, dryRun: options.dryRun === true, ...result, counters };
    } catch (error) {
      if (error instanceof DeferredJobError) throw error;
      counters.failures += 1;
      const governanceAfter = sourceGovernanceSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
      const schedulesAfter = await sourceScheduleSnapshot("fx_rates");
      await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: counters.failures, errorCode: error instanceof AdapterError ? error.code : "COLLECTION_FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown RBNZ B1 collection failure", scope: { ...initialScope, counters, governanceAfter, governanceUnchanged: stableHash(governanceBefore) === stableHash(governanceAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) }, finishedAt: new Date() } });
      await this.syncCollectionIncidentSafely(run.id);
      throw error;
    }
  }

  private async collectTicketmasterSource(marketScope: string, analysisRequestId?: string, options: CollectSourceOptions = {}) {
    if (marketScope !== "new-zealand") throw new WorkerRequestError("INVALID_MARKET_SCOPE", "Ticketmaster browser collection currently supports New Zealand only", 422);
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "ticketmaster" } });
    const localAcceptance = options.localAcceptance === true;
    const developmentBootstrap = options.developmentBootstrap === true;
    if (localAcceptance && developmentBootstrap) throw new WorkerRequestError("INVALID_COLLECTION_MODE", "Choose either local acceptance or development bootstrap", 422);
    const guardedDevelopmentRun = localAcceptance || developmentBootstrap;
    this.assertTicketmasterSourceAllowed(source, localAcceptance, developmentBootstrap);
    const browserWorkerConfigured = Boolean(this.environment.BROWSER_WORKER_INTERNAL_URL && this.environment.BROWSER_WORKER_TOKEN);
    const argusConfigured = Boolean(this.environment.ARGUS_API_BASE_URL && this.environment.ARGUS_API_TOKEN);
    if (!browserWorkerConfigured && !argusConfigured) throw new AdapterError("CONFIGURATION_ERROR", "Neither Argus nor Browser Worker is configured for Ticketmaster collection", false);
    const now = new Date();
    const requestedPhase = options.phase ?? "full";
    const metadata = jsonRecord(source.metadata);
    const circuit = ticketmasterCircuitStatus(metadata, now);
    const phase = circuit.halfOpen ? "discovery" : requestedPhase;
    const requestedFrom = options.from ?? new Date(now.getTime() - 86_400_000);
    const requestedTo = options.to ?? new Date(now.getTime() + 400 * 86_400_000);
    const from = requestedFrom;
    const to = localAcceptance ? new Date(Math.min(requestedTo.getTime(), from.getTime() + 31 * 86_400_000)) : requestedTo;
    if (to <= from || to.getTime() - from.getTime() > 730 * 86_400_000) throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Ticketmaster collection range must be positive and no longer than 730 days", 422);
    const requestedMaxPages = localAcceptance ? 1 : Math.min(options.maxPages ?? this.environment.TICKETMASTER_DISCOVERY_MAX_PAGES, TICKETMASTER_LISTING_URLS.length);
    const requestedMaxDetails = localAcceptance ? Math.min(options.maxDetails ?? options.limit ?? 2, 2) : Math.min(options.maxDetails ?? options.limit ?? this.environment.TICKETMASTER_DETAIL_BATCH_SIZE, 100);
    const maxPages = circuit.halfOpen ? 1 : requestedMaxPages;
    const maxDetails = circuit.halfOpen ? 0 : requestedMaxDetails;
    const maxRecords = localAcceptance ? 2 : Math.min(options.limit ?? 5_000, 5_000);
    const localMaxRequests = (phase === "discovery" || phase === "full" ? maxPages : 0) + (phase === "details" || phase === "full" ? maxDetails : 0);
    const limits = { maxRequests: localAcceptance ? localMaxRequests : this.environment.TICKETMASTER_DAILY_REQUEST_BUDGET, maxPages, maxDetails, maxRecords, maxWindowDays: localAcceptance ? 31 : 730, concurrency: 1, timeoutMs: Math.min(argusConfigured ? this.environment.ARGUS_TIMEOUT_MS : this.environment.BROWSER_WORKER_TIMEOUT_MS, 60_000) } as const;
    const governanceBefore = sourceGovernanceSnapshot(source);
    const schedulesBefore = await sourceScheduleSnapshot("ticketmaster");
    const initialScope = { localAcceptance, developmentBootstrap, sourceId: "ticketmaster", marketScope, requestedPhase, phase, halfOpenProbe: circuit.halfOpen, circuitBefore: { ...circuit, cooldownUntil: circuit.cooldownUntil?.toISOString() ?? null }, requested: { from: requestedFrom.toISOString(), to: requestedTo.toISOString(), limit: options.limit ?? null }, effective: { from: from.toISOString(), to: to.toISOString(), limit: maxRecords }, limits, dryRun: options.dryRun === true, governanceBefore, schedulesBefore };
    const run = await this.resumeOrCreateBrowserCollectionRun(options.jobId, source.id, analysisRequestId, initialScope, now);
    const counters = { requests: 0, pages: 0, discovered: 0, records: 0, targetsUpserted: 0, listingEventsAccepted: 0, listingEventsPersisted: 0, detailRequestsAvoided: 0, detailsFetched: 0, unchangedDetails: 0, eventsPersisted: 0, unchangedEventsSkipped: 0, rawArtifacts: 0, failures: 0 };
    let circuitTransitionApplied = false;
    let circuitCooldownUntil = circuit.cooldownUntil;
    try {
      if (circuit.blocked) {
        const reason = circuit.state === "MANUAL_REQUIRED" ? "requires manual review after three persistent challenges" : `is cooling down until ${circuit.cooldownUntil?.toISOString()}`;
        throw new AdapterError("RATE_LIMITED", `Ticketmaster collection ${reason}`, true);
      }
      const collectionResult = await withRedisLock("source:ticketmaster", 60 * 60_000, async () => {
        const usedToday = await prisma.rawArtifact.count({ where: { dataSourceId: source.id, artifactType: "HTML", createdAt: { gte: startOfUtcDay(now) } } });
        let lastRequestAt = 0;
        let rateLimited = false;
        const discovered = new Map<string, { events: TicketmasterListingEvent[]; discoveredFrom: string[] }>();
        const dryRun = options.dryRun === true;
        const capture = async (url: string) => {
          if (usedToday + counters.requests >= this.environment.TICKETMASTER_DAILY_REQUEST_BUDGET) throw new AdapterError("RATE_LIMITED", "Ticketmaster daily request budget has been reached", true);
          if (lastRequestAt) {
            const delay = ticketmasterRequestDelayMs(this.environment.TICKETMASTER_MIN_DELAY_MS, this.environment.TICKETMASTER_DELAY_JITTER_MS);
            await wait(Math.max(0, delay - (Date.now() - lastRequestAt)));
          }
          lastRequestAt = Date.now();
          counters.requests += 1;
          const browserResult = await this.executeTicketmasterBrowserTask(source.id, run.id, url, dryRun, options.jobId);
          counters.rawArtifacts += dryRun ? 0 : browserResult.evidence.length;
          const extraction = browserResult.extracted;
          if (!isTicketmasterExtraction(extraction)) {
            if (!dryRun) await this.markBrowserEvidenceParserFailure(run.id, browserResult.traceId);
            throw new AdapterError("PARSING_ERROR", `Ticketmaster extractor returned an invalid payload for ${url}`, false);
          }
          return { ...browserResult, extracted: extraction };
        };

        if (phase === "discovery" || phase === "full") {
          for (const listingUrl of TICKETMASTER_LISTING_URLS.slice(0, maxPages)) {
            const browserResult = await capture(listingUrl);
            if (!isTicketmasterListingExtraction(browserResult.extracted)) throw new AdapterError("PARSING_ERROR", `Ticketmaster listing returned an unexpected page for ${listingUrl}`, false);
            counters.pages += 1;
            counters.discovered += browserResult.extracted.events.length;
            for (const group of groupTicketmasterListingEvents(browserResult.extracted.events)) {
              const accepted = group.events.filter((listingEvent) => {
                const event = normaliseTicketmasterEvent(listingEvent);
                return event && event.endsAt >= from && event.startsAt <= to;
              });
              if (!accepted.length || (!discovered.has(group.url) && discovered.size >= maxRecords)) continue;
              const current = discovered.get(group.url);
              const merged = groupTicketmasterListingEvents([...(current?.events ?? []), ...accepted])[0]?.events ?? accepted;
              discovered.set(group.url, {
                events: merged,
                discoveredFrom: [...new Set([...(current?.discoveredFrom ?? []), browserResult.extracted.canonicalUrl])],
              });
            }
          }

          const hashes = [...discovered.keys()].map(ticketmasterUrlHash);
          const existingTargets = dryRun || !hashes.length ? [] : await prisma.sourceCrawlTarget.findMany({
            where: { dataSourceId: source.id, urlHash: { in: hashes } },
            select: { urlHash: true, status: true, lastFetchedAt: true, nextFetchAt: true, contentHash: true, metadata: true },
          });
          const existingByHash = new Map(existingTargets.map((target) => [target.urlHash, target]));
          for (const [url, listing] of discovered) {
            const coverage = ticketmasterListingCoverage(listing.events);
            counters.listingEventsAccepted += coverage.events.length;
            if (coverage.complete) counters.detailRequestsAvoided += 1;
            const cancelled = coverage.events.length > 0 && coverage.events.every((event) => event.status === "CANCELLED");
            if (!dryRun && coverage.complete) {
              const persistedEvents = await this.persistNormalisedEvents(coverage.events, source.id, run.id);
              counters.unchangedEventsSkipped += [...persistedEvents.values()].filter((persisted) => persisted.unchanged).length;
              counters.listingEventsPersisted += coverage.events.length;
              counters.eventsPersisted += coverage.events.length;
            }
            if (!dryRun) {
              const urlHash = ticketmasterUrlHash(url);
              const existing = existingByHash.get(urlHash);
              const detailRequired = !coverage.complete && !cancelled;
              const targetMetadata = {
                ...jsonRecord(existing?.metadata),
                listing: listing.events[0],
                listingEvents: listing.events,
                discoveredFrom: listing.discoveredFrom,
                listingComplete: coverage.complete,
                detailRequired,
                occurrenceCount: listing.events.length,
              };
              await prisma.sourceCrawlTarget.upsert({
                where: { dataSourceId_urlHash: { dataSourceId: source.id, urlHash } },
                create: { dataSourceId: source.id, url, urlHash, kind: "EVENT_DETAIL", status: cancelled ? "CANCELLED" : coverage.complete ? "LISTING_COMPLETE" : "PENDING", priority: cancelled ? 900 : listingPriority(listing.events[0]?.startsAt, now), active: !cancelled, lastSeenAt: now, lastFetchedAt: coverage.complete ? now : null, nextFetchAt: detailRequired ? now : null, contentHash: coverage.complete ? stableHash(listing.events) : null, consecutiveFailures: 0, metadata: targetMetadata },
                update: { url, status: cancelled ? "CANCELLED" : coverage.complete ? "LISTING_COMPLETE" : "PENDING", priority: cancelled ? 900 : listingPriority(listing.events[0]?.startsAt, now), active: !cancelled, lastSeenAt: now, missedDiscoveryCount: 0, lastFetchedAt: coverage.complete ? now : existing?.lastFetchedAt, nextFetchAt: detailRequired ? (localAcceptance ? now : existing?.nextFetchAt ?? now) : null, contentHash: coverage.complete ? stableHash(listing.events) : existing?.contentHash, consecutiveFailures: cancelled || coverage.complete ? 0 : undefined, lastErrorCode: null, lastErrorAt: cancelled || coverage.complete ? null : undefined, metadata: targetMetadata },
              });
              counters.targetsUpserted += 1;
            }
          }
          if (!dryRun && !localAcceptance && counters.pages === TICKETMASTER_LISTING_URLS.length) {
            await prisma.sourceCrawlTarget.updateMany({ where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, lastSeenAt: { lt: now } }, data: { missedDiscoveryCount: { increment: 1 } } });
            await prisma.sourceCrawlTarget.updateMany({ where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, lastSeenAt: { lt: now }, missedDiscoveryCount: { gte: 2 } }, data: { active: false, status: "DISCOVERY_MISSING" } });
          }
        }

        if (phase === "details" || phase === "full") {
          const persistedUrls = detailTargetBatchUrls(run.scope);
          const targets = persistedUrls.length
            ? dryRun
              ? orderPersistedDetailTargets(
                  persistedUrls,
                  [...discovered.entries()].map(([url, listing]) => ({ id: null, url, contentHash: null, consecutiveFailures: 0, metadata: { listing: listing.events[0], listingEvents: listing.events } })),
                )
              : orderPersistedDetailTargets(
                  persistedUrls,
                  await prisma.sourceCrawlTarget.findMany({
                    where: { dataSourceId: source.id, url: { in: persistedUrls } },
                    select: { id: true, url: true, contentHash: true, consecutiveFailures: true, metadata: true },
                  }),
                )
            : dryRun && discovered.size
              ? [...discovered.entries()]
                  .filter(([, listing]) => !ticketmasterListingCoverage(listing.events).complete)
                  .slice(0, maxDetails)
                  .map(([url, listing]) => ({ id: null, url, contentHash: null, consecutiveFailures: 0, metadata: { listing: listing.events[0], listingEvents: listing.events } }))
              : await prisma.sourceCrawlTarget.findMany({
                  where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, status: { in: ["PENDING", "FAILED", "RATE_LIMITED", "FETCHED"] }, OR: [{ nextFetchAt: null }, { nextFetchAt: { lte: now } }] },
                  orderBy: [{ priority: "asc" }, { nextFetchAt: "asc" }, { firstSeenAt: "asc" }],
                  take: maxDetails,
                  select: { id: true, url: true, contentHash: true, consecutiveFailures: true, metadata: true },
                });
          if (!persistedUrls.length && options.jobId) {
            await persistDetailTargetBatch(run.id, run.scope, targets.map((target) => target.url));
          }

          for (const target of targets) {
            try {
              const browserResult = await capture(target.url);
              if (!isTicketmasterDetailExtraction(browserResult.extracted) || browserResult.extracted.events.length === 0) {
                if (!dryRun) await this.markBrowserEvidenceParserFailure(run.id, browserResult.traceId);
                throw new AdapterError("PARSING_ERROR", `Ticketmaster detail returned no event for ${target.url}`, false);
              }
              const targetUrl = canonicalTicketmasterUrl(target.url);
              const allEvents = normaliseTicketmasterEvents(browserResult.extracted.events)
                .filter((event) => canonicalTicketmasterUrl(event.sourceUrl) === targetUrl);
              if (!allEvents.length) throw new AdapterError("PARSING_ERROR", `Ticketmaster detail could not be normalised for ${target.url}`, false);
              const events = allEvents.filter((event) => event.endsAt >= from && event.startsAt <= to);
              if (!dryRun) {
                const persistedEvents = await this.persistNormalisedEvents(events, source.id, run.id);
                counters.unchangedEventsSkipped += [...persistedEvents.values()].filter((persisted) => persisted.unchanged).length;
                const detailContentHash = stableHash(browserResult.extracted);
                const previousUnchangedCount = integerMetadata(target.metadata, "unchangedDetailFetchCount");
                const detailUnchanged = target.contentHash === detailContentHash;
                const unchangedDetailFetchCount = detailUnchanged ? Math.min(4, previousUnchangedCount + 1) : 0;
                if (detailUnchanged) counters.unchangedDetails += 1;
                const refresh = ticketmasterRefreshPolicy(allEvents, now, unchangedDetailFetchCount);
                const cancelled = allEvents.every((event) => event.status === "CANCELLED");
                await prisma.sourceCrawlTarget.update({
                  where: { id: target.id! },
                  data: { status: cancelled ? "CANCELLED" : "FETCHED", active: refresh.active, priority: refresh.priority, lastFetchedAt: new Date(), nextFetchAt: refresh.nextFetchAt, contentHash: detailContentHash, httpStatus: 200, consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null, metadata: { ...jsonRecord(target.metadata), ticketmasterEventIds: allEvents.map((event) => event.externalId), occurrenceCount: allEvents.length, lastTitle: allEvents[0].title, terminalStatus: cancelled ? "CANCELLED" : null, detailUnchanged, unchangedDetailFetchCount } },
                });
              }
              counters.detailsFetched += 1;
              counters.eventsPersisted += events.length;
            } catch (error) {
              if (error instanceof DeferredJobError) throw error;
              counters.failures += 1;
              const isRateLimited = error instanceof AdapterError && error.code === "RATE_LIMITED";
              if (!dryRun && target.id) {
                const failures = target.consecutiveFailures + 1;
                await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { status: isRateLimited ? "RATE_LIMITED" : "FAILED", consecutiveFailures: failures, nextFetchAt: ticketmasterFailureBackoff(failures, isRateLimited), lastErrorCode: error instanceof AdapterError ? error.code : "BROWSER_CAPTURE_FAILED", lastErrorAt: new Date() } });
              }
              if (isRateLimited) {
                rateLimited = true;
                if (!dryRun) {
                  const transition = ticketmasterChallengeTransition(metadata, new Date());
                  circuitTransitionApplied = true;
                  circuitCooldownUntil = transition.cooldownUntil;
                  await prisma.dataSource.update({ where: { id: source.id }, data: { ...(guardedDevelopmentRun ? {} : { operationalStatus: "DEGRADED" as const, healthStatus: "DEGRADED" as const }), metadata: transition.metadata as Prisma.InputJsonValue } });
                }
                break;
              }
            }
          }
        }
        if (!dryRun) counters.rawArtifacts = await prisma.rawArtifact.count({ where: { collectionRunId: run.id } });
        counters.records = counters.detailsFetched;
        return { rateLimited };
      }, this.environment.REDIS_URL);
      if (!options.dryRun && !collectionResult.rateLimited && (counters.pages > 0 || counters.detailsFetched > 0) && circuit.challengeCount > 0) {
        await prisma.dataSource.update({ where: { id: source.id }, data: { metadata: ticketmasterCircuitSuccessMetadata(metadata, new Date()) as Prisma.InputJsonValue } });
        circuitCooldownUntil = null;
      }
      const governanceAfter = sourceGovernanceSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
      const schedulesAfter = await sourceScheduleSnapshot("ticketmaster");
      const scope = { ...initialScope, counters, rateLimited: collectionResult.rateLimited, governanceAfter, governanceUnchanged: stableHash(governanceBefore) === stableHash(governanceAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) };
      const status = counters.failures ? "PARTIAL" : "SUCCEEDED";
      await prisma.$transaction([
        prisma.collectionRun.update({ where: { id: run.id }, data: { status, successCount: counters.eventsPersisted + Math.max(0, counters.targetsUpserted - counters.detailRequestsAvoided), failureCount: counters.failures, errorCode: collectionResult.rateLimited ? "RATE_LIMITED" : counters.failures ? "PARTIAL_FAILURE" : null, errorSummary: collectionResult.rateLimited ? "Collection stopped and entered cooldown after a rate limit or persistent access challenge" : null, scope, finishedAt: new Date() } }),
        ...(guardedDevelopmentRun ? [] : [prisma.dataSource.update({ where: { id: source.id }, data: { lastSuccessAt: counters.pages || counters.detailsFetched ? new Date() : source.lastSuccessAt, healthStatus: counters.failures ? "DEGRADED" : "HEALTHY", operationalStatus: counters.failures ? "DEGRADED" : "HEALTHY", errorRate: counters.requests ? counters.failures / counters.requests : 0 } })]),
      ]);
      if (options.jobId) await settleCancelledCollectionRun(options.jobId);
      await this.syncCollectionIncidentSafely(run.id);
      return { runId: run.id, localAcceptance, developmentBootstrap, dryRun: options.dryRun === true, requestedPhase, phase, halfOpenProbe: circuit.halfOpen, references: counters.pages, records: counters.records, events: counters.eventsPersisted, signals: 0, counters };
    } catch (error) {
      if (error instanceof DeferredJobError) throw error;
      counters.failures += 1;
      if (!options.dryRun) counters.rawArtifacts = await prisma.rawArtifact.count({ where: { collectionRunId: run.id } });
      if (!options.dryRun && error instanceof AdapterError && error.code === "RATE_LIMITED" && !circuit.blocked && !circuitTransitionApplied) {
        const transition = ticketmasterChallengeTransition(metadata, new Date());
        circuitTransitionApplied = true;
        circuitCooldownUntil = transition.cooldownUntil;
        await prisma.dataSource.update({ where: { id: source.id }, data: { ...(guardedDevelopmentRun ? {} : { operationalStatus: "DEGRADED" as const, healthStatus: "DEGRADED" as const }), metadata: transition.metadata as Prisma.InputJsonValue } });
      }
      const governanceAfter = sourceGovernanceSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
      const schedulesAfter = await sourceScheduleSnapshot("ticketmaster");
      const retryable = error instanceof AdapterError && (error.code === "RATE_LIMITED" || error.retryable);
      await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: counters.failures, errorCode: error instanceof AdapterError ? error.code : "COLLECTION_FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown Ticketmaster collection failure", scope: { ...initialScope, counters, ...(retryable && circuitCooldownUntil ? { cooldownUntil: circuitCooldownUntil.toISOString() } : {}), governanceAfter, governanceUnchanged: stableHash(governanceBefore) === stableHash(governanceAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) }, finishedAt: new Date() } });
      if (options.jobId) await settleCancelledCollectionRun(options.jobId);
      await this.syncCollectionIncidentSafely(run.id);
      throw error;
    }
  }

  private assertTicketmasterSourceAllowed(source: Awaited<ReturnType<typeof prisma.dataSource.findUniqueOrThrow>>, localAcceptance: boolean, developmentBootstrap = false) {
    if (localAcceptance || developmentBootstrap) {
      this.assertLocalAcceptanceAllowed(source, true);
      return;
    }
    if (!source.enabled || source.internalApprovalStatus !== "APPROVED" || source.legalRightsStatus !== "ALLOWED" || !source.rightsAllowStorage || !source.rightsAllowDerivedAnalysis) {
      throw new AdapterError("RIGHTS_BLOCKED", `${source.name} is not approved for collection and derived analysis`, false);
    }
    if (!["HEALTHY", "DEGRADED"].includes(source.operationalStatus)) throw new AdapterError("SOURCE_UNAVAILABLE", `${source.name} is ${source.operationalStatus.toLowerCase()}`, true);
  }

  private async collectEventfindaSource(marketScope: string, analysisRequestId?: string, options: CollectSourceOptions = {}) {
    if (marketScope !== "new-zealand") throw new WorkerRequestError("INVALID_MARKET_SCOPE", "Eventfinda browser collection currently supports New Zealand only", 422);
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "eventfinda" } });
    const phase = options.phase ?? "full";
    const localAcceptance = options.localAcceptance === true;
    const developmentBootstrap = options.developmentBootstrap === true;
    if (localAcceptance && developmentBootstrap) throw new WorkerRequestError("INVALID_COLLECTION_MODE", "Choose either local acceptance or development bootstrap", 422);
    const guardedDevelopmentRun = localAcceptance || developmentBootstrap;
    const now = new Date();
    const from = options.from ?? new Date(now.getTime() - 7 * 86_400_000);
    const to = options.to ?? new Date(now.getTime() + 400 * 86_400_000);
    const maxPages = localAcceptance
      ? Math.min(options.maxPages ?? 1, 1)
      : Math.min(options.maxPages ?? this.environment.EVENTFINDA_DISCOVERY_MAX_PAGES, this.environment.EVENTFINDA_DISCOVERY_MAX_PAGES);
    const maxDetails = localAcceptance
      ? Math.min(options.maxDetails ?? options.limit ?? 2, 2)
      : Math.min(options.maxDetails ?? options.limit ?? this.environment.EVENTFINDA_DETAIL_BATCH_SIZE, 500);
    const dryRun = options.dryRun === true;
    const governanceBefore = sourceGovernanceSnapshot(source);
    const schedulesBefore = await sourceScheduleSnapshot("eventfinda");
    const initialScope = { marketScope, sourceId: "eventfinda", phase, from: from.toISOString(), to: to.toISOString(), maxPages, maxDetails, dryRun, localAcceptance, developmentBootstrap, governanceBefore, schedulesBefore };
    const run = await this.resumeOrCreateBrowserCollectionRun(options.jobId, source.id, analysisRequestId, initialScope, now);

    try {
      this.assertEventfindaSourceAllowed(source, localAcceptance, developmentBootstrap);
      const metadata = jsonRecord(source.metadata);
      const cooldownUntil = typeof metadata.collectionCooldownUntil === "string" ? new Date(metadata.collectionCooldownUntil) : null;
      if (cooldownUntil && !Number.isNaN(cooldownUntil.getTime()) && cooldownUntil > now) {
        throw new AdapterError("RATE_LIMITED", `Eventfinda collection is cooling down until ${cooldownUntil.toISOString()}`, true);
      }
      const browserWorkerConfigured = Boolean(this.environment.BROWSER_WORKER_INTERNAL_URL && this.environment.BROWSER_WORKER_TOKEN);
      const argusConfigured = Boolean(this.environment.ARGUS_API_BASE_URL && this.environment.ARGUS_API_TOKEN);
      if (!browserWorkerConfigured && !argusConfigured) {
        throw new AdapterError("CONFIGURATION_ERROR", "Neither Argus nor Browser Worker is configured for Eventfinda collection", false);
      }

      const result = await withRedisLock("source:eventfinda", 60 * 60_000, async () => {
        const usedToday = await prisma.rawArtifact.count({ where: { dataSourceId: source.id, artifactType: "HTML", createdAt: { gte: startOfUtcDay(now) } } });
        let requests = 0;
        let lastRequestAt = 0;
        let rateLimited = false;
        let failureCount = 0;
        let retryCount = 0;
        const discovered = new Map<string, { events: EventfindaListingEvent[]; discoveredFrom: string[] }>();
        let pagesScanned = 0;
        let totalPages = 0;
        let paginationUnverified = false;
        let listingCards = 0;
        let duplicateDetailTargetsAvoided = 0;
        let targetsUpserted = 0;
        let detailsFetched = 0;
        let unchangedDetails = 0;
        let eventsPersisted = 0;
        let unchangedEventsSkipped = 0;

        const capture = async (url: string): Promise<BrowserTaskResult> => {
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
              if (usedToday + requests >= this.environment.EVENTFINDA_DAILY_REQUEST_BUDGET) {
                throw new AdapterError("RATE_LIMITED", "Eventfinda daily request budget has been reached", true);
              }
              if (lastRequestAt) {
                const delay = eventfindaRequestDelayMs(this.environment.EVENTFINDA_MIN_DELAY_MS, this.environment.EVENTFINDA_DELAY_JITTER_MS);
                await wait(Math.max(0, delay - (Date.now() - lastRequestAt)));
              }
              lastRequestAt = Date.now();
              requests += 1;
              const browserResult = await this.executeEventfindaBrowserTask(source.id, run.id, url, dryRun, options.jobId);
              if (!browserResult.extracted || typeof browserResult.extracted !== "object") {
                if (!dryRun) await this.markBrowserEvidenceParserFailure(run.id, browserResult.traceId);
                throw new AdapterError("PARSING_ERROR", `Eventfinda extractor returned no data for ${url}`, false);
              }
              return browserResult;
            } catch (error) {
              const retryable = error instanceof AdapterError && error.retryable && error.code !== "RATE_LIMITED";
              if (!retryable || attempt === 3) throw error;
              retryCount += 1;
              await wait(attempt * 30_000);
            }
          }
          throw new AdapterError("SOURCE_UNAVAILABLE", `Eventfinda capture exhausted retries for ${url}`, true);
        };

        if (phase === "discovery" || phase === "full") {
          const firstCapture = await capture(eventfindaListingPageUrl(1));
          const first = firstCapture.extracted as EventfindaExtraction;
          if (first.kind !== "listing") throw new AdapterError("PARSING_ERROR", "Eventfinda nationwide listing returned an unexpected page", false);
          totalPages = first.totalPages;
          paginationUnverified = eventfindaPaginationNeedsProbe(first);
          let second: EventfindaListingExtraction | null = null;
          if (paginationUnverified && maxPages > 1) {
            const probe = (await capture(eventfindaListingPageUrl(2))).extracted as EventfindaExtraction;
            if (probe.kind !== "listing" || probe.currentPage !== 2 || probe.totalPages < 2 || probe.events.length === 0) {
              throw new AdapterError("SOURCE_UNAVAILABLE", "Eventfinda pagination disappeared from a full listing response and page 2 could not verify the collection boundary", true);
            }
            second = probe;
            totalPages = probe.totalPages;
            paginationUnverified = false;
          }
          const pagesToScan = Math.min(totalPages, maxPages);
          for (let page = 1; page <= pagesToScan; page += 1) {
            const extraction = page === 1 ? first : page === 2 && second ? second : (await capture(eventfindaListingPageUrl(page))).extracted as EventfindaExtraction;
            if (extraction.kind !== "listing" || extraction.currentPage !== page) throw new AdapterError("PARSING_ERROR", `Eventfinda listing page ${page} could not be verified`, false);
            pagesScanned += 1;
            const listingGroups = groupEventfindaListingEvents(extraction.events);
            listingCards += listingGroups.reduce((count, group) => count + group.events.length, 0);
            for (const group of listingGroups) {
              const current = discovered.get(group.url);
              const merged = groupEventfindaListingEvents([...(current?.events ?? []), ...group.events])[0]?.events ?? group.events;
              discovered.set(group.url, {
                events: merged,
                discoveredFrom: [...new Set([...(current?.discoveredFrom ?? []), extraction.canonicalUrl])],
              });
            }
          }
          duplicateDetailTargetsAvoided = Math.max(0, listingCards - discovered.size);
          if (!dryRun && discovered.size) {
            const hashes = [...discovered.keys()].map(eventfindaUrlHash);
            const existingTargets = await prisma.sourceCrawlTarget.findMany({
              where: { dataSourceId: source.id, urlHash: { in: hashes } },
              select: { urlHash: true, status: true, lastFetchedAt: true, nextFetchAt: true, metadata: true },
            });
            const existingByHash = new Map(existingTargets.map((target) => [target.urlHash, target]));
            for (const [url, listing] of discovered) {
              const urlHash = eventfindaUrlHash(url);
              const existing = existingByHash.get(urlHash);
              const listingContentHash = stableHash(listing.events);
              const previousMetadata = jsonRecord(existing?.metadata);
              const listingChanged = typeof previousMetadata.listingContentHash === "string" && previousMetadata.listingContentHash !== listingContentHash;
              const shouldFetchNow = localAcceptance || !existing?.lastFetchedAt || listingChanged;
              const targetMetadata = {
                ...previousMetadata,
                listing: listing.events[0],
                listingObservations: listing.events,
                listingContentHash,
                listingChanged,
                discoveredFrom: listing.discoveredFrom,
                listingOccurrenceCount: listing.events.length,
              };
              await prisma.sourceCrawlTarget.upsert({
                where: { dataSourceId_urlHash: { dataSourceId: source.id, urlHash } },
                create: { dataSourceId: source.id, url, urlHash, kind: "EVENT_DETAIL", status: "PENDING", priority: listingPriority(listing.events[0]?.startsAt, now), active: true, lastSeenAt: now, nextFetchAt: now, metadata: targetMetadata },
                update: { url, status: listingChanged || existing?.status === "DISCOVERY_MISSING" ? "PENDING" : existing?.status ?? "PENDING", priority: listingPriority(listing.events[0]?.startsAt, now), active: true, lastSeenAt: now, missedDiscoveryCount: 0, nextFetchAt: shouldFetchNow ? now : existing?.nextFetchAt, lastErrorCode: listingChanged ? null : undefined, lastErrorAt: listingChanged ? null : undefined, consecutiveFailures: listingChanged ? 0 : undefined, metadata: targetMetadata },
              });
              targetsUpserted += 1;
            }
          }
          if (!dryRun && !localAcceptance && !paginationUnverified && pagesScanned === totalPages) {
            await prisma.sourceCrawlTarget.updateMany({ where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, lastSeenAt: { lt: now } }, data: { missedDiscoveryCount: { increment: 1 } } });
            await prisma.sourceCrawlTarget.updateMany({ where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, lastSeenAt: { lt: now }, missedDiscoveryCount: { gte: 2 } }, data: { active: false, status: "DISCOVERY_MISSING" } });
          }
        }

        if (phase === "details" || phase === "full") {
          const persistedUrls = detailTargetBatchUrls(run.scope);
          const targets = persistedUrls.length
            ? dryRun
              ? orderPersistedDetailTargets(
                  persistedUrls,
                  [...discovered.entries()].map(([url, listing]) => ({ id: null, url, contentHash: null, consecutiveFailures: 0, metadata: { listing: listing.events[0], listingObservations: listing.events } })),
                )
              : orderPersistedDetailTargets(
                  persistedUrls,
                  await prisma.sourceCrawlTarget.findMany({
                    where: { dataSourceId: source.id, url: { in: persistedUrls } },
                    select: { id: true, url: true, contentHash: true, consecutiveFailures: true, metadata: true },
                  }),
                )
            : dryRun && discovered.size
              ? [...discovered.entries()].slice(0, maxDetails).map(([url, listing]) => ({ id: null, url, contentHash: null, consecutiveFailures: 0, metadata: { listing: listing.events[0], listingObservations: listing.events } }))
              : await prisma.sourceCrawlTarget.findMany({
                  where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, OR: [{ nextFetchAt: null }, { nextFetchAt: { lte: now } }] },
                  orderBy: [{ priority: "asc" }, { nextFetchAt: "asc" }, { firstSeenAt: "asc" }],
                  take: maxDetails,
                  select: { id: true, url: true, contentHash: true, consecutiveFailures: true, metadata: true },
                });
          if (!persistedUrls.length && options.jobId) {
            await persistDetailTargetBatch(run.id, run.scope, targets.map((target) => target.url));
          }

          for (const target of targets) {
            try {
              const browserResult = await capture(target.url);
              const extraction = browserResult.extracted as EventfindaExtraction;
              if (extraction.kind !== "event_detail" || extraction.occurrences.length === 0) {
                if (!dryRun) await this.markBrowserEvidenceParserFailure(run.id, browserResult.traceId);
                throw new AdapterError("PARSING_ERROR", `Eventfinda detail returned no occurrences for ${target.url}`, false);
              }
              const listing = jsonRecord(jsonRecord(target.metadata).listing);
              const allEvents = normaliseEventfindaDetail(extraction, listing);
              const events = allEvents.filter((event) => event.endsAt >= from && event.startsAt <= to);
              if (!dryRun) {
                const persistedEvents = await this.persistNormalisedEvents(events, source.id, run.id);
                unchangedEventsSkipped += [...persistedEvents.values()].filter((persisted) => persisted.unchanged).length;
                const detailContentHash = stableHash(extraction);
                const previousUnchangedCount = integerMetadata(target.metadata, "unchangedDetailFetchCount");
                const detailUnchanged = target.contentHash === detailContentHash;
                const unchangedDetailFetchCount = detailUnchanged ? Math.min(4, previousUnchangedCount + 1) : 0;
                if (detailUnchanged) unchangedDetails += 1;
                const refresh = eventfindaRefreshPolicy(allEvents, now, unchangedDetailFetchCount);
                await prisma.sourceCrawlTarget.update({
                  where: { id: target.id! },
                  data: { status: "FETCHED", active: refresh.active, priority: refresh.priority, lastFetchedAt: new Date(), nextFetchAt: refresh.nextFetchAt, contentHash: detailContentHash, httpStatus: 200, consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null, metadata: { ...jsonRecord(target.metadata), eventfindaEventId: extraction.eventId, occurrenceCount: extraction.occurrences.length, lastTitle: extraction.title, listingChanged: false, detailUnchanged, unchangedDetailFetchCount } },
                });
              }
              detailsFetched += 1;
              eventsPersisted += events.length;
            } catch (error) {
              if (error instanceof DeferredJobError) throw error;
              failureCount += 1;
              const isRateLimited = error instanceof AdapterError && error.code === "RATE_LIMITED";
              if (!dryRun && target.id) {
                const failures = target.consecutiveFailures + 1;
                await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { status: isRateLimited ? "RATE_LIMITED" : "FAILED", consecutiveFailures: failures, nextFetchAt: eventfindaFailureBackoff(failures, isRateLimited), lastErrorCode: error instanceof AdapterError ? error.code : "BROWSER_CAPTURE_FAILED", lastErrorAt: new Date() } });
              }
              if (isRateLimited) {
                rateLimited = true;
                const collectionCooldownUntil = eventfindaFailureBackoff(1, true);
                if (!dryRun) await prisma.dataSource.update({ where: { id: source.id }, data: { ...(guardedDevelopmentRun ? {} : { operationalStatus: "DEGRADED" as const, healthStatus: "DEGRADED" as const }), metadata: { ...metadata, collectionCooldownUntil: collectionCooldownUntil.toISOString(), collectionCooldownReason: "RATE_LIMITED_OR_CHALLENGE" } } });
                break;
              }
            }
          }
        }

        return { requests, retryCount, pagesScanned, totalPages, paginationUnverified, listingCards, discovered: discovered.size, duplicateDetailTargetsAvoided, targetsUpserted, detailsFetched, unchangedDetails, eventsPersisted, unchangedEventsSkipped, failureCount, rateLimited };
      }, this.environment.REDIS_URL);

      const status = result.failureCount > 0 ? "PARTIAL" : "SUCCEEDED";
      const governanceAfter = sourceGovernanceSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
      const schedulesAfter = await sourceScheduleSnapshot("eventfinda");
      const finalScope = { ...initialScope, ...result, governanceAfter, governanceUnchanged: stableHash(governanceBefore) === stableHash(governanceAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) };
      await prisma.$transaction([
        prisma.collectionRun.update({ where: { id: run.id }, data: { status, successCount: result.eventsPersisted + result.discovered, failureCount: result.failureCount, errorCode: result.rateLimited ? "RATE_LIMITED" : result.failureCount ? "PARTIAL_FAILURE" : null, errorSummary: result.rateLimited ? "Collection stopped and entered cooldown after a rate limit or access challenge" : null, finishedAt: new Date(), scope: finalScope } }),
        ...(guardedDevelopmentRun ? [] : [prisma.dataSource.update({ where: { id: source.id }, data: { lastSuccessAt: result.pagesScanned || result.detailsFetched ? new Date() : source.lastSuccessAt, healthStatus: result.rateLimited ? "DEGRADED" : "HEALTHY", operationalStatus: result.rateLimited ? "DEGRADED" : "HEALTHY", errorRate: result.requests ? result.failureCount / result.requests : 0 } })]),
      ]);
      if (options.jobId) await settleCancelledCollectionRun(options.jobId);
      await this.syncCollectionIncidentSafely(run.id);
      return { runId: run.id, dryRun, localAcceptance, developmentBootstrap, phase, references: result.pagesScanned, records: result.detailsFetched, events: result.eventsPersisted, signals: 0, ...result };
    } catch (error) {
      if (error instanceof DeferredJobError) throw error;
      if (!dryRun && error instanceof AdapterError && error.code === "RATE_LIMITED") {
        const collectionCooldownUntil = eventfindaFailureBackoff(1, true);
        await prisma.dataSource.update({ where: { id: source.id }, data: { ...(guardedDevelopmentRun ? {} : { operationalStatus: "DEGRADED" as const, healthStatus: "DEGRADED" as const }), metadata: { ...jsonRecord(source.metadata), collectionCooldownUntil: collectionCooldownUntil.toISOString(), collectionCooldownReason: "RATE_LIMITED_OR_CHALLENGE" } } });
      }
      const governanceAfter = sourceGovernanceSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
      const schedulesAfter = await sourceScheduleSnapshot("eventfinda");
      const [requestsAttempted, successfulPages, targetsTouched] = await Promise.all([
        prisma.rawArtifact.count({ where: { collectionRunId: run.id, artifactType: "MANIFEST_JSON" } }),
        prisma.rawArtifact.count({ where: { collectionRunId: run.id, artifactType: "HTML", parserFailure: false } }),
        prisma.sourceCrawlTarget.count({ where: { dataSourceId: source.id, lastSeenAt: { gte: now } } }),
      ]);
      await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: error instanceof AdapterError ? error.code : error instanceof WorkerRequestError ? error.code : "COLLECTION_FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown Eventfinda collection failure", scope: { ...initialScope, failureProgress: { requestsAttempted, successfulPages, targetsTouched }, governanceAfter, governanceUnchanged: stableHash(governanceBefore) === stableHash(governanceAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) }, finishedAt: new Date() } });
      if (options.jobId) await settleCancelledCollectionRun(options.jobId);
      await this.syncCollectionIncidentSafely(run.id);
      throw error;
    }
  }

  private assertEventfindaSourceAllowed(source: Awaited<ReturnType<typeof prisma.dataSource.findUniqueOrThrow>>, localAcceptance = false, developmentBootstrap = false) {
    if (localAcceptance || developmentBootstrap) {
      const mode = developmentBootstrap ? "development bootstrap" : "local acceptance";
      if (this.environment.NODE_ENV !== "development") throw new AdapterError("RIGHTS_BLOCKED", developmentBootstrap ? "Eventfinda development bootstrap is restricted to the development environment" : "Local Eventfinda acceptance is restricted to the development environment", false);
      if (this.environment.SCHEDULER_ENABLED) throw new AdapterError("RIGHTS_BLOCKED", developmentBootstrap ? "Disable the scheduler before Eventfinda development bootstrap" : "Disable the scheduler before local Eventfinda acceptance", false);
      if (!source.enabled || !source.environments.includes("DEVELOPMENT")) throw new AdapterError("RIGHTS_BLOCKED", `Eventfinda is not enabled for ${mode}`, false);
      return;
    }
    if (!source.enabled || source.internalApprovalStatus !== "APPROVED" || source.legalRightsStatus !== "ALLOWED" || !source.rightsAllowStorage || !source.rightsAllowDerivedAnalysis) {
      throw new AdapterError("RIGHTS_BLOCKED", `${source.name} is not approved for collection and derived analysis`, false);
    }
    if (!["HEALTHY", "DEGRADED"].includes(source.operationalStatus)) throw new AdapterError("SOURCE_UNAVAILABLE", `${source.name} is ${source.operationalStatus.toLowerCase()}`, true);
  }

  private async executeEventfindaBrowserTask(dataSourceId: string, collectionRunId: string, url: string, dryRun: boolean, parentJobId?: string) {
    const connectorId = "eventfinda-public" as const;
    const workflowId = /^\/whatson\/events\/new-zealand(?:\/page\/\d+)?\/?$/u.test(new URL(url).pathname)
      ? "collect_listing" as const
      : "collect_detail" as const;
    const traceId = parentJobId
      ? durableArgusTraceId(parentJobId, connectorId, workflowId, url)
      : `eventfinda-${randomUUID()}`;
    let result: BrowserTaskResult;
    if (this.environment.ARGUS_API_BASE_URL && this.environment.ARGUS_API_TOKEN) {
      const input = { traceId, url, connectorId, workflowId };
      const response = parentJobId
        ? await captureBrowserTaskWithDurableArgus(this.environment, input, { parentJobId, collectionRunId, dataSourceId })
        : await captureBrowserTaskWithArgus(this.environment, input);
      if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
      if (!response.ok) throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
      result = response.payload;
    } else {
      const response = await browserWorkerRequest(this.environment, {
        taskType: "read_only_capture", traceId, url, allowedHosts: EVENTFINDA_ALLOWED_HOSTS, extractor: EVENTFINDA_EXTRACTOR, evidenceMode: "html", profileKey: "eventfinda-nz-public-v1",
      });
      const payload = await response.json() as BrowserTaskResult | { error?: string; message?: string };
      if (response.status === 429) throw new AdapterError("RATE_LIMITED", "Browser Worker concurrency limit was reached", true);
      if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", "message" in payload && payload.message ? payload.message : `Browser Worker returned HTTP ${response.status}`, response.status >= 500);
      result = payload as BrowserTaskResult;
    }
    if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) throw new AdapterError("PARSING_ERROR", "Browser capture violated the read-only result contract", false);
    if (!dryRun) await this.persistBrowserEvidence(dataSourceId, collectionRunId, result, EVENTFINDA_EXTRACTOR, url);
    if (result.status === "manual_required") throw new AdapterError("RATE_LIMITED", "Eventfinda presented an access challenge; collection stopped without bypassing it", true);
    if (result.status !== "success") throw new AdapterError(result.error?.category.toUpperCase() === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE", result.error?.message ?? "Eventfinda Browser Worker capture failed", result.error?.retryable ?? true);
    return result;
  }

  private async executeOurAucklandBrowserTask(
    dataSourceId: string,
    collectionRunId: string,
    url: string,
    maxRecords: number,
    dryRun: boolean,
    parentJobId?: string,
  ): Promise<PublicRawRecord[]> {
    const connectorId = "ourauckland-public" as const;
    const capture = async (targetUrl: string, workflowId: "collect_listing" | "collect_detail", boundedRecords?: number) => {
      const traceId = parentJobId
        ? durableArgusTraceId(parentJobId, connectorId, workflowId, targetUrl)
        : `ourauckland-${randomUUID()}`;
      const input = { traceId, url: targetUrl, connectorId, workflowId, ...(boundedRecords === undefined ? {} : { maxRecords: boundedRecords }) };
      const response = parentJobId
        ? await captureBrowserTaskWithDurableArgus(this.environment, input, { parentJobId, collectionRunId, dataSourceId })
        : await captureBrowserTaskWithArgus(this.environment, input);
      if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
      if (!response.ok) throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
      const result = response.payload;
      if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) {
        throw new AdapterError("PARSING_ERROR", "Browser capture violated the read-only result contract", false);
      }
      if (!dryRun) await this.persistBrowserEvidence(dataSourceId, collectionRunId, result, "ourauckland", targetUrl);
      if (result.status === "manual_required") {
        throw new AdapterError("SOURCE_UNAVAILABLE", "OurAuckland presented an access challenge; collection stopped without bypassing it", true);
      }
      if (result.status !== "success") {
        throw new AdapterError(
          result.error?.category.toUpperCase() === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE",
          result.error?.message ?? "OurAuckland Argus capture failed",
          result.error?.retryable ?? true,
        );
      }
      return result;
    };

    const listingResult = await capture(url, "collect_listing", maxRecords);
    const extraction = jsonRecord(listingResult.extracted as Prisma.JsonValue);
    const candidates = Array.isArray(extraction.events)
      ? extraction.events.filter((value): value is Prisma.JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value))
      : [];
    if (candidates.length === 0) throw new AdapterError("PARSING_ERROR", "OurAuckland Argus listing returned no event cards", false);
    const records: PublicRawRecord[] = [];
    for (const event of candidates.slice(0, maxRecords)) {
      const externalId = typeof event.id === "string" ? event.id : "";
      const sourceUrl = typeof event.sourceUrl === "string" ? event.sourceUrl : "";
      if (!externalId || !sourceUrl) continue;
      const detailResult = await capture(sourceUrl, "collect_detail");
      const detail = jsonRecord(detailResult.extracted as Prisma.JsonValue);
      if (detail.kind !== "event_detail" || detail.id !== externalId) {
        if (!dryRun) await this.markBrowserEvidenceParserFailure(collectionRunId, detailResult.traceId);
        throw new AdapterError("PARSING_ERROR", `OurAuckland detail returned an invalid payload for ${sourceUrl}`, false);
      }
      records.push({
        sourceId: "council_calendars",
        externalId,
        payload: {
          provider: "Auckland Council / OurAuckland",
          event: detail,
          listing: event,
          page: typeof extraction.currentPage === "number" ? extraction.currentPage : 1,
        },
        fetchedAt: new Date(),
        fixture: false,
        networkRequestCount: 0,
      });
    }
    if (records.length === 0) throw new AdapterError("PARSING_ERROR", "OurAuckland Argus capture returned no event details", false);
    records[0]!.networkRequestCount = 1 + records.length;
    return records;
  }

  private async executeTicketmasterBrowserTask(dataSourceId: string, collectionRunId: string, url: string, dryRun: boolean, parentJobId?: string) {
    const connectorId = "ticketmaster-public" as const;
    const workflowId = isTicketmasterDetailUrl(url) ? "collect_detail" as const : "collect_listing" as const;
    const traceId = parentJobId
      ? durableArgusTraceId(parentJobId, connectorId, workflowId, url)
      : `ticketmaster-${randomUUID()}`;
    let result: BrowserTaskResult;
    if (this.environment.ARGUS_API_BASE_URL && this.environment.ARGUS_API_TOKEN) {
      const input = { traceId, url, connectorId, workflowId };
      const response = parentJobId
        ? await captureBrowserTaskWithDurableArgus(this.environment, input, { parentJobId, collectionRunId, dataSourceId })
        : await captureBrowserTaskWithArgus(this.environment, input);
      if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
      if (!response.ok) throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
      result = response.payload;
    } else {
      const response = await browserWorkerRequest(this.environment, {
        taskType: "read_only_capture", traceId, url, allowedHosts: TICKETMASTER_ALLOWED_HOSTS, extractor: TICKETMASTER_EXTRACTOR, evidenceMode: "html", challengeSettleMs: isTicketmasterDetailUrl(url) ? 20_000 : 10_000, profileKey: "ticketmaster-nz-public-v1",
      });
      const payload = await response.json() as BrowserTaskResult | { error?: string; message?: string };
      if (response.status === 429) throw new AdapterError("RATE_LIMITED", "Browser Worker concurrency limit was reached", true);
      if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", "message" in payload && payload.message ? payload.message : `Browser Worker returned HTTP ${response.status}`, response.status >= 500);
      result = payload as BrowserTaskResult;
    }
    if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) throw new AdapterError("PARSING_ERROR", "Browser capture violated the read-only result contract", false);
    if (!dryRun) await this.persistBrowserEvidence(dataSourceId, collectionRunId, result, TICKETMASTER_EXTRACTOR, url);
    if (result.status === "manual_required") throw new AdapterError("RATE_LIMITED", "Ticketmaster presented an access challenge; collection stopped without bypassing it", true);
    if (result.status !== "success") throw new AdapterError(result.error?.category.toUpperCase() === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE", result.error?.message ?? "Ticketmaster Browser Worker capture failed", result.error?.retryable ?? true);
    return result;
  }

  private async executeRbnzFxBrowserTask(dataSourceId: string, collectionRunId: string, dryRun: boolean, parentJobId?: string) {
    const connectorId = "rbnz-fx" as const;
    const workflowId = "collect_exchange_rates" as const;
    const traceId = parentJobId
      ? durableArgusTraceId(parentJobId, connectorId, workflowId, RBNZ_FX_URL)
      : `rbnz-fx-${randomUUID()}`;
    let result: BrowserTaskResult;
    if (this.environment.ARGUS_API_BASE_URL && this.environment.ARGUS_API_TOKEN) {
      const input = { traceId, url: RBNZ_FX_URL, connectorId, workflowId };
      const response = parentJobId
        ? await captureBrowserTaskWithDurableArgus(this.environment, input, { parentJobId, collectionRunId, dataSourceId })
        : await captureBrowserTaskWithArgus(this.environment, input);
      if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
      if (!response.ok) throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
      result = response.payload;
    } else {
      const response = await browserWorkerRequest(this.environment, {
        taskType: "read_only_capture", traceId, url: RBNZ_FX_URL, allowedHosts: RBNZ_FX_ALLOWED_HOSTS, extractor: RBNZ_FX_EXTRACTOR, evidenceMode: "html", profileKey: "rbnz-nz-public-v1",
      });
      const payload = await response.json() as BrowserTaskResult | { error?: string; message?: string };
      if (response.status === 429) throw new AdapterError("RATE_LIMITED", "Browser Worker concurrency limit was reached", true);
      if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", "message" in payload && payload.message ? payload.message : `Browser Worker returned HTTP ${response.status}`, response.status >= 500);
      result = payload as BrowserTaskResult;
    }
    if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) throw new AdapterError("PARSING_ERROR", "Browser capture violated the read-only result contract", false);
    if (!dryRun) await this.persistBrowserEvidence(dataSourceId, collectionRunId, result, RBNZ_FX_EXTRACTOR, RBNZ_FX_URL);
    if (result.status === "manual_required") throw new AdapterError("RATE_LIMITED", "RBNZ presented an access challenge; collection stopped without bypassing it", true);
    if (result.status !== "success") throw new AdapterError(result.error?.category.toUpperCase() === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE", result.error?.message ?? "RBNZ Browser Worker capture failed", result.error?.retryable ?? true);
    return result;
  }

  private async persistBrowserEvidence(dataSourceId: string, collectionRunId: string, result: BrowserTaskResult, extractor = "neutral", requestedUrl?: string) {
    const ttlHours = eventfindaEvidenceTtlHours(
      result.status,
      this.environment.RAW_ARTIFACT_TTL_HOURS,
      this.environment.RAW_ARTIFACT_FAILURE_TTL_HOURS,
    );
    for (const artifact of result.evidence) {
      const storageRef = artifact.storageRef ?? `browser-evidence:${artifact.relativePath}`;
      const id = stableId("browser-evidence", `${collectionRunId}:${storageRef}`);
      await prisma.rawArtifact.upsert({
        where: { id },
        create: { id, collectionRunId, dataSourceId, artifactType: artifact.kind.toUpperCase(), storageRef, contentHash: artifact.sha256, payload: { traceId: artifact.traceId, kind: artifact.kind, sizeBytes: artifact.sizeBytes, page: result.page, extractor, requestedUrl: requestedUrl ?? result.page?.finalUrl ?? null } as Prisma.InputJsonValue, containsSensitiveData: artifact.containsSensitiveData, parserFailure: result.status !== "success", expiresAt: new Date(Date.now() + ttlHours * 3_600_000) },
        update: {},
      });
    }
  }

  private async markBrowserEvidenceParserFailure(collectionRunId: string, traceId: string) {
    await prisma.rawArtifact.updateMany({
      where: {
        collectionRunId,
        OR: [
          { storageRef: { startsWith: `browser-evidence:${traceId}/` } },
          { storageRef: { startsWith: `argus-evidence:results/argus/${traceId}/` } },
        ],
      },
      data: { parserFailure: true, expiresAt: new Date(Date.now() + this.environment.RAW_ARTIFACT_FAILURE_TTL_HOURS * 3_600_000) },
    });
    if (!this.environment.BROWSER_WORKER_INTERNAL_URL || !this.environment.BROWSER_WORKER_TOKEN) return;
    try {
      await fetch(new URL("/internal/browser-evidence/parser-failure", this.environment.BROWSER_WORKER_INTERNAL_URL!), {
        method: "POST",
        headers: { authorization: `Bearer ${this.environment.BROWSER_WORKER_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ traceId }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {}
  }

  async browserHealth() {
    if (!this.environment.BROWSER_WORKER_INTERNAL_URL) {
      return { healthy: false, mode: "unconfigured", message: "Browser worker URL is not configured" };
    }
    const startedAt = Date.now();
    try {
      const response = await fetch(new URL("/internal/health", this.environment.BROWSER_WORKER_INTERNAL_URL), {
        signal: AbortSignal.timeout(Math.min(this.environment.BROWSER_WORKER_TIMEOUT_MS, 5_000)),
      });
      if (!response.ok) throw new Error(`Browser worker health returned HTTP ${response.status}`);
      return { healthy: true, mode: "ulixee", latencyMs: Date.now() - startedAt, ...(await response.json() as Record<string, unknown>) };
    } catch (error) {
      return { healthy: false, mode: "ulixee", latencyMs: Date.now() - startedAt, message: error instanceof Error ? error.message : "Browser worker health failed" };
    }
  }

  async captureBrowserPage(sourceKey: string, url: string, options: { dryRun?: boolean } = {}) {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
    const allowedHosts = jsonStringArray(source.supportedDomains);
    if (!source.enabled || source.internalApprovalStatus !== "APPROVED" || source.legalRightsStatus !== "ALLOWED" || !source.rightsAllowStorage) {
      throw new WorkerRequestError("RIGHTS_BLOCKED", `${source.name} is not approved for browser evidence collection`, 403);
    }
    if (source.operationalStatus !== "HEALTHY") throw new WorkerRequestError("SOURCE_UNAVAILABLE", `${source.name} is ${source.operationalStatus.toLowerCase()}`, 503);
    if (!allowedHosts.length) throw new WorkerRequestError("SOURCE_DOMAIN_MISSING", `${source.name} has no approved browser domains`, 422);
    if (source.dailyBudget > 0) {
      const usedToday = await prisma.collectionRun.count({ where: { dataSourceId: source.id, createdAt: { gte: startOfUtcDay(new Date()) }, status: { not: "CANCELLED" } } });
      if (usedToday >= source.dailyBudget) throw new WorkerRequestError("SOURCE_DAILY_BUDGET_EXCEEDED", `${source.name} reached its daily browser collection budget`, 429);
    }
    if (!this.environment.BROWSER_WORKER_INTERNAL_URL || !this.environment.BROWSER_WORKER_TOKEN) {
      throw new WorkerRequestError("BROWSER_WORKER_UNCONFIGURED", "Browser worker is not configured", 503);
    }

    const traceId = `capture-${randomUUID()}`;
    const run = await prisma.collectionRun.create({
      data: {
        dataSourceId: source.id,
        mode: "ON_DEMAND",
        status: "RUNNING",
        scope: { sourceKey, url: redactUrlForStorage(url), taskType: "read_only_capture", dryRun: options.dryRun === true },
        startedAt: new Date(),
        attemptCount: 1,
        correlationId: traceId,
        isDemo: source.isDemo,
      },
    });

    try {
      const response = await fetch(new URL("/internal/browser-tasks", this.environment.BROWSER_WORKER_INTERNAL_URL), {
        method: "POST",
        headers: { authorization: `Bearer ${this.environment.BROWSER_WORKER_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ taskType: "read_only_capture", traceId, url, allowedHosts, profileKey: browserProfileKey(sourceKey) }),
        signal: AbortSignal.timeout(this.environment.BROWSER_WORKER_TIMEOUT_MS + 15_000),
      });
      const payload = await response.json() as BrowserTaskResult | { error?: string; message?: string };
      if (!response.ok) throw new WorkerRequestError("BROWSER_TASK_REJECTED", "message" in payload && payload.message ? payload.message : `Browser worker returned HTTP ${response.status}`, response.status);
      const result = payload as BrowserTaskResult;
      if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) throw new Error("Browser worker violated the read-only result contract");
      if (!options.dryRun) {
        for (const artifact of result.evidence) {
          await prisma.rawArtifact.create({
            data: {
              collectionRunId: run.id,
              dataSourceId: source.id,
              artifactType: artifact.kind.toUpperCase(),
              storageRef: `browser-evidence:${artifact.relativePath}`,
              contentHash: artifact.sha256,
              payload: { traceId: artifact.traceId, kind: artifact.kind, sizeBytes: artifact.sizeBytes, page: result.page } as Prisma.InputJsonValue,
              containsSensitiveData: artifact.containsSensitiveData,
              parserFailure: result.status !== "success",
              expiresAt: new Date(Date.now() + this.environment.RAW_ARTIFACT_TTL_HOURS * 3_600_000),
            },
          });
        }
      }
      const succeeded = result.status === "success";
      await prisma.collectionRun.update({
        where: { id: run.id },
        data: {
          status: succeeded ? "SUCCEEDED" : result.status === "manual_required" ? "PARTIAL" : "FAILED",
          successCount: succeeded ? 1 : 0,
          failureCount: succeeded ? 0 : 1,
          errorCode: succeeded ? null : result.status === "manual_required" ? "MANUAL_REQUIRED" : result.error?.category ?? "BROWSER_CAPTURE_FAILED",
          errorSummary: succeeded ? null : result.manualRequired?.reason ?? result.error?.message?.slice(0, 1_000) ?? "Browser capture failed",
          finishedAt: new Date(),
        },
      });
      await this.syncCollectionIncidentSafely(run.id);
      return { runId: run.id, dryRun: options.dryRun === true, ...result };
    } catch (error) {
      await prisma.collectionRun.update({
        where: { id: run.id },
        data: { status: "FAILED", failureCount: 1, errorCode: error instanceof WorkerRequestError ? error.code : "BROWSER_CAPTURE_FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown browser capture failure", finishedAt: new Date() },
      });
      await this.syncCollectionIncidentSafely(run.id);
      throw error;
    }
  }

  private async syncCollectionIncidentSafely(collectionRunId: string) {
    try {
      await syncCollectionIncident(collectionRunId);
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ service: "tymra-worker", event: "collection_incident_sync_failed", collectionRunId, message: error instanceof Error ? error.message : "Unknown incident sync failure" })}\n`);
    }
  }

  async sourceHealth(sourceId?: string) {
    const selected = sourceId ? { [sourceId]: otaAdapters[sourceId] ?? this.publicAdapters[sourceId] } : { ...otaAdapters, ...this.publicAdapters };
    const results = [];
    for (const [key, adapter] of Object.entries(selected)) {
      if (!adapter) continue;
      const context = key in this.publicAdapters ? this.publicAdapterContext() : this.adapterContext();
      const health = await adapter.healthCheck(context);
      const source = await prisma.dataSource.findUnique({ where: { key } });
      if (source) {
        await prisma.$transaction([
          prisma.sourceHealthCheck.create({ data: { dataSourceId: source.id, status: health.status, message: health.message, latencyMs: health.latencyMs, metadata: { mode: health.mode } } }),
          prisma.dataSource.update({ where: { id: source.id }, data: { operationalStatus: health.status, healthStatus: health.status === "HEALTHY" ? "HEALTHY" : health.status === "DOWN" || health.status === "BLOCKED" ? "DOWN" : "DEGRADED", healthSummary: { message: health.message, checkedAt: health.checkedAt, mode: health.mode }, lastSuccessAt: health.status === "HEALTHY" ? health.checkedAt : source.lastSuccessAt } }),
        ]);
      }
      results.push({ sourceId: key, ...health, rights: adapter.rightsMetadata() });
    }
    return results;
  }

  async retentionCleanup(now = new Date()) {
    const [artifacts, anonymousChecks, magicLinks] = await prisma.$transaction([
      prisma.rawArtifact.updateMany({ where: { expiresAt: { lte: now }, deletedAt: null }, data: { deletedAt: now, storageRef: "DELETED", payload: Prisma.JsonNull } }),
      prisma.anonymousCheck.deleteMany({ where: { expiresAt: { lte: now }, magicLinks: { none: { status: "PENDING" } } } }),
      prisma.magicLink.updateMany({ where: { expiresAt: { lte: now }, status: "PENDING" }, data: { status: "EXPIRED" } }),
    ]);
    return { rawArtifactsDeleted: artifacts.count, anonymousChecksDeleted: anonymousChecks.count, magicLinksExpired: magicLinks.count };
  }

  async approveSource(sourceId: string) {
    return prisma.dataSource.update({ where: { key: sourceId }, data: { internalApprovalStatus: "APPROVED", lifecycle: "PILOT", approvedBy: "Harold", approvedAt: new Date(), lastReviewedAt: new Date() } });
  }

  async activateSource(sourceId: string, input: ActivateSourceRequest) {
    const adapter = this.publicAdapters[sourceId];
    if (!adapter) throw new WorkerRequestError("SOURCE_NOT_FOUND", `No public adapter exists for ${sourceId}`, 404);
    const approvedBy = input.approvedBy.trim();
    const licenseBasis = input.licenseBasis.trim();
    if (approvedBy.length < 2) throw new WorkerRequestError("INVALID_APPROVER", "An approving operator is required", 422);
    if (licenseBasis.length < 10) throw new WorkerRequestError("INVALID_LICENSE_BASIS", "A specific source usage-rights basis is required", 422);
    const health = await adapter.healthCheck(this.publicAdapterContext());
    if (health.status !== "HEALTHY") throw new WorkerRequestError("SOURCE_UNAVAILABLE", `Source cannot be activated: ${health.message}`, 503);
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceId } });
    const allowDisplay = input.allowDisplay === true;
    return prisma.$transaction(async (transaction) => {
      await transaction.sourceHealthCheck.create({ data: { dataSourceId: source.id, status: health.status, message: health.message, latencyMs: health.latencyMs, metadata: { mode: health.mode, activationCheck: true } } });
      return transaction.dataSource.update({
        where: { id: source.id },
        data: {
          lifecycle: "PILOT",
          internalApprovalStatus: "APPROVED",
          legalRightsStatus: "ALLOWED",
          operationalStatus: "HEALTHY",
          status: "PILOT",
          healthStatus: "HEALTHY",
          enabled: true,
          allowedUsage: ["COLLECTION", "NORMALISATION", "DERIVED_ANALYSIS", ...(allowDisplay ? ["ATTRIBUTED_DISPLAY"] : [])],
          displayPermission: allowDisplay,
          derivedAnalysisPermission: true,
          rightsAllowStorage: true,
          rightsAllowDerivedAnalysis: true,
          rightsAllowDisplay: allowDisplay,
          licenseBasis,
          approvedBy,
          approvedAt: new Date(),
          lastReviewedAt: new Date(),
          lastSuccessAt: health.checkedAt,
          healthSummary: { message: health.message, checkedAt: health.checkedAt, mode: health.mode, activationCheck: true },
          metadata: { ...jsonRecord(source.metadata), activation: { approvedBy, activatedAt: new Date().toISOString(), allowDisplay } },
        },
      });
    });
  }

  async refreshCatalog(marketScope: string) {
    const [properties, units, listings] = await Promise.all([
      prisma.property.count({ where: { status: "ACTIVE", mergedIntoId: null } }),
      prisma.sellableUnit.count({ where: { status: "ACTIVE", mergedIntoId: null } }),
      prisma.listing.count({ where: { listingStatus: "ACTIVE" } }),
    ]);
    return { marketScope, properties, units, listings, refreshedAt: new Date() };
  }

  async refreshPanel(membershipType: "ANCHOR" | "ROTATING", marketScope: string) {
    const members = await prisma.panelMembership.findMany({ where: { membershipType, active: true }, select: { marketKey: true, coverage24h: true, coverage72h: true } });
    const byMarket = new Map<string, typeof members>();
    for (const member of members) byMarket.set(member.marketKey, [...(byMarket.get(member.marketKey) ?? []), member]);
    for (const [marketKey, marketMembers] of byMarket) {
      await prisma.marketCoverage.updateMany({ where: { key: marketKey }, data: { coverage24h: average(marketMembers.map((member) => member.coverage24h)) ?? 0, coverage72h: average(marketMembers.map((member) => member.coverage72h)) ?? 0, lastHealthAt: new Date() } });
    }
    return { marketScope, membershipType, activeMembers: members.length, markets: byMarket.size };
  }

  async suspendSource(sourceId: string) {
    return prisma.dataSource.update({ where: { key: sourceId }, data: { internalApprovalStatus: "SUSPENDED", lifecycle: "SUSPENDED", enabled: false, lastReviewedAt: new Date() } });
  }

  async setEventfindaSchedules(enabled: boolean) {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "eventfinda" } });
    if (enabled) this.assertEventfindaSourceAllowed(source);
    const keys = ["eventfinda-discovery-daily", "eventfinda-details-hourly"];
    const result = await prisma.scheduleDefinition.updateMany({ where: { key: { in: keys } }, data: { enabled, nextRunAt: enabled ? new Date() : null } });
    if (result.count !== keys.length) throw new WorkerRequestError("SCHEDULES_MISSING", "Run the database seed before configuring Eventfinda schedules", 409);
    return prisma.scheduleDefinition.findMany({ where: { key: { in: keys } }, orderBy: { key: "asc" } });
  }

  async setTicketmasterSchedules(enabled: boolean) {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "ticketmaster" } });
    if (enabled) this.assertTicketmasterSourceAllowed(source, false);
    const keys = ["ticketmaster-discovery-daily", "ticketmaster-details-six-hour"];
    const result = await prisma.scheduleDefinition.updateMany({ where: { key: { in: keys } }, data: { enabled, nextRunAt: enabled ? new Date() : null } });
    if (result.count !== keys.length) throw new WorkerRequestError("SCHEDULES_MISSING", "Run the database seed before configuring Ticketmaster schedules", 409);
    return prisma.scheduleDefinition.findMany({ where: { key: { in: keys } }, orderBy: { key: "asc" } });
  }

  async enqueueOperationalJob(type: "CATALOG_DISCOVERY" | "MARKET_COVERAGE_COLLECTION" | "ANCHOR_PANEL_COLLECTION" | "ROTATING_PANEL_COLLECTION", payload: Prisma.InputJsonValue = {}) {
    return enqueueJob({ type, payload, idempotencyKey: `cli:${type}:${new Date().toISOString().slice(0, 10)}` });
  }

  async health() {
    const [database, redis, queueDepth, failedJobs, sources, jobMetrics, cacheMetrics, emailMetrics, coverage, browser] = await Promise.all([
      prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`.then(() => ({ healthy: true, message: "connected" })).catch((error: unknown) => ({ healthy: false, message: error instanceof Error ? error.message : "database failed" })),
      redisHealth(this.environment.REDIS_URL),
      prisma.job.count({ where: { status: "PENDING" } }),
      prisma.job.count({ where: { status: { in: ["FAILED", "DEAD_LETTER"] } } }),
      prisma.dataSource.groupBy({ by: ["operationalStatus"], _count: { _all: true } }),
      prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.workerAnalysisRequest.groupBy({ by: ["cacheHitType"], _count: { _all: true } }),
      prisma.emailDelivery.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.marketCoverage.findMany({ select: { key: true, coverage24h: true, coverage72h: true, competitorCoverage: true, collectionSuccessRate: true, sourceFailureRate: true } }),
      this.browserHealth(),
    ]);
    return {
      process: { healthy: true, pid: process.pid, uptimeSeconds: process.uptime() },
      database,
      redis,
      queue: { healthy: database.healthy, depth: queueDepth, failed: failedJobs },
      browser,
      sources,
      scheduler: { healthy: true, enabled: this.environment.SCHEDULER_ENABLED },
      retention: { healthy: true, rawArtifactTtlHours: this.environment.RAW_ARTIFACT_TTL_HOURS },
      metrics: { jobs: jobMetrics, cache: cacheMetrics, email: emailMetrics, coverage },
    };
  }

  private async createRequest(input: CreateWorkerRequest, isPreview: boolean) {
    const existing = await prisma.workerAnalysisRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return this.getAnalysis(existing.id);
    if (!input.input.trim()) throw new WorkerRequestError("INVALID_INPUT", "Input is required", 422);

    const correlationId = randomUUID();
    const identity = await this.resolveAndPersistInput(input.input, correlationId, input.locale ?? "en");
    const normalizedEmail = input.email?.trim().toLowerCase();
    const emailHash = normalizedEmail ? hashPersonalIdentifier(normalizedEmail, this.environment.ACCESS_KEY_SECRET) : null;
    const encryptedEmail = normalizedEmail ? encryptPersonalData(normalizedEmail, this.environment.DATA_ENCRYPTION_KEY) : null;
    const candidates = identity.units.map((unit) => unit.id);
    const uniqueUnit = candidates.length === 1 ? candidates[0] : null;
    const listing = uniqueUnit ? identity.listings.find((item) => item.unitId === uniqueUnit)! : null;
    await this.enforceWorkerLimits(input, isPreview, uniqueUnit);
    const request = await prisma.workerAnalysisRequest.create({
      data: { rawInput: input.input, inputType: looksLikeUrl(input.input) ? "OTA_URL" : looksLikeAddress(input.input) ? "ADDRESS" : "PROPERTY_NAME", locale: input.locale ?? "en", emailHash, encryptedEmail, serviceConsent: input.serviceConsent ?? false, marketingConsent: input.marketingConsent ?? false, propertyId: identity.property.id, sellableUnitId: uniqueUnit, targetListingId: listing?.id, dataSourceId: identity.source.id, status: uniqueUnit ? "QUEUED" : "NEEDS_CONFIRMATION", idempotencyKey: input.idempotencyKey, correlationId, confirmationCandidates: candidates, isPreview, isFixture: identity.fixture },
    });
    await this.recordWorkerUsage(request, input, isPreview);

    if (!isPreview) await this.createBackingPriceCheck(request);
    if (uniqueUnit) {
      const refreshed = await prisma.workerAnalysisRequest.findUniqueOrThrow({ where: { id: request.id } });
      await this.ensureQueryPlan(refreshed);
      await this.enqueueCollection(refreshed);
    }
    return this.getAnalysis(request.id);
  }

  private async resolveAndPersistInput(input: string, correlationId: string, locale: "en" | "zh") {
    const fixture = this.fixtureEnabled();
    let adapter: OtaAdapter | null = getOtaAdapterForInput(input);
    let resolvedInput = input;
    if (!adapter && fixture) {
      adapter = otaAdapters.booking;
      const slug = input.toLowerCase().includes("multiple") || input.toLowerCase().includes("hotel") || input.toLowerCase().includes("motel") ? `fixture-multi-hotel-${stableId("input", input).slice(-8)}` : `fixture-property-${stableId("input", input).slice(-8)}`;
      resolvedInput = `https://www.booking.com/hotel/nz/${slug}.html`;
    }
    if (!adapter) throw new WorkerRequestError("SOURCE_UNAVAILABLE", "Property/address discovery requires an approved configured source", 503);
    const context: AdapterContext = { mode: fixture ? "fixture" : "live", correlationId, locale, currency: "NZD" };
    let resolved: ResolvedOtaListing;
    try { resolved = await adapter.resolveListing(resolvedInput, context); }
    catch (error) {
      if (error instanceof AdapterError) throw new WorkerRequestError(error.code, error.message, error.code === "INVALID_INPUT" ? 422 : 503);
      throw error;
    }
    const source = await prisma.dataSource.findUnique({ where: { key: resolved.sourceId } });
    if (!source) throw new WorkerRequestError("SOURCE_UNAVAILABLE", `SourceRegistry is missing ${resolved.sourceId}; run the seed`, 503);
    const propertyId = stableId("property", resolved.property.externalId);
    const property = await prisma.property.upsert({
      where: { id: propertyId },
      create: { id: propertyId, canonicalName: resolved.property.canonicalName, legalOrBrandName: resolved.property.canonicalName, address: resolved.property.address, city: "Christchurch", countryCode: "NZ", latitude: resolved.property.latitude, longitude: resolved.property.longitude, region: resolved.property.region, territorialAuthority: resolved.property.territorialAuthority, rto: "ChristchurchNZ", postcode: resolved.property.postcode, microMarket: "Christchurch Central", timezone: "Pacific/Auckland", accommodationType: resolved.property.propertyType, supportStatus: "SUPPORTED", identityConfidence: resolved.matchConfidence, status: "ACTIVE", isDemo: fixture },
      update: { canonicalName: resolved.property.canonicalName, address: resolved.property.address, identityConfidence: resolved.matchConfidence, status: "ACTIVE" },
    });
    const units = [];
    const listings = [];
    for (const unit of resolved.units) {
      const unitId = stableId("unit", `${resolved.sourceId}:${resolved.sourceListingId}:${unit.externalId}`);
      const persistedUnit = await prisma.sellableUnit.upsert({
        where: { id: unitId },
        create: { id: unitId, propertyId: property.id, canonicalName: unit.canonicalName, officialName: unit.sourceUnitName, capacity: unit.occupancyCapacity, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms, bedTypes: unit.beds, bedConfiguration: unit.beds, amenities: unit.amenities, accessibilityAttributes: [], unitType: unit.unitType, entireOrShared: unit.entireOrShared, status: "ACTIVE", version: 1, isDemo: fixture },
        update: { canonicalName: unit.canonicalName, officialName: unit.sourceUnitName, capacity: unit.occupancyCapacity, status: "ACTIVE" },
      });
      const externalId = resolved.units.length === 1 ? resolved.sourceListingId : `${resolved.sourceListingId}:${unit.externalId}`;
      const persistedListing = await prisma.listing.upsert({
        where: { dataSourceId_externalId: { dataSourceId: source.id, externalId } },
        create: { propertyId: property.id, unitId: persistedUnit.id, dataSourceId: source.id, platform: resolved.sourceId.toUpperCase(), externalId, sourceListingId: resolved.sourceListingId, canonicalUrl: resolved.canonicalUrl, rawUrl: input, url: resolved.canonicalUrl, platformUnitName: unit.sourceUnitName, lastConfirmedAt: new Date(), onlineStatus: "ONLINE", listingStatus: "ACTIVE", matchConfidence: resolved.matchConfidence, legalRightsStatus: source.legalRightsStatus, operationalStatus: resolved.operationalStatus, metadata: { adapterKey: adapter.metadata.adapterKey, fixture }, isDemo: fixture },
        update: { propertyId: property.id, unitId: persistedUnit.id, canonicalUrl: resolved.canonicalUrl, rawUrl: input, platformUnitName: unit.sourceUnitName, lastConfirmedAt: new Date(), onlineStatus: "ONLINE", listingStatus: "ACTIVE", matchConfidence: resolved.matchConfidence, operationalStatus: resolved.operationalStatus },
      });
      units.push(persistedUnit);
      listings.push(persistedListing);
    }
    return { source, property, units, listings, fixture };
  }

  private async createBackingPriceCheck(request: WorkerAnalysisRequest) {
    if (!request.emailHash || !request.encryptedEmail) throw new Error("Formal analysis is missing email identity");
    const start = tomorrow();
    const stayQuery = await prisma.stayQuery.create({ data: { checkIn: start, checkOut: new Date(start.getTime() + 86_400_000), nights: 1, adults: 2, children: 0, childrenAges: [], units: 1, unitConstraints: {}, mealPlan: "ANY_PUBLIC", currency: "NZD", cancellationCategory: "STANDARD", cancellationPolicy: "ANY_PUBLIC", ratePlan: "PUBLIC", taxAndFeePolicy: "MANDATORY_INCLUDED", publicRateContext: "PUBLIC_ANONYMOUS", querySemanticsVersion: "v1", timezone: "Pacific/Auckland", reason: "Worker Baseline default formal analysis" } });
    const accessToken = randomBytes(32).toString("base64url");
    const check = await prisma.priceCheck.create({ data: { rawInput: request.rawInput, locale: request.locale, emailHash: request.emailHash, encryptedEmail: request.encryptedEmail, serviceConsent: true, marketingConsent: request.marketingConsent, propertyId: request.propertyId, unitId: request.sellableUnitId, stayQueryId: stayQuery.id, marketKey: "christchurch", status: request.status === "NEEDS_CONFIRMATION" ? "NEEDS_CONFIRMATION" : "QUEUED", accessKeyHash: hashOpaqueToken(accessToken, this.environment.ACCESS_KEY_SECRET), idempotencyKey: `${request.idempotencyKey}:price-check`, rulesVersion: "worker-baseline-v1", isDemo: request.isFixture } });
    await prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { priceCheckId: check.id } });
  }

  private async ensureQueryPlan(request: WorkerAnalysisRequest & { queryPlans?: unknown[] }) {
    const existing = await prisma.queryPlan.findFirst({ where: { analysisRequestId: request.id }, orderBy: { version: "desc" } });
    if (existing) return existing;
    if (!request.targetListingId || !request.sellableUnitId) throw new WorkerRequestError("UNIT_UNCONFIRMED", "A specific Sellable Unit and Listing are required", 409);
    const dateBasket = request.isPreview ? buildNationalDateBasket(new Date()).slice(0, 2) : buildFormalThirtyDayDates(new Date());
    const firstDate = new Date(`${dateBasket[0].checkIn}T00:00:00.000Z`);
    const stayQuery = await prisma.stayQuery.create({ data: { checkIn: firstDate, checkOut: new Date(firstDate.getTime() + 86_400_000), nights: 1, adults: 2, children: 0, childrenAges: [], units: 1, unitConstraints: {}, mealPlan: "ANY_PUBLIC", currency: "NZD", cancellationCategory: "STANDARD", cancellationPolicy: "ANY_PUBLIC", ratePlan: "PUBLIC", taxAndFeePolicy: "MANDATORY_INCLUDED", publicRateContext: "PUBLIC_ANONYMOUS", querySemanticsVersion: "v1", timezone: "Pacific/Auckland", reason: request.isPreview ? "Anonymous preliminary date basket" : "Formal 30-day date basket" } });
    const signature = createQuerySignature({ sourceId: request.dataSourceId!, listingId: request.targetListingId, sellableUnitId: request.sellableUnitId, checkIn: firstDate, nights: 1, adults: 2, childrenAges: [], units: 1, unitConstraints: {}, mealPlan: "ANY_PUBLIC", cancellationPolicy: "ANY_PUBLIC", ratePlan: "PUBLIC", currency: "NZD", taxAndFeePolicy: "MANDATORY_INCLUDED", collectionProfileId: collectionProfileKey, publicRateContext: "PUBLIC_ANONYMOUS", querySemanticsVersion: "v1" });
    await prisma.stayQuery.update({ where: { id: stayQuery.id }, data: { querySignatureHash: signature.hash } });
    return prisma.queryPlan.create({ data: { analysisRequestId: request.id, priceCheckId: request.priceCheckId, stayQueryId: stayQuery.id, dataSourceId: request.dataSourceId, version: 1, dateBasket: dateBasket as unknown as Prisma.InputJsonValue, querySignatureHash: signature.hash, querySignaturePayload: signature.payload as unknown as Prisma.InputJsonValue, collectionProfileKey, generationPolicyVersion: request.isPreview ? "preview-plan-v1" : "formal-30-day-plan-v1", freshnessPolicyVersion: "freshness-v1" } });
  }

  private async enqueueCollection(request: WorkerAnalysisRequest) {
    await this.enqueueWorkerJob(request, "RATE_COLLECTION", {}, "rate-collection");
  }

  private async enqueueWorkerJob(request: Pick<WorkerAnalysisRequest, "id" | "correlationId" | "priceCheckId" | "targetListingId" | "sellableUnitId">, type: Parameters<typeof enqueueJob>[0]["type"], payload: Record<string, unknown>, suffix: string) {
    return enqueueJob({ type, payload: { ...payload, analysisRequestId: request.id }, idempotencyKey: `${request.id}:${suffix}`, analysisRequestId: request.id, priceCheckId: request.priceCheckId ?? undefined, correlationId: request.correlationId, listingId: request.targetListingId ?? undefined, sellableUnitId: request.sellableUnitId ?? undefined });
  }

  private async requireReadyIdentity(id: string) {
    const request = await prisma.workerAnalysisRequest.findUniqueOrThrow({ where: { id }, include: { queryPlans: { orderBy: { version: "desc" }, take: 1 } } });
    if (!request.propertyId || !request.sellableUnitId || !request.targetListingId) throw new WorkerRequestError("UNIT_UNCONFIRMED", "Property, Sellable Unit and OTA Listing must be confirmed", 409);
    if (request.status === "CANCELLED") throw new WorkerRequestError("CANCELLED", "The analysis was cancelled", 409);
    return request;
  }

  private async setStatus(request: Pick<WorkerAnalysisRequest, "id" | "priceCheckId">, status: WorkerAnalysisStatus) {
    await prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { status } });
    if (!request.priceCheckId) return;
    const mapped = mapWorkerStatusToPriceCheck(status);
    if (mapped) await prisma.priceCheck.update({ where: { id: request.priceCheckId }, data: { status: mapped } });
  }

  private async failBusiness(request: Pick<WorkerAnalysisRequest, "id" | "priceCheckId">, status: "INSUFFICIENT_DATA" | "SOURCE_UNAVAILABLE" | "PARTIAL", code: string, message: string) {
    await prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { status, failureCode: code, failureMessage: message, completedAt: new Date() } });
    if (request.priceCheckId) await prisma.priceCheck.update({ where: { id: request.priceCheckId }, data: { status } });
  }

  private async requireFixtureSource() {
    const source = await prisma.dataSource.findUnique({ where: { key: fixtureSourceKey } });
    if (!source || !source.enabled || source.internalApprovalStatus !== "APPROVED" || source.legalRightsStatus !== "ALLOWED" || source.operationalStatus !== "HEALTHY") throw new WorkerRequestError("SOURCE_UNAVAILABLE", "Approved development fixture source is unavailable", 503);
    return source;
  }

  private async ensureCollectionProfile(request: WorkerAnalysisRequest, dataSourceId: string) {
    return prisma.collectionProfile.upsert({ where: { key: collectionProfileKey }, create: { key: collectionProfileKey, sellableUnitId: request.sellableUnitId, dataSourceId, ipRegion: "NZ", locale: request.locale === "zh" ? "zh-NZ" : "en-NZ", currency: "NZD", deviceType: "DESKTOP", loggedInState: "LOGGED_OUT", memberState: "NON_MEMBER", mobilePriceContext: "STANDARD", publicRateContext: "APPROVED_DEVELOPMENT_FIXTURE", browserProfileVersion: "fixture-browser-v1" }, update: {} });
  }

  private async ensureFixtureCompetitors(targetUnitId: string, count = 8) {
    const source = await this.requireFixtureSource();
    const target = await prisma.sellableUnit.findUniqueOrThrow({ where: { id: targetUnitId }, include: { property: true } });
    const result = [];
    for (let index = 1; index <= count; index += 1) {
      const propertyId = stableId("fixture-competitor-property", `${target.propertyId}:${index}`);
      const unitId = stableId("fixture-competitor-unit", `${targetUnitId}:${index}`);
      const property = await prisma.property.upsert({ where: { id: propertyId }, create: { id: propertyId, canonicalName: `Fixture Comparable Property ${index}`, address: `${100 + index} Fixture Market Street, Christchurch 8011`, city: "Christchurch", countryCode: "NZ", latitude: (target.property.latitude ?? -43.5321) + index / 10_000, longitude: (target.property.longitude ?? 172.6362) + index / 10_000, region: "Canterbury", territorialAuthority: "Christchurch City", rto: "ChristchurchNZ", postcode: "8011", microMarket: target.property.microMarket ?? "Christchurch Central", timezone: "Pacific/Auckland", accommodationType: target.property.accommodationType, supportStatus: "SUPPORTED", identityConfidence: 1, status: "ACTIVE", isDemo: true }, update: {} });
      const unit = await prisma.sellableUnit.upsert({ where: { id: unitId }, create: { id: unitId, propertyId: property.id, canonicalName: `Fixture Comparable Unit ${index}`, officialName: `Fixture Comparable Unit ${index}`, capacity: target.capacity, bedrooms: target.bedrooms, bathrooms: target.bathrooms, bedTypes: inputJson(target.bedTypes, []), bedConfiguration: inputJson(target.bedConfiguration ?? target.bedTypes, []), amenities: inputJson(target.amenities, []), accessibilityAttributes: inputJson(target.accessibilityAttributes, []), unitType: target.unitType, entireOrShared: target.entireOrShared, status: "ACTIVE", version: 1, isDemo: true }, update: {} });
      const externalId = `worker-fixture-comparable-${stableId("x", targetUnitId).slice(-8)}-${index}`;
      const url = `https://example.invalid/worker-fixture/${externalId}`;
      const listing = await prisma.listing.upsert({ where: { dataSourceId_externalId: { dataSourceId: source.id, externalId } }, create: { propertyId: property.id, unitId: unit.id, dataSourceId: source.id, platform: "FIXTURE", externalId, sourceListingId: externalId, canonicalUrl: url, rawUrl: url, url, platformUnitName: unit.officialName, lastConfirmedAt: new Date(), onlineStatus: "ONLINE", listingStatus: "ACTIVE", matchConfidence: 1, legalRightsStatus: "ALLOWED", operationalStatus: "HEALTHY", metadata: { fixture: true, targetUnitId }, isDemo: true }, update: {} });
      await prisma.competitorRelationship.upsert({ where: { targetUnitId_competitorUnitId_version: { targetUnitId, competitorUnitId: unit.id, version: 1 } }, create: { targetUnitId, competitorUnitId: unit.id, role: "CORE", version: 1, reasonCode: "FIXTURE_SAME_MICRO_MARKET", suggestedBy: "DETERMINISTIC_COMPARABILITY_V1", isDemo: true }, update: {} });
      await prisma.panelMembership.upsert({ where: { sellableUnitId_marketKey: { sellableUnitId: unit.id, marketKey: "christchurch" } }, create: { sellableUnitId: unit.id, marketKey: "christchurch", membershipType: index <= 6 ? "ANCHOR" : "ROTATING", weight: 1, coverage24h: 1, coverage72h: 1, active: true, lastSuccessfulAt: new Date() }, update: { active: true } });
      result.push({ property, unit, listing });
    }
    return result;
  }

  private async ensureStayQueryForDate(date: string, analysisRequestId: string) {
    const id = stableId("worker-stay-query", `${analysisRequestId}:${date}:1:2:0:1`);
    const checkIn = new Date(`${date}T00:00:00.000Z`);
    return prisma.stayQuery.upsert({ where: { id }, create: { id, checkIn, checkOut: new Date(checkIn.getTime() + 86_400_000), nights: 1, adults: 2, children: 0, childrenAges: [], units: 1, unitConstraints: {}, mealPlan: "ANY_PUBLIC", currency: "NZD", cancellationCategory: "STANDARD", cancellationPolicy: "ANY_PUBLIC", ratePlan: "PUBLIC", taxAndFeePolicy: "MANDATORY_INCLUDED", publicRateContext: "PUBLIC_ANONYMOUS", querySemanticsVersion: "v1", timezone: "Pacific/Auckland", reason: "Worker query plan date" }, update: {} });
  }

  private async analysisObservationIds(request: WorkerAnalysisRequest, querySignatureHash: string) {
    const runs = await prisma.rateObservation.findMany({ where: { collectionRun: { analysisRequestId: request.id } }, select: { id: true } });
    const cache = await prisma.queryCacheEntry.findUnique({ where: { querySignatureHash_collectionProfileKey: { querySignatureHash, collectionProfileKey } } });
    return [...new Set([...runs.map((item) => item.id), ...jsonStringArray(cache?.observationIds)])];
  }

  private async collectPublicSignals(request: WorkerAnalysisRequest) {
    await this.setStatus(request, "COLLECTING_MARKET_SIGNALS");
    for (const sourceId of ["public_holidays_nz", "school_holidays_nz", "eventfinda"]) {
      const marketScope = sourceId === "eventfinda" ? "new-zealand" : "christchurch";
      try { await this.collectSource(sourceId, marketScope, request.id); } catch { /* A public signal source cannot turn a successful rate collection into sold out. */ }
    }
  }

  private async publishFormalResult(request: WorkerAnalysisRequest, marketSnapshotId: string, priceAnalysisId: string, confidence: "HIGH" | "MEDIUM" | "LOW", keyDates: Array<{ date: string; target: number; median: number; gap: number; confidence: string }>, jobId: string) {
    if (!request.priceCheckId || !request.emailHash || !request.encryptedEmail) throw new Error("Formal analysis is missing PriceCheck or email delivery identity");
    const current = await prisma.resultVersion.findFirst({ where: { priceCheckId: request.priceCheckId, status: "PUBLISHED" }, orderBy: { version: "desc" } });
    const latest = await prisma.resultVersion.aggregate({ where: { priceCheckId: request.priceCheckId }, _max: { version: true } });
    const result = await prisma.resultVersion.create({ data: { priceCheckId: request.priceCheckId, analysisRequestId: request.id, version: (latest._max.version ?? 0) + 1, status: "PUBLISHED", outcome: "PUBLISHED", generatedAt: new Date(), publishedAt: new Date(), dataLastCheckedAt: new Date(), analysisVersion: "worker-baseline-v1", confidence, payload: { priceAnalysisId, fixture: request.isFixture, disclaimer: request.isFixture ? "Development fixture data. Not real market data." : null, dateRangeDays: 30, keyDateCount: keyDates.length }, supersedesId: current?.id, isDemo: request.isFixture, marketSnapshotId } });
    if (current) await prisma.resultVersion.update({ where: { id: current.id }, data: { status: "SUPERSEDED" } });
    for (const [index, item] of keyDates.entries()) {
      await prisma.insight.create({ data: { id: `${result.id}:insight:${index + 1}`, resultVersionId: result.id, stayDate: new Date(`${item.date}T00:00:00.000Z`), risk: item.gap > item.median * 0.15 ? "REVIEW" : "WATCH", reasonCodes: item.gap > 0 ? ["BELOW_COMPARABLE_RANGE"] : [], marketSignalIds: [], targetPriceMinor: item.target, competitorMedianMinor: item.median, competitorLowMinor: Math.round(item.median * 0.9), competitorHighMinor: Math.round(item.median * 1.1), recommendedAction: item.gap > 0 ? "REVIEW_RATE_UPWARD" : "MONITOR_DATE", confidence: item.confidence as "HIGH" | "MEDIUM" | "LOW", limitations: request.isFixture ? ["Development fixture data. Not real market data."] : [], explanation: { whatChanged: "The observed public target rate is compared with the unique CORE cohort.", whyItMatters: "This date may warrant a rate review; this is not a guaranteed optimal price.", suggestedAction: item.gap > 0 ? "Review the public rate and operational context before changing price." : "Monitor this date." } } });
    }
    await prisma.$transaction([
      prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
      prisma.priceCheck.update({ where: { id: request.priceCheckId }, data: { status: "PUBLISHED", currentResultVersionNumber: result.version, dataSnapshotVersion: marketSnapshotId } }),
    ]);
    const emailKey = `${request.id}:${request.emailHash}:result-ready-v1`;
    const delivery = await prisma.emailDelivery.upsert({ where: { idempotencyKey: emailKey }, create: { analysisRequestId: request.id, priceCheckId: request.priceCheckId, resultVersionId: result.id, type: "RESULT_READY", locale: request.locale, recipientHash: request.emailHash, encryptedRecipient: request.encryptedEmail, provider: "pending", idempotencyKey: emailKey }, update: {} });
    await enqueueJob({ type: "EMAIL_DELIVERY", payload: { deliveryId: delivery.id }, idempotencyKey: `${emailKey}:job`, analysisRequestId: request.id, priceCheckId: request.priceCheckId, correlationId: request.correlationId, snapshotId: marketSnapshotId, resultVersionId: result.id });
    return result;
  }

  private async enforceWorkerLimits(input: CreateWorkerRequest, isPreview: boolean, sellableUnitId: string | null) {
    const deviceHash = hashPersonalIdentifier(input.deviceId ?? `ip:${input.ipAddress ?? "unknown"}`, this.environment.ACCESS_KEY_SECRET);
    const ipHash = hashPersonalIdentifier(input.ipAddress ?? "unknown", this.environment.ACCESS_KEY_SECRET);
    const now = Date.now();
    if (isPreview) {
      const deviceUnitHash = sellableUnitId ? hashPersonalIdentifier(`${deviceHash}:${sellableUnitId}`, this.environment.ACCESS_KEY_SECRET) : null;
      const ipUnitHash = sellableUnitId ? hashPersonalIdentifier(`${ipHash}:${sellableUnitId}`, this.environment.ACCESS_KEY_SECRET) : null;
      const [deviceUnitDay, ipUnitDay, deviceDay, ipDay, deviceMonth, ipMonth] = await Promise.all([
        deviceUnitHash ? prisma.usageLedger.count({ where: { action: "WORKER_PREVIEW_UNIT", subjectType: "DEVICE_UNIT", subjectHash: deviceUnitHash, createdAt: { gte: new Date(now - 86_400_000) } } }) : 0,
        ipUnitHash ? prisma.usageLedger.count({ where: { action: "WORKER_PREVIEW_UNIT", subjectType: "IP_UNIT", subjectHash: ipUnitHash, createdAt: { gte: new Date(now - 86_400_000) } } }) : 0,
        prisma.usageLedger.count({ where: { action: "WORKER_PREVIEW", subjectType: "DEVICE", subjectHash: deviceHash, createdAt: { gte: new Date(now - 86_400_000) } } }),
        prisma.usageLedger.count({ where: { action: "WORKER_PREVIEW", subjectType: "IP", subjectHash: ipHash, createdAt: { gte: new Date(now - 86_400_000) } } }),
        prisma.usageLedger.count({ where: { action: "WORKER_PREVIEW", subjectType: "DEVICE", subjectHash: deviceHash, createdAt: { gte: new Date(now - 30 * 86_400_000) } } }),
        prisma.usageLedger.count({ where: { action: "WORKER_PREVIEW", subjectType: "IP", subjectHash: ipHash, createdAt: { gte: new Date(now - 30 * 86_400_000) } } }),
      ]);
      const reason = Math.max(deviceUnitDay, ipUnitDay) >= this.environment.PREVIEW_UNIT_24H_LIMIT ? "UNIT_24H_LIMIT" : Math.max(deviceDay, ipDay) >= this.environment.PREVIEW_DEVICE_UNITS_24H_LIMIT ? "DEVICE_OR_IP_24H_LIMIT" : Math.max(deviceMonth, ipMonth) >= this.environment.PREVIEW_DEVICE_UNITS_30D_LIMIT ? "DEVICE_OR_IP_30D_LIMIT" : null;
      await this.recordAbuseDecision("WORKER_PREVIEW", deviceHash, reason ? [reason] : []);
      if (reason) throw new WorkerRequestError("ABUSE_LIMIT", "The free preview limit has been reached; use a recent result or try again later", 429);
      return;
    }
    if (!input.email || !sellableUnitId) return;
    const emailHash = hashPersonalIdentifier(input.email.trim().toLowerCase(), this.environment.ACCESS_KEY_SECRET);
    const emailUnitHash = hashPersonalIdentifier(`${emailHash}:${sellableUnitId}`, this.environment.ACCESS_KEY_SECRET);
    const [active, unitMonth] = await Promise.all([
      prisma.workerAnalysisRequest.count({ where: { emailHash, isPreview: false, status: { in: ["RECEIVED", "RESOLVING_INPUT", "NEEDS_CONFIRMATION", "QUEUED", "CHECKING_CACHE", "COLLECTING_TARGET", "COLLECTING_COMPETITORS", "COLLECTING_MARKET_SIGNALS", "NORMALISING", "VALIDATING", "BUILDING_SNAPSHOT", "ANALYSING"] } } }),
      prisma.usageLedger.count({ where: { action: "WORKER_FORMAL", subjectType: "EMAIL_UNIT", subjectHash: emailUnitHash, createdAt: { gte: new Date(now - 30 * 86_400_000) } } }),
    ]);
    const reason = active >= this.environment.FORMAL_EMAIL_ACTIVE_LIMIT ? "EMAIL_ACTIVE_LIMIT" : unitMonth >= this.environment.FORMAL_UNIT_30D_LIMIT ? "EMAIL_UNIT_30D_LIMIT" : null;
    await this.recordAbuseDecision("WORKER_FORMAL", emailHash, reason ? [reason] : []);
    if (reason) throw new WorkerRequestError("ABUSE_LIMIT", "A current free formal analysis already exists for this email or unit", 429);
  }

  private async recordWorkerUsage(request: WorkerAnalysisRequest, input: CreateWorkerRequest, isPreview: boolean) {
    const deviceHash = hashPersonalIdentifier(input.deviceId ?? `ip:${input.ipAddress ?? "unknown"}`, this.environment.ACCESS_KEY_SECRET);
    const ipHash = hashPersonalIdentifier(input.ipAddress ?? "unknown", this.environment.ACCESS_KEY_SECRET);
    if (isPreview) {
      const metadata = { analysisRequestId: request.id, sellableUnitId: request.sellableUnitId };
      await prisma.usageLedger.createMany({ data: [
        { action: "WORKER_PREVIEW", subjectType: "DEVICE", subjectHash: deviceHash, metadata },
        { action: "WORKER_PREVIEW", subjectType: "IP", subjectHash: ipHash, metadata },
        ...(request.sellableUnitId ? [
          { action: "WORKER_PREVIEW_UNIT", subjectType: "DEVICE_UNIT", subjectHash: hashPersonalIdentifier(`${deviceHash}:${request.sellableUnitId}`, this.environment.ACCESS_KEY_SECRET), metadata },
          { action: "WORKER_PREVIEW_UNIT", subjectType: "IP_UNIT", subjectHash: hashPersonalIdentifier(`${ipHash}:${request.sellableUnitId}`, this.environment.ACCESS_KEY_SECRET), metadata },
        ] : []),
      ] });
      return;
    }
    if (request.emailHash && request.sellableUnitId) await prisma.usageLedger.create({ data: { action: "WORKER_FORMAL", subjectType: "EMAIL_UNIT", subjectHash: hashPersonalIdentifier(`${request.emailHash}:${request.sellableUnitId}`, this.environment.ACCESS_KEY_SECRET), metadata: { analysisRequestId: request.id, sellableUnitId: request.sellableUnitId } } });
  }

  private async recordAbuseDecision(action: string, subjectHash: string, reasonCodes: string[]) {
    const blocked = reasonCodes.length > 0;
    await prisma.abuseDecision.create({ data: { action, subjectHash, outcome: blocked ? "COOLDOWN" : "ALLOW", reasonCodes, cooldownUntil: blocked ? new Date(Date.now() + 3_600_000) : null } });
  }

  private adapterContext(): AdapterContext {
    return { mode: this.fixtureEnabled() ? "fixture" : "live", correlationId: randomUUID(), locale: "en", currency: "NZD" };
  }

  private publicAdapterContext(): AdapterContext {
    return { mode: this.environment.PUBLIC_COLLECTION_MODE, correlationId: randomUUID(), locale: "en", currency: "NZD" };
  }

  async persistNormalisedEvent(event: PublicEvent, dataSourceId: string, collectionRunId: string) {
    return this.persistNormalisedEventCached(event, event, dataSourceId, collectionRunId, createEventPersistenceCache());
  }

  async persistNormalisedEvents(events: PublicEvent[], dataSourceId: string, collectionRunId: string) {
    const cache = createEventPersistenceCache();
    const persisted = new Map<string, Awaited<ReturnType<WorkerService["persistNormalisedEventCached"]>>>();
    const series = new Map<string, PublicEvent[]>();
    for (const event of events) {
      const identity = sourceEventIdentity(event).externalId;
      series.set(identity, [...(series.get(identity) ?? []), event]);
    }
    for (const occurrences of series.values()) {
      const seriesEvent = eventSeriesRepresentative(occurrences);
      for (const event of occurrences) persisted.set(event.externalId, await this.persistNormalisedEventCached(event, seriesEvent, dataSourceId, collectionRunId, cache));
    }
    return persisted;
  }

  private async persistNormalisedEventCached(event: PublicEvent, seriesEvent: PublicEvent, dataSourceId: string, collectionRunId: string, cache: EventPersistenceCache) {
    if (event.countryCode.toUpperCase() !== "NZ") throw new AdapterError("PARSING_ERROR", `Event ${event.externalId} is outside New Zealand`, false);
    const sourceIdentity = sourceEventIdentity(seriesEvent);
    const seriesCanonicalKey = canonicalEventKey(seriesEvent);
    const occurrenceCanonicalKey = canonicalEventOccurrenceKey(event);
    const venueCanonicalKey = canonicalVenueKey(event);
    const description = eventDescription(seriesEvent);
    const seenAt = new Date();
    const isDemo = event.fixture || this.environment.NODE_ENV === "test";
    const contentHash = stableHash({
      title: event.title,
      category: event.category,
      subcategory: event.subcategory,
      sourceUrl: event.sourceUrl,
      venueName: event.venueName,
      address: event.address,
      city: event.city,
      region: event.region,
      postcode: event.postcode,
      latitude: event.latitude,
      longitude: event.longitude,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      status: event.status,
      ticketStatus: event.ticketStatus,
      metadata: event.metadata,
    });
    const sourceOccurrenceData = {
      lastCollectionRunId: collectionRunId,
      canonicalKey: occurrenceCanonicalKey,
      title: event.title,
      category: event.category,
      subcategory: event.subcategory,
      sourceUrl: event.sourceUrl,
      venueName: event.venueName,
      address: event.address,
      city: event.city,
      region: event.region,
      territorialAuthority: event.territorialAuthority,
      postcode: event.postcode,
      countryCode: event.countryCode.toUpperCase(),
      latitude: event.latitude,
      longitude: event.longitude,
      timezone: event.timezone,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status: event.status,
      ticketStatus: event.ticketStatus,
      impactStatus: event.impactStatus,
      impactScore: event.impactScore,
      impactConfidence: event.impactConfidence,
      impactEvidence: event.impactEvidence as Prisma.InputJsonValue,
      sourceUpdatedAt: event.sourceUpdatedAt,
      lastSeenAt: seenAt,
      contentHash,
      metadata: event.metadata as Prisma.InputJsonValue,
      isDemo,
    };
    const sourceContentHash = stableHash({
      externalId: sourceIdentity.externalId,
      sourceUrl: sourceIdentity.sourceUrl,
      title: seriesEvent.title,
      category: seriesEvent.category,
      subcategory: seriesEvent.subcategory,
      status: seriesEvent.status,
      metadata: seriesEvent.metadata,
    });

    const existingOccurrence = await prisma.sourceEventOccurrence.findUnique({
      where: { dataSourceId_externalId: { dataSourceId, externalId: event.externalId } },
      include: {
        sourceEvent: true,
        canonicalLinks: {
          include: { eventOccurrence: { include: { canonicalEvent: true } } },
          take: 1,
        },
      },
    });
    const existingCanonicalLink = existingOccurrence?.canonicalLinks[0];
    if (existingOccurrence?.contentHash === contentHash && existingOccurrence.sourceEvent.contentHash === sourceContentHash && existingCanonicalLink) {
      const [sourceOccurrence, sourceEvent, eventOccurrence, canonicalEvent] = await prisma.$transaction([
        prisma.sourceEventOccurrence.update({ where: { id: existingOccurrence.id }, data: { lastCollectionRunId: collectionRunId, lastSeenAt: seenAt } }),
        prisma.sourceEvent.update({ where: { id: existingOccurrence.sourceEventId }, data: { lastSeenAt: seenAt } }),
        prisma.eventOccurrence.update({ where: { id: existingCanonicalLink.eventOccurrenceId }, data: { lastSeenAt: seenAt } }),
        prisma.canonicalEvent.update({ where: { id: existingCanonicalLink.eventOccurrence.canonicalEventId }, data: { lastSeenAt: seenAt } }),
      ]);
      if (venueCanonicalKey && eventOccurrence.venueId) cache.venues.set(venueCanonicalKey, eventOccurrence.venueId);
      return { sourceEvent, sourceOccurrence, canonicalEvent, eventOccurrence, unchanged: true };
    }

    return prisma.$transaction(async (tx) => {
      const seriesCacheKey = `${dataSourceId}:${sourceIdentity.externalId}`;
      const cachedSeries = cache.series.get(seriesCacheKey);
      const sourceEvent = cachedSeries
        ? { id: cachedSeries.sourceEventId }
        : await tx.sourceEvent.upsert({
            where: { dataSourceId_externalId: { dataSourceId, externalId: sourceIdentity.externalId } },
            create: { dataSourceId, externalId: sourceIdentity.externalId, sourceUrl: sourceIdentity.sourceUrl, title: seriesEvent.title, category: seriesEvent.category, subcategory: seriesEvent.subcategory, status: seriesEvent.status, sourceUpdatedAt: seriesEvent.sourceUpdatedAt, lastSeenAt: seenAt, contentHash: sourceContentHash, metadata: seriesEvent.metadata as Prisma.InputJsonValue, isDemo },
            update: { sourceUrl: sourceIdentity.sourceUrl, title: seriesEvent.title, category: seriesEvent.category, subcategory: seriesEvent.subcategory, status: seriesEvent.status, sourceUpdatedAt: seriesEvent.sourceUpdatedAt, lastSeenAt: seenAt, contentHash: sourceContentHash, metadata: seriesEvent.metadata as Prisma.InputJsonValue, isDemo },
          });

      let canonicalEvent: { id: string };
      if (cachedSeries) {
        canonicalEvent = { id: cachedSeries.canonicalEventId };
      } else {
        const existingEventLink = await tx.eventSourceLink.findUnique({ where: { sourceEventId: sourceEvent.id }, select: { canonicalEventId: true } });
        canonicalEvent = existingEventLink
          ? await tx.canonicalEvent.update({ where: { id: existingEventLink.canonicalEventId }, data: { title: seriesEvent.title, category: seriesEvent.category, subcategory: seriesEvent.subcategory, ...(description ? { description } : {}), status: seriesEvent.status, lastSeenAt: seenAt, isDemo } })
          : await tx.canonicalEvent.upsert({
              where: { canonicalKey: seriesCanonicalKey },
              create: { canonicalKey: seriesCanonicalKey, title: seriesEvent.title, category: seriesEvent.category, subcategory: seriesEvent.subcategory, description, status: seriesEvent.status, lastSeenAt: seenAt, metadata: { canonicalisationVersion: "event-exact-v1" }, isDemo },
              update: { title: seriesEvent.title, category: seriesEvent.category, subcategory: seriesEvent.subcategory, ...(description ? { description } : {}), status: seriesEvent.status, lastSeenAt: seenAt, isDemo },
            });

        await tx.eventSourceLink.upsert({
          where: { sourceEventId: sourceEvent.id },
          create: { canonicalEventId: canonicalEvent.id, sourceEventId: sourceEvent.id, matchMethod: "EXACT_IDENTITY_V1", matchConfidence: 1, evidence: { canonicalKey: seriesCanonicalKey } },
          update: { canonicalEventId: canonicalEvent.id, matchMethod: "EXACT_IDENTITY_V1", matchConfidence: 1, reviewStatus: "AUTO_ACCEPTED", evidence: { canonicalKey: seriesCanonicalKey } },
        });
        cache.series.set(seriesCacheKey, { sourceEventId: sourceEvent.id, canonicalEventId: canonicalEvent.id });
      }

      const cachedVenueId = venueCanonicalKey ? cache.venues.get(venueCanonicalKey) : undefined;
      const venue = cachedVenueId
        ? { id: cachedVenueId }
        : venueCanonicalKey
          ? await tx.canonicalVenue.upsert({
            where: { canonicalKey: venueCanonicalKey },
            create: { canonicalKey: venueCanonicalKey, name: event.venueName, address: event.address, city: event.city, region: event.region, territorialAuthority: event.territorialAuthority, postcode: event.postcode, countryCode: event.countryCode.toUpperCase(), latitude: event.latitude, longitude: event.longitude, metadata: { canonicalisationVersion: "venue-exact-v1" } },
            update: { name: event.venueName, address: event.address, city: event.city, region: event.region, territorialAuthority: event.territorialAuthority, postcode: event.postcode, countryCode: event.countryCode.toUpperCase(), latitude: event.latitude, longitude: event.longitude },
            })
          : null;
      if (venueCanonicalKey && venue) cache.venues.set(venueCanonicalKey, venue.id);

      const sourceOccurrence = await tx.sourceEventOccurrence.upsert({
        where: { dataSourceId_externalId: { dataSourceId, externalId: event.externalId } },
        create: { sourceEventId: sourceEvent.id, dataSourceId, externalId: event.externalId, ...sourceOccurrenceData },
        update: { sourceEventId: sourceEvent.id, ...sourceOccurrenceData },
      });

      const existingOccurrenceLink = await tx.eventOccurrenceSourceLink.findUnique({ where: { sourceEventOccurrenceId: sourceOccurrence.id }, select: { eventOccurrenceId: true } });
      const occurrenceData = { canonicalEventId: canonicalEvent.id, venueId: venue?.id ?? null, timezone: event.timezone, startsAt: event.startsAt, endsAt: event.endsAt, status: event.status, ticketStatus: event.ticketStatus, impactStatus: event.impactStatus, impactScore: event.impactScore, impactConfidence: event.impactConfidence, impactEvidence: event.impactEvidence as Prisma.InputJsonValue, lastSeenAt: seenAt, metadata: { canonicalisationVersion: "event-occurrence-exact-v1" }, isDemo };
      const eventOccurrence = existingOccurrenceLink
        ? await tx.eventOccurrence.update({ where: { id: existingOccurrenceLink.eventOccurrenceId }, data: occurrenceData })
        : await tx.eventOccurrence.upsert({
            where: { canonicalKey: occurrenceCanonicalKey },
            create: { canonicalKey: occurrenceCanonicalKey, ...occurrenceData },
            update: occurrenceData,
          });

      await tx.eventOccurrenceSourceLink.upsert({
        where: { sourceEventOccurrenceId: sourceOccurrence.id },
        create: { eventOccurrenceId: eventOccurrence.id, sourceEventOccurrenceId: sourceOccurrence.id, matchMethod: "EXACT_IDENTITY_V1", matchConfidence: 1, evidence: { canonicalKey: occurrenceCanonicalKey } },
        update: { eventOccurrenceId: eventOccurrence.id, matchMethod: "EXACT_IDENTITY_V1", matchConfidence: 1, reviewStatus: "AUTO_ACCEPTED", evidence: { canonicalKey: occurrenceCanonicalKey } },
      });

      return { sourceEvent, sourceOccurrence, canonicalEvent, eventOccurrence, unchanged: false };
    });
  }

  private fixtureEnabled() {
    return this.environment.NODE_ENV !== "production" && this.environment.FIXTURE_COLLECTION_ENABLED && ["demo", "fixture"].includes(this.environment.PROVIDER_MODE);
  }
}

export class WorkerRequestError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode: number) {
    super(message);
    this.name = "WorkerRequestError";
  }
}

function emptyPublicCollectionCounters() {
  return { requests: 0, requestsAvoided: 0, discovered: 0, references: 0, records: 0, rawArtifacts: 0, signals: 0, events: 0, persisted: 0, duplicatesSkipped: 0, unchangedSkipped: 0, failures: 0 };
}

function defaultPublicRecordLimit(sourceId: string) {
  return sourceId === "geonet" ? 100 : 5_000;
}

function createEventPersistenceCache(): EventPersistenceCache {
  return { series: new Map(), venues: new Map() };
}

function eventSeriesRepresentative(events: PublicEvent[]) {
  const representative = [...events].sort((left, right) => (eventDescription(right)?.length ?? 0) - (eventDescription(left)?.length ?? 0))[0]!;
  const statuses = events.map((event) => event.status);
  const status: PublicEvent["status"] = statuses.every((value) => value === "CANCELLED")
    ? "CANCELLED"
    : statuses.includes("SCHEDULED")
      ? "SCHEDULED"
      : statuses.includes("RESCHEDULED")
        ? "RESCHEDULED"
        : statuses.includes("POSTPONED")
          ? "POSTPONED"
          : "UNKNOWN";
  const sourceUpdatedAt = maxDate(events.flatMap((event) => event.sourceUpdatedAt ? [event.sourceUpdatedAt] : []));
  return { ...representative, status, sourceUpdatedAt };
}

function uniqueByExternalId<T extends { externalId: string }>(items: T[], counters: { duplicatesSkipped: number }) {
  const unique = new Map<string, T>();
  for (const item of items) {
    if (unique.has(item.externalId)) counters.duplicatesSkipped += 1;
    else unique.set(item.externalId, item);
  }
  return [...unique.values()];
}

async function browserWorkerRequest(
  environment: Environment,
  body: { taskType: "read_only_capture"; traceId: string; url: string; allowedHosts: readonly string[]; extractor: string; evidenceMode: "html"; challengeSettleMs?: number; profileKey?: string },
) {
  try {
    return await fetch(new URL("/internal/browser-tasks", environment.BROWSER_WORKER_INTERNAL_URL!), {
      method: "POST",
      headers: { authorization: `Bearer ${environment.BROWSER_WORKER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(environment.BROWSER_WORKER_TIMEOUT_MS + 15_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timeout = error instanceof DOMException && error.name === "TimeoutError" || /timed? ?out|timeout|aborted/i.test(message);
    throw new AdapterError(timeout ? "TIMEOUT" : "SOURCE_UNAVAILABLE", `Browser Worker request failed for ${body.url}: ${message}`, true);
  }
}

function browserProfileKey(sourceKey: string) {
  const normalised = sourceKey.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 53);
  return `${normalised || "source"}-public-v1`;
}

function sourceGovernanceSnapshot(source: {
  internalApprovalStatus: string;
  legalRightsStatus: string;
  lifecycle: string;
  operationalStatus: string;
  healthStatus: string;
  allowedUsage: Prisma.JsonValue;
  displayPermission: boolean;
  derivedAnalysisPermission: boolean;
  rightsAllowStorage: boolean;
  rightsAllowDerivedAnalysis: boolean;
  rightsAllowDisplay: boolean;
}) {
  return {
    internalApprovalStatus: source.internalApprovalStatus,
    legalRightsStatus: source.legalRightsStatus,
    lifecycle: source.lifecycle,
    operationalStatus: source.operationalStatus,
    healthStatus: source.healthStatus,
    allowedUsage: source.allowedUsage,
    displayPermission: source.displayPermission,
    derivedAnalysisPermission: source.derivedAnalysisPermission,
    rightsAllowStorage: source.rightsAllowStorage,
    rightsAllowDerivedAnalysis: source.rightsAllowDerivedAnalysis,
    rightsAllowDisplay: source.rightsAllowDisplay,
  };
}

async function sourceScheduleSnapshot(sourceId: string) {
  const schedules = await prisma.scheduleDefinition.findMany({
    select: { key: true, enabled: true, cronExpression: true, payload: true, nextRunAt: true, lastEnqueuedAt: true },
    orderBy: { key: "asc" },
  });
  return schedules
    .filter((schedule) => jsonRecord(schedule.payload).sourceId === sourceId)
    .map((schedule) => ({
      key: schedule.key,
      enabled: schedule.enabled,
      cronExpression: schedule.cronExpression,
      nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
      lastEnqueuedAt: schedule.lastEnqueuedAt?.toISOString() ?? null,
      payloadHash: stableHash(schedule.payload),
    }));
}

function fixturePriceMinor(listingId: string, date: string, target: boolean) {
  const hash = Number.parseInt(createHash("sha256").update(`${listingId}:${date}`).digest("hex").slice(0, 8), 16);
  const market = 19_000 + (hash % 6_000);
  return target ? Math.round(market * 0.86) : market;
}

function fixtureCompetitorCount(input: string) {
  return input.toLowerCase().includes("fixture-insufficient") ? 2 : 8;
}

function fixtureFeesUnknown(input: string) {
  return input.toLowerCase().includes("fixture-fees-unknown");
}

function stableId(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalJson(value))).digest("hex");
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalJson(item)]));
  return value;
}

function redactArtifact(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value)) return value.map(redactArtifact);
  if (typeof value !== "object") return value as string | number | boolean;
  const blocked = /cookie|session|token|authorization|credential|password/i;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !blocked.test(key)).map(([key, item]) => [key, redactArtifact(item)]));
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function looksLikeAddress(value: string) {
  return /\d|street|road|avenue|drive|lane|christchurch|auckland|wellington|queenstown/i.test(value);
}

function redactUrlForStorage(value: string) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|auth|credential|password|secret|session|signature/i.test(key)) url.searchParams.set(key, "[REDACTED]");
    }
    return url.href;
  } catch {
    return "[INVALID_URL]";
  }
}

function tomorrow() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function listingPriority(startsAt: string | null, now: Date) {
  if (!startsAt) return 100;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return 100;
  const days = (date.getTime() - now.getTime()) / 86_400_000;
  if (days <= 2) return 10;
  if (days <= 14) return 20;
  if (days <= 60) return 40;
  return 80;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function firstString(value: Prisma.JsonValue): string | null {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function jsonStringArray(value: Prisma.JsonValue | undefined | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function inputJson(value: Prisma.JsonValue | undefined | null, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value === null || value === undefined ? fallback : value as Prisma.InputJsonValue;
}

function jsonRecord(value: Prisma.JsonValue | undefined | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function integerMetadata(value: Prisma.JsonValue | undefined | null, key: string) {
  const candidate = jsonRecord(value)[key];
  return typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0 ? candidate : 0;
}

function detailTargetBatchUrls(scope: Prisma.JsonValue): string[] {
  const candidate = jsonRecord(jsonRecord(scope).argusProgress).detailTargetUrls;
  return Array.isArray(candidate)
    ? candidate.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
}

async function persistDetailTargetBatch(collectionRunId: string, scope: Prisma.JsonValue, urls: string[]) {
  if (!urls.length) return;
  const current = jsonRecord(scope);
  await prisma.collectionRun.update({
    where: { id: collectionRunId },
    data: {
      scope: {
        ...current,
        argusProgress: {
          ...jsonRecord(current.argusProgress),
          detailTargetUrls: urls,
        },
      } as Prisma.InputJsonValue,
    },
  });
}

function orderPersistedDetailTargets<T extends { url: string }>(urls: string[], targets: T[]): T[] {
  const targetsByUrl = new Map(targets.map((target) => [target.url, target]));
  const ordered = urls.flatMap((url) => {
    const target = targetsByUrl.get(url);
    return target ? [target] : [];
  });
  if (ordered.length !== urls.length) {
    throw new AdapterError("SOURCE_UNAVAILABLE", "A persisted browser detail batch target is no longer available", true);
  }
  return ordered;
}

function eventSignal(event: PublicEvent) {
  if (event.impactStatus !== "PROMOTED" || event.impactScore === null || event.impactScore < 0.7) return [];
  const region = event.city ?? event.region ?? "New Zealand";
  return [{
    sourceId: event.sourceId,
    externalId: `event:${event.externalId}`,
    marketKey: marketKey(region),
    type: "MAJOR_EVENT",
    title: event.title,
    region,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    direction: "POSITIVE" as const,
    confidence: event.impactConfidence ?? 0.5,
    evidenceRef: event.sourceUrl,
    fixture: event.fixture,
  }];
}

function marketKey(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new-zealand";
}

function maxDate(values: Date[]) {
  return values.length ? new Date(Math.max(...values.map((value) => value.getTime()))) : null;
}

function minDate(values: Date[]) {
  return values.length ? new Date(Math.min(...values.map((value) => value.getTime()))) : null;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function mapWorkerStatusToPriceCheck(status: string) {
  const mapping: Record<string, Parameters<typeof prisma.priceCheck.update>[0]["data"]["status"]> = {
    RECEIVED: "VALIDATING", RESOLVING_INPUT: "VALIDATING", NEEDS_CONFIRMATION: "NEEDS_CONFIRMATION", QUEUED: "QUEUED", CHECKING_CACHE: "COLLECTING", COLLECTING_TARGET: "COLLECTING", COLLECTING_COMPETITORS: "COLLECTING", COLLECTING_MARKET_SIGNALS: "COLLECTING", NORMALISING: "NORMALIZING", VALIDATING: "AUTO_VALIDATING", BUILDING_SNAPSHOT: "AUTO_VALIDATING", ANALYSING: "ANALYSING", PARTIAL: "PARTIAL", INSUFFICIENT_DATA: "INSUFFICIENT_DATA", SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE", COMPLETED: "PUBLISHED", FAILED: "FAILED", CANCELLED: "CANCELLED",
  };
  return mapping[status];
}

function mapSignalType(type: string): "PUBLIC_HOLIDAY" | "ANNIVERSARY_DAY" | "SCHOOL_HOLIDAY" | "MAJOR_EVENT" | "WEEKEND_PATTERN" | "PRICE_RISING" | "AVAILABILITY_TIGHTENING" | "RESTRICTION_INCREASING" | "WEATHER_OR_ACCESS_DISRUPTION" | "TOURISM_DEMAND" | "TRANSPORT_FLOW" | "FX_RATE" {
  if (["PUBLIC_HOLIDAY", "ANNIVERSARY_DAY", "SCHOOL_HOLIDAY", "MAJOR_EVENT", "WEEKEND_PATTERN", "PRICE_RISING", "AVAILABILITY_TIGHTENING", "RESTRICTION_INCREASING", "WEATHER_OR_ACCESS_DISRUPTION", "TOURISM_DEMAND", "TRANSPORT_FLOW", "FX_RATE"].includes(type)) return type as ReturnType<typeof mapSignalType>;
  return "WEATHER_OR_ACCESS_DISRUPTION";
}
