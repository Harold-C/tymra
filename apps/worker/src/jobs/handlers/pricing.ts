import { getEnvironment, type Environment } from "@tymra/config";
import { enqueueJob, prisma, type Prisma } from "@tymra/db";
import { calculateEffectiveNightlyTotalMinor, decidePublication, determineConfidence } from "@tymra/domain";
import { DemoProvider } from "@tymra/providers/demo";
import { WorkerService } from "../../services/worker-service";
import { acknowledgePersistedArgusResults } from "../../services/argus-orchestrator";
import { queueTerminalEmail } from "./notifications";
import { syncIncidentSafely, setCheckStatus, enqueueNext, inheritedJobPriority, ensureWorkerException } from "./state";
import { JsonObject, requiredString } from "./payload";

export async function collectRates(priceCheckId: string, jobId: string, environment: Environment) {
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

export async function loadManualRates(propertyId: string, unitId: string, checkIn: Date, checkOut: Date, dataSourceId: string) {
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

export async function normalizeRates(priceCheckId: string, sourceJobId: string) {
  await setCheckStatus(priceCheckId, "NORMALIZING", "rate_normalization_started");
  await enqueueNext(priceCheckId, "COMPETITOR_BUILD", "competitors", sourceJobId);
}

export async function buildCompetitors(priceCheckId: string, sourceJobId: string) {
  await setCheckStatus(priceCheckId, "ANALYSING", "competitor_build_completed");
  await enqueueNext(priceCheckId, "ANALYSIS", "analysis", sourceJobId);
}

export async function analyse(priceCheckId: string, sourceJobId: string) {
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

export async function autoValidate(priceCheckId: string, sourceJobId: string, environment: Environment) {
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

export async function generateResult(priceCheckId: string, payload: JsonObject, sourceJobId: string) {
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

export async function publishResult(priceCheckId: string) {
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

export async function validatePropertyIdentification(priceCheckId: string, jobId: string, environment: Environment) {
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

export async function validateUnitIdentification(priceCheckId: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId } });
  if (check.unitId) {
    await setCheckStatus(priceCheckId, "NEEDS_CONFIRMATION", "unit_identification_completed");
    return;
  }
  await ensureWorkerException(priceCheckId, "UNIT_MATCH", "Select the exact Sellable Unit", "unit-identification");
  await setCheckStatus(priceCheckId, "EXCEPTION", "unit_identification_conflict");
}
