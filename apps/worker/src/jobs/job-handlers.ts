import { getEnvironment, type Environment } from "@tymra/config";
import {
  decryptPersonalData,
  enqueueJob,
  hashPersonalIdentifier,
  prisma,
  syncCollectionIncident,
  type EmailType,
  type Job,
  type Prisma,
} from "@tymra/db";
import { calculateEffectiveNightlyTotalMinor, decidePublication, determineConfidence, nzDateKey } from "@tymra/domain";
import {
  buildServiceEmail,
  DemoProvider,
  LogEmailProvider,
  NZ_MAJOR_ACCOMMODATION_MARKETS,
  SmtpEmailProvider,
  assessNzMarketOperationalCoverage,
  publicSignalSourceIdsForMarket,
  resolveNzMarketKey,
  type EmailProvider,
} from "@tymra/providers";
import { WorkerService } from "../services/worker-service";
import { enqueueDueMembershipAnalyses } from "../membership/scheduler";
import {
  acknowledgePersistedArgusResults,
  pollArgusExecution,
} from "../services/argus-orchestrator";
import { DeferredJobError } from "./deferred-job";

type JsonObject = Record<string, unknown>;

export async function handleJob(job: Job, environment: Environment): Promise<void> {
  const payload = asObject(job.payload);
  const analysisRequestId = optionalString(payload, "analysisRequestId");
  const workerService = analysisRequestId ? new WorkerService(environment) : null;
  switch (job.type) {
    case "MEMBERSHIP_SCHEDULE":
      await enqueueDueMembershipAnalyses();
      return;
    case "ARGUS_JOB_POLL":
      await pollArgusExecution(environment, requiredString(payload, "executionId"));
      return;
    case "RATE_COLLECTION":
      if (analysisRequestId) return void await workerService!.collectAnalysis(analysisRequestId, job.id);
      await collectRates(requiredString(payload, "priceCheckId"), job.id, environment);
      return;
    case "RATE_NORMALIZATION":
      await normalizeRates(requiredString(payload, "priceCheckId"), job.id);
      return;
    case "COMPETITOR_BUILD":
      if (analysisRequestId) return void await workerService!.buildCompetitorSet(analysisRequestId, job.id);
      await buildCompetitors(requiredString(payload, "priceCheckId"), job.id);
      return;
    case "SNAPSHOT_GENERATION":
      await new WorkerService(environment).buildSnapshots(requiredString(payload, "analysisRequestId"), job.id);
      return;
    case "PRICE_ANALYSIS":
      await new WorkerService(environment).analyseSnapshot(requiredString(payload, "analysisRequestId"), job.id);
      return;
    case "ANALYSIS":
      await analyse(requiredString(payload, "priceCheckId"), job.id);
      return;
    case "AUTO_VALIDATION":
      await autoValidate(requiredString(payload, "priceCheckId"), job.id, environment);
      return;
    case "RESULT_GENERATION":
      await generateResult(requiredString(payload, "priceCheckId"), payload, job.id);
      return;
    case "RESULT_PUBLICATION":
      await publishResult(requiredString(payload, "priceCheckId"));
      return;
    case "EMAIL_DELIVERY":
      await deliverEmail(requiredString(payload, "deliveryId"), environment);
      return;
    case "RESULT_NOTIFICATION":
      await sendTerminalNotification(
        requiredString(payload, "priceCheckId"),
        requiredString(payload, "emailType") as EmailType,
        requiredString(payload, "suffix"),
      );
      return;
    case "SOURCE_HEALTH_CHECK":
      if (optionalString(payload, "sourceId")) {
        await new WorkerService(environment).sourceHealth(optionalString(payload, "sourceId"));
        return;
      }
      await checkSourceHealth(environment);
      return;
    case "EVENT_COLLECTION":
      await handlePublicCollection(job, environment, payload, {
        from: optionalDate(payload, "from"),
        to: optionalDate(payload, "to"),
        phase: eventCollectionPhase(payload),
        maxPages: optionalNumber(payload, "maxPages"),
        maxDetails: optionalNumber(payload, "maxDetails"),
        limit: optionalNumber(payload, "limit"),
        dryRun: optionalBoolean(payload, "dryRun"),
        localAcceptance: optionalBoolean(payload, "localAcceptance"),
        developmentBootstrap: optionalBoolean(payload, "developmentBootstrap"),
        boundedPublicSchedule: optionalBoolean(payload, "boundedPublicSchedule"),
      });
      return;
    case "PUBLIC_DATA_COLLECTION":
    case "WEATHER_COLLECTION":
    case "TRANSPORT_COLLECTION":
      await handlePublicCollection(job, environment, payload, {
        from: optionalDate(payload, "from"),
        to: optionalDate(payload, "to"),
        limit: optionalNumber(payload, "limit"),
        dryRun: optionalBoolean(payload, "dryRun"),
        localAcceptance: optionalBoolean(payload, "localAcceptance"),
        lincolnOnly: optionalBoolean(payload, "lincolnOnly"),
        boundedPublicSchedule: optionalBoolean(payload, "boundedPublicSchedule"),
      });
      return;
    case "RETENTION_CLEANUP":
      await new WorkerService(environment).retentionCleanup();
      return;
    case "CATALOG_DISCOVERY":
      if (optionalString(payload, "priceCheckId")) {
        const priceCheckId = requiredString(payload, "priceCheckId");
        await new WorkerService(environment).discoverAndCollectPriceCheckComparables(priceCheckId, job.id);
        await acknowledgePersistedArgusResults(environment, job.id);
        await enqueueNext(priceCheckId, "RATE_NORMALIZATION", "normalize", job.id);
        return;
      }
      await new WorkerService(environment).refreshCatalog(optionalString(payload, "marketScope") ?? "new-zealand", job.id);
      await acknowledgePersistedArgusResults(environment, job.id);
      return;
    case "ANCHOR_PANEL_COLLECTION":
      await new WorkerService(environment).refreshPanel("ANCHOR", optionalString(payload, "marketScope") ?? "new-zealand", job.id);
      await acknowledgePersistedArgusResults(environment, job.id);
      return;
    case "ROTATING_PANEL_COLLECTION":
      await new WorkerService(environment).refreshPanel("ROTATING", optionalString(payload, "marketScope") ?? "new-zealand", job.id);
      await acknowledgePersistedArgusResults(environment, job.id);
      return;
    case "PROPERTY_IDENTIFICATION":
      await validatePropertyIdentification(requiredString(payload, "priceCheckId"), job.id, environment);
      return;
    case "UNIT_IDENTIFICATION":
      await validateUnitIdentification(requiredString(payload, "priceCheckId"));
      return;
    case "MARKET_COVERAGE_COLLECTION":
      await refreshMarketCoverage();
      return;
  }
}

async function handlePublicCollection(
  job: Job,
  environment: Environment,
  payload: JsonObject,
  options: { from?: Date; to?: Date; phase?: "discovery" | "details" | "full"; maxPages?: number; maxDetails?: number; limit?: number; dryRun?: boolean; localAcceptance?: boolean; developmentBootstrap?: boolean; lincolnOnly?: boolean; boundedPublicSchedule?: boolean },
) {
  try {
    const result = await new WorkerService(environment).collectSource(
      requiredString(payload, "sourceId"),
      optionalString(payload, "marketScope") ?? "new-zealand",
      undefined,
      { ...options, jobId: job.id },
    );
    await syncIncidentSafely(result.runId);
    await acknowledgePersistedArgusResults(environment, job.id);
  } catch (error) {
    if (error instanceof DeferredJobError) throw error;
    const run = await prisma.collectionRun.findFirst({ where: { jobId: job.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (run) await syncIncidentSafely(run.id);
    try {
      await acknowledgePersistedArgusResults(environment, job.id);
    } catch (retentionError) {
      process.stderr.write(`${JSON.stringify({ service: "tymra-worker", event: "argus_failure_evidence_retention_failed", jobId: job.id, message: retentionError instanceof Error ? retentionError.message : "Unknown evidence retention failure" })}\n`);
    }
    throw error;
  }
}

async function syncIncidentSafely(collectionRunId: string) {
  try {
    await syncCollectionIncident(collectionRunId);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ service: "tymra-worker", event: "collection_incident_sync_failed", collectionRunId, message: error instanceof Error ? error.message : "Unknown incident sync failure" })}\n`);
  }
}

async function collectRates(priceCheckId: string, jobId: string, environment: Environment) {
  const check = await prisma.priceCheck.findUniqueOrThrow({
    where: { id: priceCheckId },
    include: { property: true, unit: true, stayQuery: true },
  });
  if (!check.property || !check.unit || !check.stayQuery) throw new Error("Price Check is missing a confirmed Property, Unit or Stay Query");
  const isDemo = usesFixtureRateCollection(environment);
  if (!isDemo) {
    await setCheckStatus(priceCheckId, "COLLECTING", check.analysisType === "LOCATION_BENCHMARK" ? "location_benchmark_collection_started" : "ota_collection_started");
    if (check.analysisType === "LOCATION_BENCHMARK") {
      await enqueueNext(priceCheckId, "CATALOG_DISCOVERY", "location-catalog", jobId);
      return;
    }
    const result = await new WorkerService(environment).collectPriceCheckOtaRate(priceCheckId, jobId);
    await acknowledgePersistedArgusResults(environment, jobId);
    if (result.collected) await enqueueNext(priceCheckId, "CATALOG_DISCOVERY", "catalog", jobId);
    else await queueTerminalEmail(priceCheckId, "CHECK_FAILED", `${result.outcome.toLowerCase()}:${jobId}`, environment);
    return;
  }
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: isDemo ? "development-demo" : "manual-import" } });
  if (!source.enabled || source.operationalStatus !== "HEALTHY") throw new Error("The configured data source is not enabled and healthy");
  await setCheckStatus(priceCheckId, "COLLECTING", "collection_started");
  const collectionRun = await prisma.collectionRun.create({
    data: {
      jobId,
      dataSourceId: source.id,
      priceCheckId,
      mode: "ON_DEMAND",
      status: "RUNNING",
      scope: { propertyId: check.propertyId, unitId: check.unitId, label: isDemo ? "Development Demo Data" : "Manual Import" },
      startedAt: new Date(),
      attemptCount: 1,
      isDemo,
    },
  });

  let rates = isDemo
    ? await new DemoProvider(environment.NODE_ENV).fetchRates(
        {
          propertyExternalId: "demo-christchurch-central-stay",
          unitExternalId: "demo-central-entire-unit",
          checkIn: check.stayQuery.checkIn,
          checkOut: check.stayQuery.checkOut,
          adults: check.stayQuery.adults,
          children: check.stayQuery.children,
          units: check.stayQuery.units,
          currency: "NZD",
        },
        { sourceKey: source.key, locale: check.locale === "zh" ? "zh" : "en", correlationId: jobId },
      )
    : await loadManualRates(check.property.id, check.unit.id, check.stayQuery.checkIn, check.stayQuery.checkOut, source.id);
  if (isDemo) {
    const targetListing = await prisma.listing.findFirst({
      where: { dataSourceId: source.id, propertyId: check.property.id, unitId: check.unit.id, listingStatus: { in: ["ACTIVE", "ONLINE"] } },
      orderBy: { lastConfirmedAt: "desc" },
      select: { externalId: true },
    });
    if (targetListing) {
      rates = rates.map((rate) => rate.listingExternalId === "demo-target-listing"
        ? { ...rate, listingExternalId: targetListing.externalId }
        : rate);
    }
  }

  const collectionProfile = await prisma.collectionProfile.upsert({
    where: { key: `${source.key}:nz:${check.locale}:nzd:desktop:public:v1` },
    create: {
      key: `${source.key}:nz:${check.locale}:nzd:desktop:public:v1`,
      sellableUnitId: check.unit.id,
      dataSourceId: source.id,
      ipRegion: "NZ",
      locale: check.locale === "zh" ? "zh-NZ" : "en-NZ",
      currency: "NZD",
      deviceType: "DESKTOP",
      loggedInState: "LOGGED_OUT",
      memberState: "NON_MEMBER",
      mobilePriceContext: "STANDARD",
      publicRateContext: isDemo ? "FIXTURE_PUBLIC" : "PUBLIC_OPERATOR_ATTESTED",
      browserProfileVersion: isDemo ? "fixture-browser-v1" : "manual-import-v1",
    },
    update: {},
  });

  let successCount = 0;
  for (const rate of rates) {
    const listing = await prisma.listing.findUnique({
      where: { dataSourceId_externalId: { dataSourceId: source.id, externalId: rate.listingExternalId } },
      include: { unit: true },
    });
    if (!listing) continue;
    const totalAmountMinor = rate.baseAmountMinor + rate.mandatoryFeesMinor + rate.taxesMinor + rate.platformFeesMinor;
    await prisma.rateObservation.upsert({
      where: { idempotencyKey: `${jobId}:${listing.id}:${check.stayQueryId}` },
      create: {
        propertyId: listing.propertyId,
        sellableUnitId: listing.unitId,
        listingId: listing.id,
        sourceListingId: listing.sourceListingId,
        stayQueryId: check.stayQuery.id,
        collectionProfileId: collectionProfile.id,
        dataSourceId: source.id,
        collectionRunId: collectionRun.id,
        requestedAt: new Date(),
        currency: rate.currency,
        baseAmountMinor: rate.baseAmountMinor,
        mandatoryFeesMinor: rate.mandatoryFeesMinor,
        taxesMinor: rate.taxesMinor,
        platformFeesMinor: rate.platformFeesMinor,
        optionalFeesMinor: 0,
        totalAmountMinor,
        exchangeRate: 1,
        nzdTotalMinor: totalAmountMinor,
        effectiveNightlyTotalMinor: calculateEffectiveNightlyTotalMinor({
          baseAmountMinor: rate.baseAmountMinor,
          mandatoryFeesMinor: rate.mandatoryFeesMinor,
          taxesMinor: rate.taxesMinor,
          platformFeesMinor: rate.platformFeesMinor,
          nights: check.stayQuery.nights,
        }),
        observedAt: rate.collectedAt,
        checkIn: check.stayQuery.checkIn,
        checkOut: check.stayQuery.checkOut,
        nights: check.stayQuery.nights,
        adults: check.stayQuery.adults,
        childrenAges: check.stayQuery.childrenAges as Prisma.InputJsonValue,
        units: check.stayQuery.units,
        localTimezone: check.stayQuery.timezone,
        roomTypeRaw: listing.platformUnitName,
        roomTypeNormalized: listing.unit.canonicalName,
        unitConstraints: check.stayQuery.unitConstraints as Prisma.InputJsonValue,
        occupancyCapacity: listing.unit.capacity,
        bedType: null,
        unitAttributesVersion: listing.unit.version,
        mealPlan: check.stayQuery.mealPlan,
        cancellationCategory: rate.cancellationCategory,
        cancellationPolicy: rate.cancellationCategory,
        paymentTerms: "UNKNOWN",
        rateFence: check.stayQuery.ratePlan,
        minimumStay: rate.minimumStay,
        availabilityStatus: rate.availabilityStatus,
        restrictionReason: rate.availabilityStatus === "MINIMUM_STAY_RESTRICTION" ? "MINIMUM_STAY_RESTRICTION" : null,
        feeCompleteness: rate.feeCompleteness,
        sourceUrl: listing.canonicalUrl,
        evidenceRef: `${isDemo ? "fixture" : "manual-import"}://${collectionRun.id}/${listing.sourceListingId}`,
        collectorVersion: isDemo ? "fixture-collector-v1" : "manual-import-v1",
        parserVersion: isDemo ? "fixture-parser-v1" : "manual-import-parser-v1",
        qualityFlags: [],
        operationalStatus: source.operationalStatus,
        collectedAt: rate.collectedAt,
        idempotencyKey: `${jobId}:${listing.id}:${check.stayQueryId}`,
        isDemo,
      },
      update: {},
    });
    successCount += 1;
  }

  await prisma.collectionRun.update({
    where: { id: collectionRun.id },
    data: {
      status: successCount > 0 ? "SUCCEEDED" : "PARTIAL",
      successCount,
      failureCount: successCount > 0 ? 0 : 1,
      finishedAt: new Date(),
      errorCode: successCount > 0 ? null : "NO_MATCHING_IMPORTED_RATES",
      errorSummary: successCount > 0 ? null : "No imported rates match the confirmed unit and stay dates",
    },
  });
  await syncIncidentSafely(collectionRun.id);
  if (successCount === 0) {
    await setCheckStatus(priceCheckId, "SOURCE_UNAVAILABLE", "manual_import_no_matching_rates");
    await queueTerminalEmail(priceCheckId, "CHECK_FAILED", `source-unavailable:${jobId}`, environment);
    return;
  }
  await enqueueNext(priceCheckId, "RATE_NORMALIZATION", "normalize", jobId);
}

export function usesFixtureRateCollection(
  environment: Pick<Environment, "PROVIDER_MODE" | "PUBLIC_COLLECTION_MODE">,
) {
  return environment.PUBLIC_COLLECTION_MODE !== "live"
    && ["demo", "fixture"].includes(environment.PROVIDER_MODE);
}

async function loadManualRates(propertyId: string, unitId: string, checkIn: Date, checkOut: Date, dataSourceId: string) {
  const observations = await prisma.rateObservation.findMany({
    where: {
      dataSourceId,
      listing: { unitId, unit: { propertyId } },
      stayQuery: { checkIn, checkOut },
    },
    orderBy: { collectedAt: "desc" },
    distinct: ["listingId"],
    include: { listing: { select: { externalId: true } } },
  });
  return observations.map((observation) => ({
    listingExternalId: observation.listing.externalId,
    currency: "NZD" as const,
    baseAmountMinor: observation.baseAmountMinor,
    mandatoryFeesMinor: observation.mandatoryFeesMinor,
    taxesMinor: observation.taxesMinor,
    platformFeesMinor: observation.platformFeesMinor,
    cancellationCategory: observation.cancellationCategory,
    minimumStay: observation.minimumStay,
    availabilityStatus: observation.availabilityStatus,
    feeCompleteness: observation.feeCompleteness,
    collectedAt: observation.collectedAt,
    isDemo: false,
  }));
}

async function normalizeRates(priceCheckId: string, sourceJobId: string) {
  await setCheckStatus(priceCheckId, "NORMALIZING", "rate_normalization_started");
  await enqueueNext(priceCheckId, "COMPETITOR_BUILD", "competitors", sourceJobId);
}

async function buildCompetitors(priceCheckId: string, sourceJobId: string) {
  await setCheckStatus(priceCheckId, "ANALYSING", "competitor_build_completed");
  await enqueueNext(priceCheckId, "ANALYSIS", "analysis", sourceJobId);
}

async function analyse(priceCheckId: string, sourceJobId: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId }, include: { collectionRuns: true } });
  const observations = await prisma.rateObservation.findMany({
    where: { collectionRun: { priceCheckId } },
    orderBy: { effectiveNightlyTotalMinor: "asc" },
  });
  const latest = observations.reduce<Date | null>((value, item) => (!value || item.collectedAt > value ? item.collectedAt : value), null);
  const ageHours = latest ? Math.max(0, (Date.now() - latest.getTime()) / 3_600_000) : null;
  const confidence = determineConfidence({
    competitorCount: observations.length,
    freshestAgeHours: ageHours,
    fees: observations.every((item) => item.feeCompleteness === "COMPLETE") ? "COMPLETE" : "PARTIAL",
    unitConfirmed: Boolean(check.unitId),
    comparable: observations.length > 0,
    blockingFlags: observations.length < 3 ? ["COMPETITOR_COUNT_BELOW_3"] : [],
  });
  await setCheckStatus(priceCheckId, "AUTO_VALIDATING", "analysis_completed");
  await enqueueJob({
    type: "AUTO_VALIDATION",
    payload: { priceCheckId, confidence, competitorCount: observations.length, dataAgeHours: ageHours ?? 999 },
    idempotencyKey: `${priceCheckId}:auto-validation:${sourceJobId}`,
    priceCheckId,
    priority: await inheritedJobPriority(sourceJobId),
  });
}

async function autoValidate(priceCheckId: string, sourceJobId: string, environment: Environment) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId }, include: { property: { select: { supportStatus: true } } } });
  const observations = await prisma.rateObservation.findMany({ where: { collectionRun: { priceCheckId } } });
  const targetObservations = observations.filter((item) => item.sellableUnitId === check.unitId && (item.displayedAmountMinor ?? item.totalAmountMinor) > 0);
  const publishableObservations = check.analysisType === "LOCATION_BENCHMARK"
    ? observations.filter((item) => (item.displayedAmountMinor ?? item.totalAmountMinor) > 0)
    : targetObservations;
  const confidence = determineConfidence({
    competitorCount: observations.length,
    freshestAgeHours: observations.length ? 1 : null,
    fees: observations.every((item) => item.feeCompleteness === "COMPLETE") ? "COMPLETE" : "PARTIAL",
    unitConfirmed: Boolean(check.unitId),
    comparable: observations.length > 0,
    blockingFlags: observations.length < 3 ? ["COMPETITOR_COUNT_BELOW_3"] : [],
  });
  if (publishableObservations.length > 0) {
    if (!environment.AUTO_PUBLISH_ENABLED) {
      await setCheckStatus(priceCheckId, "EXCEPTION", "auto_publish_blocked");
      await ensureWorkerException(priceCheckId, "HIGH_PRIORITY_REVIEW", "Review the available evidence before publication", sourceJobId);
      return;
    }
    await enqueueJob({
      type: "RESULT_GENERATION",
      payload: { priceCheckId, confidence, decision: "PRICE_OBSERVED" },
      idempotencyKey: `${priceCheckId}:result-generation:${sourceJobId}`,
      priceCheckId,
      priority: await inheritedJobPriority(sourceJobId),
    });
    return;
  }

  const decision = decidePublication({
    marketStatus: check.property?.supportStatus ?? "INSUFFICIENT_DATA",
    propertyConfirmed: Boolean(check.propertyId),
    unitConfirmed: Boolean(check.unitId),
    targetRatePresent: false,
    dataAgeHours: observations.length ? 1 : null,
    competitorCount: observations.length,
    feeCompleteness: observations.every((item) => item.feeCompleteness === "COMPLETE") ? "COMPLETE" : "PARTIAL",
    blockingFlags: observations.length < 3 ? ["COMPETITOR_COUNT_BELOW_3"] : [],
    unresolvedException: false,
    resultSchemaValid: true,
    confidence,
    risk: "REVIEW",
    highPriorityEvidenceCategories: 0,
    highPrioritySecondValidationPassed: null,
    humanRepairableConflict: false,
  });

  if (decision === "AUTO_RETURN") {
    await setCheckStatus(priceCheckId, "INSUFFICIENT_DATA", "target_price_not_observed");
    await queueTerminalEmail(priceCheckId, "INSUFFICIENT_DATA", `auto-return:${sourceJobId}`, environment);
    return;
  }
  if (decision === "EXCEPTION" || !environment.AUTO_PUBLISH_ENABLED) {
    await setCheckStatus(priceCheckId, "EXCEPTION", "auto_publish_blocked");
    await ensureWorkerException(priceCheckId, "HIGH_PRIORITY_REVIEW", "Review the available evidence before publication", sourceJobId);
    return;
  }

  await enqueueJob({
    type: "RESULT_GENERATION",
    payload: { priceCheckId, confidence, decision },
    idempotencyKey: `${priceCheckId}:result-generation:${sourceJobId}`,
    priceCheckId,
    priority: await inheritedJobPriority(sourceJobId),
  });
}

async function generateResult(priceCheckId: string, payload: JsonObject, sourceJobId: string) {
  const confidence = requiredString(payload, "confidence") as "HIGH" | "MEDIUM" | "LOW";
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId } });
  const observations = await prisma.rateObservation.findMany({
    where: { collectionRun: { priceCheckId } },
    orderBy: { effectiveNightlyTotalMinor: "asc" },
    include: { dataSource: { select: { key: true } }, listing: { select: { canonicalUrl: true } } },
  });
  if (!observations.length) throw new Error("Cannot generate a result without observations");
  const targetObservations = observations.filter((item) => item.sellableUnitId === check.unitId && (item.displayedAmountMinor ?? item.totalAmountMinor) > 0);
  const isLocationBenchmark = check.analysisType === "LOCATION_BENCHMARK";
  const publishableObservations = (isLocationBenchmark ? observations : targetObservations)
    .filter((item) => (item.displayedAmountMinor ?? item.totalAmountMinor) > 0);
  if (!publishableObservations.length) throw new Error(isLocationBenchmark
    ? "Cannot complete the location benchmark without an observed public price"
    : "Cannot complete the price result without an observed target-property price");
  const target = isLocationBenchmark ? null : [...targetObservations].sort((left, right) => right.collectedAt.getTime() - left.collectedAt.getTime())[0];
  const recommendationPool = isLocationBenchmark
    ? publishableObservations.filter((item) => item.feeCompleteness === "COMPLETE")
    : observations.filter((item) => item.sellableUnitId !== check.unitId && item.feeCompleteness === "COMPLETE" && item.priceBasis === target!.priceBasis);
  const basisCounts = recommendationPool.reduce<Map<string, number>>((counts, item) => counts.set(item.priceBasis, (counts.get(item.priceBasis) ?? 0) + 1), new Map());
  const benchmarkBasis = isLocationBenchmark
    ? [...basisCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0]
    : target!.priceBasis;
  const comparableObservations = recommendationPool.filter((item) => item.priceBasis === benchmarkBasis).sort((left, right) => left.effectiveNightlyTotalMinor - right.effectiveNightlyTotalMinor);
  const recommendationAvailable = comparableObservations.length >= 3 && (isLocationBenchmark || target!.feeCompleteness === "COMPLETE");
  const median = recommendationAvailable ? comparableObservations[Math.floor(comparableObservations.length / 2)].effectiveNightlyTotalMinor : null;
  const observedSources = [...new Set(publishableObservations.map((item) => item.dataSource.key))];
  const observedPrices = publishableObservations.map((item) => ({ source: item.dataSource.key, amountMinor: item.displayedAmountMinor ?? item.totalAmountMinor, currency: item.currency, basis: item.priceBasis, feeCompleteness: item.feeCompleteness, sourceUrl: item.listing.canonicalUrl, asOf: item.collectedAt.toISOString() }));
  const analysisVersion = `tymra-release-1-v1.1:${sourceJobId}`;
  const existing = await prisma.resultVersion.findFirst({ where: { priceCheckId, analysisVersion, status: "DRAFT" } });
  const latest = await prisma.resultVersion.aggregate({ where: { priceCheckId }, _max: { version: true } });
  const result = existing ?? await prisma.resultVersion.create({
    data: {
      priceCheckId,
      version: (latest._max.version ?? 0) + 1,
      status: "DRAFT",
      outcome: "READY",
      dataLastCheckedAt: observations.reduce((latest, item) => (item.collectedAt > latest ? item.collectedAt : latest), observations[0].collectedAt),
      analysisVersion,
      confidence: recommendationAvailable ? confidence : "LOW",
      priceResultStatus: "COMPLETED",
      recommendationStatus: recommendationAvailable ? "COMPLETED" : "NOT_AVAILABLE",
      observedSourceCount: observedSources.length,
      priceEvidenceStatus: observedSources.length === 1 ? "OBSERVED_SINGLE_SOURCE" : "OBSERVED_MULTI_SOURCE",
      recommendationReasonCode: recommendationAvailable ? null : "NOT_ENOUGH_COMPARABLE_EVIDENCE",
      payload: { analysisType: check.analysisType, comparatorCount: comparableObservations.length, decision: recommendationAvailable ? requiredString(payload, "decision") : null, generationJobId: sourceJobId, isDemo: check.isDemo, observedPrices },
      isDemo: check.isDemo,
    },
  });
  await prisma.insight.upsert({
    where: { id: `${result.id}:insight:1` },
    create: {
      id: `${result.id}:insight:1`,
      resultVersionId: result.id,
      stayDate: observations[0].collectedAt,
      risk: recommendationAvailable && !isLocationBenchmark ? "REVIEW" : "NO_CLEAR_RISK",
      reasonCodes: recommendationAvailable
        ? [isLocationBenchmark ? "LOCAL_BENCHMARK_RANGE_AVAILABLE" : "BELOW_COMPARABLE_RANGE"]
        : ["NOT_ENOUGH_COMPARABLE_EVIDENCE"],
      marketSignalIds: [],
      targetPriceMinor: target ? target.displayedAmountMinor ?? target.totalAmountMinor : null,
      competitorMedianMinor: median,
      competitorLowMinor: recommendationAvailable ? comparableObservations[0].effectiveNightlyTotalMinor : null,
      competitorHighMinor: recommendationAvailable ? comparableObservations[comparableObservations.length - 1].effectiveNightlyTotalMinor : null,
      recommendedAction: recommendationAvailable ? (isLocationBenchmark ? "USE_LOCAL_BENCHMARK_RANGE" : "REVIEW_RATE_UPWARD") : "NO_RECOMMENDATION",
      confidence: recommendationAvailable ? confidence : "LOW",
      limitations: recommendationAvailable ? (confidence === "HIGH" ? [] : ["Result published with limitations"]) : ["NOT_ENOUGH_COMPARABLE_EVIDENCE"],
      explanation: {
        whatChanged: isLocationBenchmark
          ? (recommendationAvailable ? "A local public-price benchmark range is available." : "At least one nearby public price was observed.")
          : (recommendationAvailable ? "The target rate may sit below the comparable range." : "A public target-property price was observed."),
        whyItMatters: recommendationAvailable
          ? (isLocationBenchmark ? "The range provides a starting point for pricing this address." : "This date may deserve a pricing review.")
          : "The observed price is valid, but comparable evidence is not sufficient for an adjustment conclusion.",
        suggestedAction: recommendationAvailable
          ? (isLocationBenchmark ? "Use the low, median and high values as a market starting range, then adjust for the property's actual attributes." : "Review the rate before making a final pricing decision.")
          : "Use the observed price without treating it as a market recommendation.",
      },
    },
    update: {},
  });
  await setCheckStatus(priceCheckId, "READY", "result_generated");
  await enqueueNext(priceCheckId, "RESULT_PUBLICATION", "publication", sourceJobId);
}

async function publishResult(priceCheckId: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId }, include: { resultVersions: true } });
  const result = check.resultVersions.filter((item) => item.status === "DRAFT").sort((a, b) => b.version - a.version)[0];
  if (!result) {
    if (check.status === "PUBLISHED") return;
    throw new Error("No draft Result Version is available for publication");
  }
  const current = check.resultVersions.filter((item) => item.status === "PUBLISHED").sort((a, b) => b.version - a.version)[0];
  await prisma.$transaction(async (transaction) => {
    if (current) await transaction.resultVersion.update({ where: { id: current.id }, data: { status: "SUPERSEDED" } });
    await transaction.resultVersion.update({ where: { id: result.id }, data: { status: "PUBLISHED", outcome: "PUBLISHED", publishedAt: new Date() } });
    await transaction.priceCheck.update({ where: { id: priceCheckId }, data: { status: "PUBLISHED", currentResultVersionNumber: result.version } });
  });
  if (check.customerUserId) {
    await queueTerminalEmail(priceCheckId, "RESULT_READY", `result-ready:${result.version}`, getEnvironment());
    return;
  }
  const delivery = await prisma.emailDelivery.create({
    data: {
      priceCheckId,
      resultVersionId: result.id,
      type: "RESULT_READY",
      locale: check.locale,
      recipientHash: check.emailHash,
      encryptedRecipient: check.encryptedEmail,
      provider: "pending",
      idempotencyKey: `${priceCheckId}:result-ready:${result.version}`,
    },
  });
  await enqueueJob({
    type: "EMAIL_DELIVERY",
    payload: { deliveryId: delivery.id },
    idempotencyKey: `${priceCheckId}:email-delivery:${result.version}`,
    priceCheckId,
  });
}

async function deliverEmail(deliveryId: string, environment: Environment) {
  const delivery = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (delivery.status === "SENT") return;
  const recipient = decryptPersonalData(delivery.encryptedRecipient, environment.DATA_ENCRYPTION_KEY);
  let safeActionUrl: string | undefined;
  if (delivery.resultVersionId) {
    const result = await prisma.resultVersion.findUnique({
      where: { id: delivery.resultVersionId },
      select: { priceCheckId: true, priceCheck: { select: { customerUserId: true } } },
    });
    if (result) {
      const locale = delivery.locale === "zh" ? "zh" : "en";
      const destination = `/${locale}/account/checks/${result.priceCheckId}`;
      safeActionUrl = result.priceCheck.customerUserId
        ? `${environment.PUBLIC_ORIGIN}${destination}`
        : `${environment.PUBLIC_ORIGIN}/${locale}/sign-in?returnTo=${encodeURIComponent(destination)}`;
    }
  } else if (delivery.priceCheckId) {
    const check = await prisma.priceCheck.findUnique({ where: { id: delivery.priceCheckId }, select: { customerUserId: true } });
    if (check?.customerUserId) {
      safeActionUrl = `${environment.PUBLIC_ORIGIN}/${delivery.locale === "zh" ? "zh" : "en"}/account/checks/${delivery.priceCheckId}`;
    } else {
      const destination = delivery.type === "CONFIRMATION_REQUIRED" ? "query" : "status";
      safeActionUrl = `${environment.PUBLIC_ORIGIN}/${delivery.locale === "zh" ? "zh" : "en"}/check/${delivery.priceCheckId}/${destination}`;
    }
  }
  const provider: EmailProvider =
    environment.EMAIL_PROVIDER === "smtp" && environment.SMTP_URL
      ? new SmtpEmailProvider(environment.SMTP_URL)
      : new LogEmailProvider();
  const message = buildServiceEmail({
    type: delivery.type,
    locale: delivery.locale === "zh" ? "zh" : "en",
    recipient,
    recipientHash: delivery.recipientHash,
    from: environment.EMAIL_FROM,
    safeActionUrl,
    referenceId: delivery.priceCheckId ?? delivery.id,
  });
  await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENDING", attemptCount: { increment: 1 }, lastError: null } });
  try {
    await provider.send(message);
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", provider: environment.EMAIL_PROVIDER, sentAt: new Date() } });
  } catch (error) {
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Email delivery failed" } });
    throw error;
  }
}

async function checkSourceHealth(environment: Environment) {
  if (!["demo", "fixture"].includes(environment.PROVIDER_MODE)) {
    const count = await prisma.rateObservation.count({ where: { dataSource: { key: "manual-import" } } });
    await prisma.dataSource.update({ where: { key: "manual-import" }, data: { healthStatus: count > 0 ? "HEALTHY" : "DEGRADED", lastSuccessAt: count > 0 ? new Date() : undefined } });
    return;
  }
  const provider = new DemoProvider(environment.NODE_ENV);
  const health = await provider.healthCheck({ sourceKey: "development-demo", locale: "en", correlationId: "health" });
  await prisma.dataSource.update({
    where: { key: "development-demo" },
    data: { healthStatus: health.status, lastSuccessAt: health.status === "HEALTHY" ? health.checkedAt : undefined },
  });
}

async function setCheckStatus(priceCheckId: string, status: Parameters<typeof prisma.priceCheck.update>[0]["data"]["status"], eventType: string) {
  await prisma.$transaction([
    prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status } }),
    prisma.auditEvent.create({
      data: {
        eventType,
        entityType: "PriceCheck",
        entityId: priceCheckId,
        payload: { status },
        eventHash: hashPersonalIdentifier(`${priceCheckId}:${eventType}:${status}:${Date.now()}`, getEnvironment().ACCESS_KEY_SECRET),
      },
    }),
  ]);
}

async function enqueueNext(priceCheckId: string, type: Parameters<typeof enqueueJob>[0]["type"], suffix: string, sourceJobId: string) {
  await enqueueJob({ type, payload: { priceCheckId }, idempotencyKey: `${priceCheckId}:${suffix}:${sourceJobId}`, priceCheckId, priority: await inheritedJobPriority(sourceJobId) });
}

async function inheritedJobPriority(sourceJobId: string) {
  return (await prisma.job.findUnique({ where: { id: sourceJobId }, select: { priority: true } }))?.priority ?? 100;
}

async function queueWorkerEmail(priceCheckId: string, type: EmailType, suffix: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId } });
  const delivery = await prisma.emailDelivery.upsert({
    where: { idempotencyKey: `${priceCheckId}:worker-email:${suffix}` },
    create: {
      priceCheckId,
      type,
      locale: check.locale,
      recipientHash: check.emailHash,
      encryptedRecipient: check.encryptedEmail,
      provider: "pending",
      idempotencyKey: `${priceCheckId}:worker-email:${suffix}`,
    },
    update: {},
  });
  await enqueueJob({ type: "EMAIL_DELIVERY", payload: { deliveryId: delivery.id }, idempotencyKey: `${priceCheckId}:worker-email-job:${suffix}`, priceCheckId });
}

async function queueTerminalEmail(priceCheckId: string, type: EmailType, suffix: string, environment: Environment) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId }, select: { customerUserId: true } });
  if (!check.customerUserId) {
    await queueWorkerEmail(priceCheckId, type, suffix);
    return;
  }
  const graceEndsAt = new Date(Date.now() + environment.RESULT_NOTIFICATION_GRACE_SECONDS * 1_000);
  await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { notificationGraceEndsAt: graceEndsAt } });
  await enqueueJob({
    type: "RESULT_NOTIFICATION",
    payload: { priceCheckId, emailType: type, suffix },
    idempotencyKey: `${priceCheckId}:terminal-notification:${suffix}`,
    priceCheckId,
    runAt: graceEndsAt,
  });
}

async function sendTerminalNotification(priceCheckId: string, type: EmailType, suffix: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId }, select: { inPageDeliveredAt: true } });
  if (check.inPageDeliveredAt) return;
  await queueWorkerEmail(priceCheckId, type, suffix);
}

async function validatePropertyIdentification(priceCheckId: string, jobId: string, environment: Environment) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId } });
  if (check.listingUrl) {
    await new WorkerService(environment).validatePriceCheckOtaListing(priceCheckId, jobId);
    await acknowledgePersistedArgusResults(environment, jobId);
    const resolved = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId }, include: { stayQuery: true } });
    if (resolved.requestOrigin === "INTERNAL_OPERATOR" && resolved.listingValidationStatus === "VERIFIED") {
      if (!resolved.unitId || !resolved.stayQuery) {
        await ensureWorkerException(priceCheckId, "UNIT_MATCH", "Select the exact Sellable Unit for this internal on-demand request", "internal-on-demand-unit");
        await setCheckStatus(priceCheckId, "EXCEPTION", "internal_on_demand_unit_confirmation_required");
        return;
      }
      await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "QUEUED" } });
      await enqueueJob({ type: "RATE_COLLECTION", payload: { priceCheckId }, idempotencyKey: `${priceCheckId}:internal-on-demand-rate`, priceCheckId });
    }
    return;
  }
  if (check.propertyId) {
    await setCheckStatus(priceCheckId, "NEEDS_CONFIRMATION", "property_identification_completed");
    return;
  }
  await ensureWorkerException(priceCheckId, "PROPERTY_MATCH", "Select the matching Property", "property-identification");
  await setCheckStatus(priceCheckId, "EXCEPTION", "property_identification_conflict");
}

async function validateUnitIdentification(priceCheckId: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId } });
  if (check.unitId) {
    await setCheckStatus(priceCheckId, "NEEDS_CONFIRMATION", "unit_identification_completed");
    return;
  }
  await ensureWorkerException(priceCheckId, "UNIT_MATCH", "Select the exact Sellable Unit", "unit-identification");
  await setCheckStatus(priceCheckId, "EXCEPTION", "unit_identification_conflict");
}

async function ensureWorkerException(priceCheckId: string, type: "PROPERTY_MATCH" | "UNIT_MATCH" | "HIGH_PRIORITY_REVIEW", recommendation: string, sourceKey: string) {
  const id = `worker-exception:${priceCheckId}:${sourceKey}`;
  const allowedActions = type === "PROPERTY_MATCH"
    ? ["SELECT_PROPERTY", "MARK_INSUFFICIENT"]
    : type === "UNIT_MATCH"
      ? ["SELECT_UNIT", "MARK_INSUFFICIENT"]
      : ["REANALYSE", "LOWER_CONFIDENCE", "APPROVE_AND_PUBLISH"];
  await prisma.exceptionCase.upsert({
    where: { id },
    create: {
      id,
      priceCheckId,
      type,
      priority: type === "HIGH_PRIORITY_REVIEW" ? "P1" : "P2",
      recommendation,
      evidence: { sourceKey },
      allowedActions,
      blockingUser: type !== "HIGH_PRIORITY_REVIEW",
    },
    update: {},
  });
}

async function refreshMarketCoverage() {
  const measuredAt = new Date();
  const since72h = new Date(measuredAt.getTime() - 72 * 3_600_000);
  const since216h = new Date(measuredAt.getTime() - 216 * 3_600_000);
  const [properties, units, listings, panelMemberships, recentObservations, recentRuns, recentSignals, coverageRows, dataSources] = await Promise.all([
    prisma.property.findMany({ where: { status: "ACTIVE", mergedIntoId: null }, select: { id: true, city: true, region: true, territorialAuthority: true, rto: true } }),
    prisma.sellableUnit.findMany({ where: { status: "ACTIVE", mergedIntoId: null, property: { status: "ACTIVE", mergedIntoId: null } }, select: { id: true, property: { select: { city: true, region: true, territorialAuthority: true, rto: true } } } }),
    prisma.listing.findMany({ where: { listingStatus: "ACTIVE", isDemo: false }, select: { id: true, property: { select: { region: true } }, dataSourceId: true } }),
    prisma.panelMembership.findMany({ where: { active: true }, select: { marketKey: true, membershipType: true, lastSuccessfulAt: true, coverage24h: true, coverage72h: true } }),
    prisma.rateObservation.findMany({ where: { isDemo: false, collectedAt: { gte: since216h } }, select: { collectedAt: true, property: { select: { region: true } } } }),
    prisma.collectionRun.findMany({ where: { createdAt: { gte: since216h } }, select: { status: true, scope: true, createdAt: true, finishedAt: true, dataSource: { select: { key: true } } } }),
    prisma.sourceMarketSignal.findMany({ where: { lastSeenAt: { gte: since216h } }, select: { marketKey: true, dataSource: { select: { key: true } } } }),
    prisma.marketCoverage.findMany({ select: { key: true, region: true } }),
    prisma.dataSource.findMany({ select: { key: true, enabled: true, operationalStatus: true } }),
  ]);
  const coverageByKey = new Map(coverageRows.map((row) => [row.key, row]));
  const operationalReport = assessNzMarketOperationalCoverage(dataSources.map((source) => {
    const sourceRuns = recentRuns.filter((run) => run.dataSource.key === source.key);
    const runs72h = sourceRuns.filter((run) => run.createdAt >= since72h);
    const marketKeys = marketKeysForOperationalEvidence(source.key, recentSignals);
    return {
      sourceId: source.key,
      lastSuccessAt: latestDate(sourceRuns.filter((run) => run.status === "SUCCEEDED").map((run) => run.finishedAt ?? run.createdAt)),
      successfulRuns72h: runs72h.filter((run) => run.status === "SUCCEEDED").length,
      failedRuns72h: runs72h.filter((run) => run.status === "FAILED").length,
      successfulRunDays: new Set(sourceRuns.filter((run) => run.status === "SUCCEEDED").map((run) => nzDateKey(run.createdAt))).size,
      enabled: source.enabled,
      available: sourceAvailableForOperationalCoverage(source),
      ...(marketKeys.length ? { marketKeys } : {}),
    };
  }), measuredAt);
  for (const market of NZ_MAJOR_ACCOMMODATION_MARKETS) {
    const sourceIds = new Set(publicSignalSourceIdsForMarket(market.key));
    const marketRuns = recentRuns.filter((run) => run.createdAt >= since72h && (() => {
      if (!sourceIds.has(run.dataSource.key)) return false;
      const scope = jsonObject(run.scope);
      return scope.marketScope === market.key || scope.marketScope === "new-zealand";
    })());
    const successfulRuns = marketRuns.filter((run) => run.status === "SUCCEEDED").length;
    const lastHealthAt = latestDate(marketRuns.flatMap((run) => run.finishedAt ?? run.createdAt));
    const existing = coverageByKey.get(market.key);
    const operational = operationalReport.markets.find((item) => item.key === market.key)!;
    await prisma.marketCoverage.updateMany({
      where: { key: market.key },
      data: {
        knownPropertyCount: properties.filter((property) => resolveNzMarketKey(property) === market.key).length,
        knownUnitCount: units.filter((unit) => resolveNzMarketKey(unit.property) === market.key).length,
        collectionSuccessRate: marketRuns.length ? successfulRuns / marketRuns.length : 0,
        sourceFailureRate: marketRuns.length ? (marketRuns.length - successfulRuns) / marketRuns.length : 0,
        lastHealthAt,
        region: {
          ...jsonObject(existing?.region),
          publicSignalOperations: {
            windowHours: 72,
            minimumSuccessfulRunDays: 2,
            requiredSourceCount: sourceIds.size,
            runCount: marketRuns.length,
            successfulRunCount: successfulRuns,
            measuredAt: measuredAt.toISOString(),
            stable: operational.stable,
            layers: operational.layers,
            healthySources: operational.healthySources,
            staleOrMissingSources: operational.staleOrMissingSources,
          },
        },
      },
    });
  }
  for (const [regionKey, regionName] of NZ_REGION_COVERAGE) {
    const key = `region-${regionKey}`;
    const propertiesInRegion = properties.filter((property) => canonicalRegionKey(property.region) === regionKey);
    const unitsInRegion = units.filter((unit) => canonicalRegionKey(unit.property.region) === regionKey);
    const listingsInRegion = listings.filter((listing) => canonicalRegionKey(listing.property.region) === regionKey);
    const panel = panelMemberships.filter((member) => member.marketKey === key);
    const observations = recentObservations.filter((observation) => canonicalRegionKey(observation.property.region) === regionKey);
    const newestObservation = latestDate(observations.map((observation) => observation.collectedAt));
    const ageHours = newestObservation ? Math.max(0, (measuredAt.getTime() - newestObservation.getTime()) / 3_600_000) : null;
    const status = !dataSources.some((source) => source.enabled && source.operationalStatus === "HEALTHY")
      ? "SOURCE_UNAVAILABLE"
      : observations.length && panel.length ? "SUPPORTED"
        : propertiesInRegion.length || listingsInRegion.length ? "PARTIAL_COVERAGE"
          : "PILOT";
    const coverageGaps = [
      ...(propertiesInRegion.length ? [] : ["NO_DIRECTORY_IDENTITIES"]),
      ...(panel.length ? [] : ["NO_REPRESENTATIVE_OTA_PANEL"]),
      ...(observations.length ? [] : ["NO_RECENT_OTA_OBSERVATIONS"]),
    ];
    const gapPriorityScore = (status === "SOURCE_UNAVAILABLE" ? 50 : 0)
      + (propertiesInRegion.length ? 0 : 40)
      + (panel.length ? 0 : 30)
      + (observations.length ? 0 : 30);
    await prisma.marketCoverage.upsert({
      where: { key },
      create: { key, name: regionName, status, region: { country: "NZ", level: "REGION", regionName }, acceptNewChecks: true },
      update: {
        status,
        knownPropertyCount: propertiesInRegion.length,
        knownUnitCount: unitsInRegion.length,
        knownListingCount: listingsInRegion.length,
        activePanelCount: panel.length,
        anchorPanelCount: panel.filter((member) => member.membershipType === "ANCHOR").length,
        rotatingPanelCount: panel.filter((member) => member.membershipType === "ROTATING").length,
        coverage24h: panel.length ? panel.reduce((sum, member) => sum + member.coverage24h, 0) / panel.length : 0,
        coverage72h: panel.length ? panel.reduce((sum, member) => sum + member.coverage72h, 0) / panel.length : 0,
        geographicCoverage: propertiesInRegion.length ? Math.min(1, new Set(propertiesInRegion.map((property) => property.territorialAuthority).filter(Boolean)).size / 3) : 0,
        sampleComposition: { accommodationUnits: unitsInRegion.length, otaListings: listingsInRegion.length, sources: new Set(listingsInRegion.map((listing) => listing.dataSourceId)).size },
        freshness: { state: ageHours === null ? "UNKNOWN" : ageHours <= 24 ? "FRESH" : ageHours <= 72 ? "AGING" : "STALE", ageHours, limitHours: 72, policyVersion: "coverage-freshness-v1", calculatedAt: measuredAt.toISOString() },
        coverageGaps,
        gapPriorityScore,
        lastSuccessfulAt: newestObservation,
        lastHealthAt: measuredAt,
        acceptNewChecks: true,
      },
    });
  }
}

const NZ_REGION_COVERAGE = [
  ["northland", "Northland"], ["auckland", "Auckland"], ["waikato", "Waikato"], ["bay-of-plenty", "Bay of Plenty"],
  ["gisborne", "Gisborne"], ["hawkes-bay", "Hawke's Bay"], ["taranaki", "Taranaki"], ["manawatu-whanganui", "Manawatū-Whanganui"],
  ["wellington", "Wellington"], ["tasman", "Tasman"], ["nelson", "Nelson"], ["marlborough", "Marlborough"],
  ["west-coast", "West Coast"], ["canterbury", "Canterbury"], ["otago", "Otago"], ["southland", "Southland"],
  ["chatham-islands", "Chatham Islands"],
] as const;

function canonicalRegionKey(value: string | null) {
  const key = (value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return key === "hawke-s-bay" ? "hawkes-bay" : key;
}

export function marketKeysForOperationalEvidence(
  sourceId: string,
  recentSignals: readonly { marketKey: string; dataSource: { key: string } }[],
) {
  return [...new Set(recentSignals
    .filter((signal) => signal.dataSource.key === sourceId)
    .map((signal) => signal.marketKey))];
}

export function sourceAvailableForOperationalCoverage(source: {
  enabled?: boolean;
  operationalStatus: string;
}) {
  return source.enabled === true && !["BLOCKED", "DOWN", "UNCONFIGURED"].includes(source.operationalStatus);
}

function jsonObject(value: Prisma.JsonValue | undefined | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function latestDate(values: Date[]) {
  return values.length ? new Date(Math.max(...values.map((value) => value.getTime()))) : null;
}

function asObject(value: Prisma.JsonValue): JsonObject {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Job payload must be an object");
  return value as JsonObject;
}

function requiredString(value: JsonObject, key: string): string {
  const result = value[key];
  if (typeof result !== "string" || !result) throw new Error(`Job payload is missing ${key}`);
  return result;
}

function optionalString(value: JsonObject, key: string): string | undefined {
  const result = value[key];
  return typeof result === "string" && result ? result : undefined;
}

function optionalNumber(value: JsonObject, key: string): number | undefined {
  const result = value[key];
  return typeof result === "number" && Number.isInteger(result) && result > 0 ? result : undefined;
}

function optionalBoolean(value: JsonObject, key: string): boolean | undefined {
  const result = value[key];
  return typeof result === "boolean" ? result : undefined;
}

function optionalDate(value: JsonObject, key: string): Date | undefined {
  const candidate = optionalString(value, key);
  if (!candidate) return undefined;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) throw new Error(`Job payload contains invalid ${key}`);
  return date;
}

function eventCollectionPhase(value: JsonObject): "discovery" | "details" | "full" | undefined {
  const phase = optionalString(value, "phase");
  if (!phase) return undefined;
  if (["discovery", "details", "full"].includes(phase)) return phase as "discovery" | "details" | "full";
  throw new Error(`Unsupported event collection phase: ${phase}`);
}
