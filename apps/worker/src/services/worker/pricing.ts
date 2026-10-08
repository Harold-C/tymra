import { enqueueJob, prisma, Prisma, recordIdentityEntityVersion, recordListingVersion, recordQualityAssessments, recordTransformation, serviceMappedUnitId, type WorkerAnalysisRequest } from "@tymra/db";
import { calculateAvailabilityCompression, calculatePriceDistribution, calculateTargetPercentile, collapseDuplicateListings, confidenceForDate, evaluateBlockingQualityGates, addNzCalendarDays, nzCalendarDayDifference, nzDateKey, nzDateStorageValue, nzStartOfDay, type ComparableRate, type QueryPlanDate } from "@tymra/domain";
import { normalizeAddressQuery } from "@tymra/providers/address-identity";
import { matchOtaListingToConfirmedAddress } from "@tymra/providers/ota-address-match";
import { otaArgusConnectorForSource, otaCollectRatesExtractionSchema, otaProviderDetails, otaResolveListingExtractionSchema } from "@tymra/providers/ota-argus-contracts";
import { parseOtaListingReference } from "@tymra/providers/ota-adapters";
import { publicSignalCollectionPlanForAddress, resolveNzAddressSignalCoverage } from "@tymra/providers/nz-market-coverage";
import { withRedisLock } from "@tymra/queue";
import { otaCollectionFailureCode } from "../../operations/ota-health";
import { captureBrowserTaskWithDurableArgus, durableArgusTraceId } from "../argus-orchestrator";
import { discoverAndCollectAddressOtaComparables } from "../ota-pricing-orchestrator";
import { publicOtaPrice } from "../ota-price";
import { fixtureSourceKey, collectionProfileKey, canonicalReferenceIdentityMatches, fixturePriceMinor, fixtureCompetitorCount, fixtureFeesUnknown, stableId, mapOtaAvailability, stableHash, firstString, jsonStringArray, inputJson, jsonRecord, jsonNumber, summarisePublicSignalCollectionCoverage, selectPricingMarketSignals, summariseMarketSignals, summariseDateDisruptions, normaliseComparableUnitName, maxDate, minDate, average } from "./helpers";
import { WorkerRequestError } from "./errors";
import type { WorkerContext } from "./context";

export async function validatePriceCheckOtaListing(this: WorkerContext, priceCheckId: string, parentJobId: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({
    where: { id: priceCheckId },
    include: { property: true },
  });
  if (!check.propertyId || !check.property) throw new WorkerRequestError("PROPERTY_REQUIRED", "Confirm the Property before validating an OTA listing", 409);
  if (!check.listingUrl) {
    await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "NEEDS_CONFIRMATION", listingValidationStatus: "REQUIRED", listingValidationMessage: "Add a supported public OTA listing URL." } });
    return;
  }

  const reference = parseOtaListingReference(check.listingUrl);
  const connectorId = otaArgusConnectorForSource(reference.sourceId);
  if (!connectorId) throw new WorkerRequestError("UNSUPPORTED_SOURCE", "This OTA listing source is not supported", 422);
  const provider = otaProviderDetails(reference.sourceId);
  if (!provider) throw new WorkerRequestError("UNSUPPORTED_SOURCE", "This OTA listing source is not supported", 422);
  if (this.environment.PUBLIC_COLLECTION_MODE !== "live"
    && ["demo", "fixture"].includes(this.environment.PROVIDER_MODE)) {
    await this.validateFixturePriceCheckListing(check, reference, provider, parentJobId);
    return;
  }
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: reference.sourceId } });
  if (!source.enabled || source.operationalStatus !== "HEALTHY") {
    await this.markOtaListingSourceUnavailable(priceCheckId, "The OTA source is not currently available for validation.");
    return;
  }

  let run = await prisma.collectionRun.findFirst({ where: { jobId: parentJobId, dataSourceId: source.id }, orderBy: { createdAt: "desc" } });
  run ??= await prisma.collectionRun.create({
    data: {
      jobId: parentJobId,
      dataSourceId: source.id,
      priceCheckId,
      mode: "ON_DEMAND",
      status: "RUNNING",
      scope: { operation: "OTA_LISTING_VALIDATION", listingUrl: reference.canonicalUrl },
      startedAt: new Date(),
      attemptCount: 1,
      isDemo: false,
    },
  });

  const traceId = durableArgusTraceId(parentJobId, connectorId, "resolve_listing", reference.canonicalUrl);
  const response = await captureBrowserTaskWithDurableArgus(this.environment, {
    traceId,
    connectorId,
    workflowId: "resolve_listing",
    url: reference.canonicalUrl,
  }, { parentJobId, collectionRunId: run.id, dataSourceId: source.id });

  if (!response.ok) {
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: otaCollectionFailureCode({ httpStatus: response.httpStatus }), errorSummary: response.message.slice(0, 1_000), finishedAt: new Date() } });
    await this.markOtaListingSourceUnavailable(priceCheckId, "The OTA source could not validate this listing. Please retry later.");
    return;
  }
  const result = response.payload;
  await this.persistArgusEvidence(source.id, run.id, result, connectorId, reference.canonicalUrl);
  if (result.status !== "success") {
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: otaCollectionFailureCode({ captureStatus: result.status, errorCategory: result.error?.category }), errorSummary: result.error?.message?.slice(0, 1_000) ?? "OTA listing validation failed", finishedAt: new Date() } });
    await this.markOtaListingSourceUnavailable(priceCheckId, result.status === "manual_required" ? "The OTA presented an access challenge. Please retry later." : "The OTA source could not validate this listing. Please retry later.");
    return;
  }

  const extraction = otaResolveListingExtractionSchema.parse(result.extracted);
  const sourceListingIdentityMatches = extraction.sourceListingId === reference.sourceListingId
    || extraction.sourceListingId === `${reference.sourceId}:${reference.sourceListingId}`
    || canonicalReferenceIdentityMatches(reference, extraction.canonicalUrl);
  if (extraction.provider !== reference.sourceId || !sourceListingIdentityMatches) {
    await this.markOtaListingConflict(priceCheckId, run.id, "The OTA response did not identify the submitted listing.", ["LISTING_IDENTITY_MISMATCH"]);
    return;
  }
  const directListingBootstrap = check.property.status === "PENDING_OTA_VERIFICATION";
  let targetPropertyId = check.propertyId;
  let listingMatchConfidence = 0;
  if (directListingBootstrap) {
    if (extraction.countryCode?.toUpperCase() !== "NZ") {
      await this.markOtaListingConflict(
        priceCheckId,
        run.id,
        extraction.countryCode ? "The public listing is outside New Zealand." : "The public listing does not expose enough location data to confirm it is in New Zealand.",
        [extraction.countryCode ? "COUNTRY_MISMATCH" : "COUNTRY_UNRESOLVED"],
      );
      return;
    }
  } else {
    const addressMatch = matchOtaListingToConfirmedAddress(check.property, extraction);
    if (addressMatch.status !== "MATCH") {
      const message = addressMatch.status === "CONFLICT"
        ? "The public listing location conflicts with the confirmed address."
        : "The public listing does not expose enough precise location data to verify this address.";
      await this.markOtaListingConflict(priceCheckId, run.id, message, addressMatch.reasons);
      return;
    }
    listingMatchConfidence = addressMatch.confidence;
  }

  const usableUnits = extraction.units.filter((unit): unit is typeof unit & { capacity: number } => unit.capacity !== null);
  if (usableUnits.length === 0) {
    const identityNotPublic = extraction.unitIdentityStatus === "not_public" && extraction.units.length === 0;
    await this.markOtaListingConflict(
      priceCheckId,
      run.id,
      identityNotPublic
        ? "The public listing identifies the property but does not publish a physical room identity. Select or provide a verifiable room before collecting prices."
        : "The public listing does not expose enough unit capacity data to verify a sellable unit.",
      [identityNotPublic ? "UNIT_IDENTITY_NOT_PUBLIC" : "UNIT_CAPACITY_UNRESOLVED"],
      identityNotPublic ? "UNIT_IDENTITY_NOT_PUBLIC" : "UNIT_CAPACITY_UNRESOLVED",
    );
    return;
  }

  if (directListingBootstrap) {
    const existingListing = await prisma.listing.findFirst({
      where: { dataSourceId: source.id, sourceListingId: extraction.sourceListingId, listingStatus: "ACTIVE" },
      select: { propertyId: true },
      orderBy: { lastConfirmedAt: "desc" },
    });
    const locationCandidates = await prisma.property.findMany({
      where: {
        id: { not: check.propertyId! },
        countryCode: "NZ",
        status: "ACTIVE",
        ...(extraction.city ? { city: { equals: extraction.city, mode: "insensitive" } } : {}),
      },
      take: 100,
    });
    const matchedProperty = locationCandidates
      .map((property) => ({ property, match: matchOtaListingToConfirmedAddress(property, extraction) }))
      .filter((candidate) => candidate.match.status === "MATCH")
      .sort((left, right) => right.match.confidence - left.match.confidence)[0];
    const physicalIdentity = extraction.address
      ? `address:${normalizeAddressQuery(extraction.address)}`
      : extraction.latitude !== null && extraction.longitude !== null
        ? `coordinates:${extraction.latitude.toFixed(4)}:${extraction.longitude.toFixed(4)}:${normaliseComparableUnitName(extraction.canonicalName)}`
        : `provider:${reference.sourceId}:${extraction.providerPropertyId ?? extraction.sourceListingId}`;
    targetPropertyId = existingListing?.propertyId ?? matchedProperty?.property.id ?? stableId("ota-property", physicalIdentity);
    listingMatchConfidence = existingListing ? 1 : matchedProperty?.match.confidence ?? (extraction.address || extraction.latitude !== null ? 0.8 : 0.65);
    await prisma.property.upsert({
      where: { id: targetPropertyId },
      create: {
        id: targetPropertyId,
        canonicalName: extraction.canonicalName,
        legalOrBrandName: extraction.canonicalName,
        address: extraction.address ?? "",
        city: extraction.city ?? "",
        countryCode: "NZ",
        latitude: extraction.latitude,
        longitude: extraction.longitude,
        region: extraction.region,
        territorialAuthority: extraction.territorialAuthority,
        postcode: extraction.postcode,
        timezone: "Pacific/Auckland",
        accommodationType: extraction.propertyType,
        supportStatus: extraction.address || extraction.latitude !== null ? "SUPPORTED" : "INSUFFICIENT_DATA",
        identityConfidence: listingMatchConfidence,
        status: "ACTIVE",
        isDemo: false,
      },
      update: {
        canonicalName: extraction.canonicalName,
        legalOrBrandName: extraction.canonicalName,
        ...(extraction.address ? { address: extraction.address } : {}),
        ...(extraction.city ? { city: extraction.city } : {}),
        latitude: extraction.latitude,
        longitude: extraction.longitude,
        region: extraction.region,
        territorialAuthority: extraction.territorialAuthority,
        postcode: extraction.postcode,
        accommodationType: extraction.propertyType,
        identityConfidence: Math.max(listingMatchConfidence, matchedProperty?.property.identityConfidence ?? 0),
        status: "ACTIVE",
      },
    });
    await recordIdentityEntityVersion("PROPERTY", targetPropertyId, { collectedAt: new Date(extraction.observedAt), collectionRunId: run.id, collectorVersion: "argus-ota-v1", parserVersion: "ota-public.resolve_listing@1.0.0", identityEvidence: { providerPropertyId: extraction.providerPropertyId, sourceListingId: extraction.sourceListingId } });
  }

  const unitIds: string[] = [];
  await prisma.$transaction(async (transaction) => {
    for (const unit of usableUnits) {
      const unitId = await serviceMappedUnitId(source.id, `${extraction.sourceListingId}:${unit.externalId}`, stableId("ota-unit", `${source.id}:${extraction.sourceListingId}:${unit.externalId}`), unit, transaction);
      unitIds.push(unitId);
      await transaction.sellableUnit.upsert({
        where: { id: unitId },
        create: { id: unitId, propertyId: targetPropertyId!, canonicalName: unit.officialName, officialName: unit.officialName, capacity: unit.capacity, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms, bedTypes: unit.bedTypes, amenities: unit.amenities, unitType: unit.unitType, entireOrShared: unit.entireOrShared, status: "ACTIVE", isDemo: false },
        update: { propertyId: targetPropertyId!, officialName: unit.officialName, canonicalName: unit.officialName, capacity: unit.capacity, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms, bedTypes: unit.bedTypes, amenities: unit.amenities, unitType: unit.unitType, entireOrShared: unit.entireOrShared, status: "ACTIVE" },
      });
      await recordIdentityEntityVersion("SELLABLE_UNIT", unitId, { collectedAt: new Date(extraction.observedAt), collectionRunId: run.id, collectorVersion: "argus-ota-v1", parserVersion: "ota-public.resolve_listing@1.0.0", identityEvidence: { sourceListingId: extraction.sourceListingId, unitExternalId: unit.externalId } }, transaction);
      const externalId = `${extraction.sourceListingId}:${unit.externalId}`;
      const listing = await transaction.listing.upsert({
        where: { dataSourceId_externalId: { dataSourceId: source.id, externalId } },
        create: { propertyId: targetPropertyId!, unitId, dataSourceId: source.id, platform: extraction.provider, providerBrand: provider.brand, providerFamily: provider.family, externalId, sourceListingId: extraction.sourceListingId, canonicalUrl: extraction.canonicalUrl, rawUrl: check.listingUrl!, url: extraction.canonicalUrl, platformUnitName: unit.officialName, lastConfirmedAt: new Date(extraction.observedAt), onlineStatus: "ONLINE", listingStatus: "ACTIVE", matchConfidence: listingMatchConfidence, operationalStatus: "HEALTHY", metadata: { fieldSources: extraction.fieldSources, warnings: extraction.warnings, quality: extraction.quality }, isDemo: false },
        update: { propertyId: targetPropertyId!, unitId, providerBrand: provider.brand, providerFamily: provider.family, canonicalUrl: extraction.canonicalUrl, rawUrl: check.listingUrl!, url: extraction.canonicalUrl, platformUnitName: unit.officialName, lastConfirmedAt: new Date(extraction.observedAt), onlineStatus: "ONLINE", listingStatus: "ACTIVE", matchConfidence: listingMatchConfidence, operationalStatus: "HEALTHY", metadata: { fieldSources: extraction.fieldSources, warnings: extraction.warnings, quality: extraction.quality } },
      });
      await recordListingVersion(listing.id, { collectedAt: new Date(extraction.observedAt), collectionRunId: run.id, collectorVersion: "argus-ota-v1", parserVersion: "ota-public.resolve_listing@1.0.0", identityEvidence: { sourceListingId: extraction.sourceListingId, unitExternalId: unit.externalId, fieldSources: extraction.fieldSources } }, transaction);
    }
    await transaction.priceCheck.update({ where: { id: priceCheckId }, data: { propertyId: targetPropertyId, unitId: unitIds.length === 1 ? unitIds[0] : null, listingUrl: extraction.canonicalUrl, listingValidationStatus: "VERIFIED", listingValidationMessage: null, listingValidatedAt: new Date(extraction.observedAt), status: "NEEDS_CONFIRMATION" } });
    await transaction.sellableUnit.updateMany({ where: { propertyId: check.propertyId!, unitType: "UNCONFIRMED", id: { notIn: unitIds } }, data: { status: "REPLACED" } });
    if (directListingBootstrap && targetPropertyId !== check.propertyId) {
      await transaction.sellableUnit.updateMany({ where: { propertyId: check.propertyId!, status: "PENDING_OTA_VERIFICATION" }, data: { status: "REPLACED" } });
      await transaction.property.update({ where: { id: check.propertyId! }, data: { status: "MERGED", mergedIntoId: targetPropertyId } });
    }
    await transaction.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: usableUnits.length, finishedAt: new Date() } });
  });
}

export async function validateFixturePriceCheckListing(this: WorkerContext, check: { id: string; propertyId: string | null; listingUrl: string | null }, reference: ReturnType<typeof parseOtaListingReference>, provider: NonNullable<ReturnType<typeof otaProviderDetails>>, parentJobId: string) {
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: fixtureSourceKey } });
  if (!source.enabled || source.operationalStatus !== "HEALTHY") {
    await this.markOtaListingSourceUnavailable(check.id, "The deterministic development fixture is not available for validation.");
    return;
  }
  const unit = await prisma.sellableUnit.findFirst({ where: { propertyId: check.propertyId!, status: { in: ["ACTIVE", "PENDING_OTA_VERIFICATION"] } }, orderBy: { createdAt: "asc" } });
  if (!unit) {
    await this.markOtaListingSourceUnavailable(check.id, "The confirmed development Property has no active Sellable Unit.");
    return;
  }
  const externalId = `fixture-target:${check.id}`;
  await prisma.$transaction(async (transaction) => {
    const listing = await transaction.listing.upsert({
      where: { dataSourceId_externalId: { dataSourceId: source.id, externalId } },
      create: {
        propertyId: check.propertyId!,
        unitId: unit.id,
        dataSourceId: source.id,
        platform: reference.sourceId,
        providerBrand: provider.brand,
        providerFamily: provider.family,
        externalId,
        sourceListingId: reference.sourceListingId,
        canonicalUrl: reference.canonicalUrl,
        rawUrl: check.listingUrl!,
        url: reference.canonicalUrl,
        platformUnitName: unit.officialName,
        lastConfirmedAt: new Date(),
        onlineStatus: "ONLINE",
        listingStatus: "ACTIVE",
        matchConfidence: 1,
        operationalStatus: "HEALTHY",
        metadata: { fixture: true, validation: "DETERMINISTIC_DEVELOPMENT_FIXTURE", submittedSource: reference.sourceId },
        isDemo: true,
      },
      update: {
        propertyId: check.propertyId!,
        unitId: unit.id,
        canonicalUrl: reference.canonicalUrl,
        rawUrl: check.listingUrl!,
        url: reference.canonicalUrl,
        platformUnitName: unit.officialName,
        lastConfirmedAt: new Date(),
        onlineStatus: "ONLINE",
        listingStatus: "ACTIVE",
        operationalStatus: "HEALTHY",
      },
    });
    await recordListingVersion(listing.id, { collectedAt: new Date(), collectorVersion: "development-fixture-v1", parserVersion: "fixture.resolve_listing@1.0.0", identityEvidence: { submittedSource: reference.sourceId, parentJobId } }, transaction);
    await transaction.priceCheck.update({
      where: { id: check.id },
      data: {
        unitId: unit.id,
        listingUrl: reference.canonicalUrl,
        listingValidationStatus: "VERIFIED",
        listingValidationMessage: "Validated with deterministic development fixture data; no live OTA request was made.",
        listingValidatedAt: new Date(),
        status: "NEEDS_CONFIRMATION",
        isDemo: true,
      },
    });
    await transaction.collectionRun.create({
      data: {
        jobId: parentJobId,
        dataSourceId: source.id,
        priceCheckId: check.id,
        mode: "ON_DEMAND",
        status: "SUCCEEDED",
        scope: { operation: "OTA_LISTING_VALIDATION", listingUrl: reference.canonicalUrl, fixture: true },
        startedAt: new Date(),
        finishedAt: new Date(),
        attemptCount: 1,
        successCount: 1,
        isDemo: true,
      },
    });
  });
}

export async function markOtaListingSourceUnavailable(this: WorkerContext, priceCheckId: string, message: string) {
  await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "SOURCE_UNAVAILABLE", listingValidationStatus: "SOURCE_UNAVAILABLE", listingValidationMessage: message, listingValidatedAt: null } });
}

export async function markOtaListingConflict(this: WorkerContext, priceCheckId: string, collectionRunId: string, message: string, reasons: string[], errorCode = "LISTING_ADDRESS_CONFLICT") {
  await prisma.$transaction([
    prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "NEEDS_CONFIRMATION", listingValidationStatus: "CONFLICT", listingValidationMessage: message, listingValidatedAt: null } }),
    prisma.collectionRun.update({ where: { id: collectionRunId }, data: { status: "FAILED", failureCount: 1, errorCode, errorSummary: `${message} ${reasons.join(", ")}`.slice(0, 1_000), finishedAt: new Date() } }),
  ]);
}

export async function collectPriceCheckOtaRate(this: WorkerContext, priceCheckId: string, parentJobId: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({
    where: { id: priceCheckId },
    include: {
      property: true,
      stayQuery: true,
      unit: { include: { listings: { where: { listingStatus: "ACTIVE", operationalStatus: "HEALTHY", dataSource: { sourceType: "OTA" } }, include: { dataSource: true }, orderBy: { lastConfirmedAt: "desc" }, take: 1 } } },
    },
  });
  if (!check.property || !check.unit || !check.stayQuery) throw new Error("Price Check is missing a confirmed Property, Unit or Stay Query");
  const listing = check.unit.listings[0];
  if (!listing) {
    await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "INSUFFICIENT_DATA" } });
    return { collected: false, outcome: "INSUFFICIENT_DATA" as const };
  }
  const connectorId = otaArgusConnectorForSource(listing.dataSource.key);
  if (!connectorId) {
    await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "SOURCE_UNAVAILABLE" } });
    return { collected: false, outcome: "SOURCE_UNAVAILABLE" as const };
  }
  let run = await prisma.collectionRun.findFirst({ where: { jobId: parentJobId, dataSourceId: listing.dataSourceId }, orderBy: { createdAt: "desc" } });
  run ??= await prisma.collectionRun.create({ data: { jobId: parentJobId, dataSourceId: listing.dataSourceId, priceCheckId, mode: "ON_DEMAND", status: "RUNNING", scope: { operation: "OTA_RATE_COLLECTION", listingId: listing.id, propertyId: check.propertyId, unitId: check.unitId }, startedAt: new Date(), attemptCount: 1, isDemo: false } });
  const checkIn = nzDateKey(check.stayQuery.checkIn);
  const checkOut = nzDateKey(check.stayQuery.checkOut);
  const requestUrl = listing.canonicalUrl;
  const traceId = durableArgusTraceId(parentJobId, connectorId, "collect_rates", `${listing.canonicalUrl}:${listing.sourceListingId}`);
  const response = await captureBrowserTaskWithDurableArgus(this.environment, { traceId, connectorId, workflowId: "collect_rates", url: requestUrl, checkIn, checkOut, adults: check.stayQuery.adults, children: check.stayQuery.children, units: check.stayQuery.units, currency: "NZD" }, { parentJobId, collectionRunId: run.id, dataSourceId: listing.dataSourceId });
  if (!response.ok || response.payload.status !== "success") {
    const message = response.ok ? response.payload.error?.message ?? "OTA rate collection failed" : response.message;
    if (response.ok) await this.persistArgusEvidence(listing.dataSourceId, run.id, response.payload, connectorId, listing.canonicalUrl);
    await prisma.$transaction([
      prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: otaCollectionFailureCode(response.ok ? { captureStatus: response.payload.status, errorCategory: response.payload.error?.category } : { httpStatus: response.httpStatus }), errorSummary: message.slice(0, 1_000), finishedAt: new Date() } }),
      prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "SOURCE_UNAVAILABLE" } }),
    ]);
    return { collected: false, outcome: "SOURCE_UNAVAILABLE" as const };
  }
  await this.persistArgusEvidence(listing.dataSourceId, run.id, response.payload, connectorId, listing.canonicalUrl);
  const extraction = otaCollectRatesExtractionSchema.parse(response.payload.extracted);
  const unitExternalId = listing.externalId.startsWith(`${listing.sourceListingId}:`) ? listing.externalId.slice(listing.sourceListingId.length + 1) : listing.externalId;
  const rate = extraction.rates.find((candidate) => candidate.sourceListingId === listing.sourceListingId && candidate.unitExternalId === unitExternalId)
    ?? extraction.rates.find((candidate) => candidate.sourceListingId === listing.sourceListingId);
  if (!rate) {
    await prisma.$transaction([
      prisma.collectionRun.update({ where: { id: run.id }, data: { status: "PARTIAL", failureCount: 1, errorCode: "NO_MATCHING_RATE", errorSummary: "Argus returned no rate for the confirmed listing and unit", finishedAt: new Date() } }),
      prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "INSUFFICIENT_DATA" } }),
    ]);
    return { collected: false, outcome: "INSUFFICIENT_DATA" as const };
  }
  const available = rate.availabilityStatus === "AVAILABLE";
  const observedPrice = publicOtaPrice(rate, check.stayQuery.nights);
  if (available && !observedPrice) {
    await prisma.$transaction([
      prisma.collectionRun.update({ where: { id: run.id }, data: { status: "PARTIAL", failureCount: 1, errorCode: "NO_EXPLICIT_PRICE", errorSummary: "The available OTA rate did not publish an explicit price", finishedAt: new Date() } }),
      prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "INSUFFICIENT_DATA" } }),
    ]);
    return { collected: false, outcome: "INSUFFICIENT_DATA" as const };
  }
  const baseAmountMinor = observedPrice?.baseAmountMinor ?? 0;
  const mandatoryFeesMinor = observedPrice?.mandatoryFeesMinor ?? 0;
  const taxesMinor = observedPrice?.taxesMinor ?? 0;
  const totalAmountMinor = observedPrice?.amountMinor ?? 0;
  const profileKey = `${listing.dataSource.key}:${check.unit.id}:nz:${check.locale}:nzd:desktop:public:argus-v1`;
  const profile = await prisma.collectionProfile.upsert({ where: { key: profileKey }, create: { key: profileKey, sellableUnitId: check.unit.id, dataSourceId: listing.dataSourceId, ipRegion: "NZ", locale: check.locale === "zh" ? "zh-NZ" : "en-NZ", currency: "NZD", deviceType: "DESKTOP", loggedInState: "LOGGED_OUT", memberState: "NON_MEMBER", mobilePriceContext: "STANDARD", publicRateContext: "PUBLIC_ANONYMOUS", browserProfileVersion: "argus-browser-v1" }, update: {} });
  const availabilityStatus = mapOtaAvailability(rate.availabilityStatus);
  await prisma.$transaction([
    prisma.rateObservation.upsert({
      where: { idempotencyKey: `${parentJobId}:${listing.id}:${check.stayQuery.id}` },
      create: { propertyId: listing.propertyId, sellableUnitId: listing.unitId, listingId: listing.id, sourceListingId: listing.sourceListingId, stayQueryId: check.stayQuery.id, collectionProfileId: profile.id, dataSourceId: listing.dataSourceId, collectionRunId: run.id, requestedAt: new Date(), currency: "NZD", baseAmountMinor, mandatoryFeesMinor, taxesMinor, platformFeesMinor: 0, optionalFeesMinor: rate.optionalFeesMinor ?? 0, totalAmountMinor, displayedAmountMinor: observedPrice?.amountMinor, priceBasis: observedPrice?.basis ?? "UNAVAILABLE", sourcePriceStatus: rate.priceStatus, exchangeRate: 1, nzdTotalMinor: totalAmountMinor, effectiveNightlyTotalMinor: observedPrice?.effectiveNightlyMinor ?? 0, observedAt: new Date(rate.collectedAt), checkIn: check.stayQuery.checkIn, checkOut: check.stayQuery.checkOut, nights: check.stayQuery.nights, adults: check.stayQuery.adults, childrenAges: check.stayQuery.childrenAges as Prisma.InputJsonValue, units: check.stayQuery.units, localTimezone: check.stayQuery.timezone, roomTypeRaw: listing.platformUnitName, roomTypeNormalized: check.unit.canonicalName, unitConstraints: check.stayQuery.unitConstraints as Prisma.InputJsonValue, occupancyCapacity: check.unit.capacity, bedType: null, unitAttributesVersion: check.unit.version, mealPlan: rate.mealPlan, cancellationCategory: rate.cancellationPolicy, cancellationPolicy: rate.cancellationPolicy, paymentTerms: rate.paymentTerms, rateFence: rate.rateFence, minimumStay: rate.minimumStay, availabilityStatus, restrictionReason: rate.restrictionReason, feeCompleteness: available ? observedPrice?.feeCompleteness ?? "UNKNOWN" : "UNKNOWN", sourceUrl: rate.sourceUrl, evidenceRef: `tymra-evidence:${traceId}`, collectorVersion: "argus-ota-v1", parserVersion: "ota-public.collect_rates@1.0.0", qualityFlags: [...rate.qualityFlags, ...(observedPrice && observedPrice.feeCompleteness !== "COMPLETE" ? ["OBSERVED_PRICE_FEE_INCOMPLETE"] : [])], operationalStatus: listing.dataSource.operationalStatus, collectedAt: new Date(rate.collectedAt), rawDataStored: true, idempotencyKey: `${parentJobId}:${listing.id}:${check.stayQuery.id}`, isDemo: false },
      update: {},
    }),
    prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: 1, failureCount: 0, finishedAt: new Date() } }),
  ]);
  return { collected: true, outcome: "COLLECTED" as const };
}

export async function discoverAndCollectPriceCheckComparables(this: WorkerContext, priceCheckId: string, parentJobId: string) {
  return discoverAndCollectAddressOtaComparables({
    environment: this.environment,
    priceCheckId,
    parentJobId,
    reuseCachedComparable: !this.fixtureEnabled(),
    persistEvidence: (dataSourceId, collectionRunId, result, extractor, requestedUrl) =>
      this.persistArgusEvidence(dataSourceId, collectionRunId, result, extractor, requestedUrl),
  });
}

export async function collectAnalysis(this: WorkerContext, analysisRequestId: string, jobId: string) {
  return withRedisLock(`analysis:${analysisRequestId}:collection`, 120_000, async () => {
    const request = await this.requireReadyIdentity(analysisRequestId);
    const plan = request.queryPlans[0] ?? await this.ensureQueryPlan(request);
    await this.setStatus(request, "CHECKING_CACHE");

    const cache = await prisma.queryCacheEntry.findUnique({ where: { querySignatureHash_collectionProfileKey: { querySignatureHash: plan.querySignatureHash, collectionProfileKey } } });
    const currentJob = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { correlationId: true } });
    if (!currentJob.correlationId?.startsWith("service-recovery:") && cache && cache.validUntil > new Date() && jsonStringArray(cache.observationIds).length > 0) {
      await prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { cacheHitType: "EXACT_FRESH", status: "COLLECTING_COMPETITORS" } });
      await this.enqueueWorkerJob(request, "COMPETITOR_BUILD", { cacheObservationIds: cache.observationIds }, `${jobId}:competitors`);
      return;
    }

    if (!this.fixtureEnabled()) {
      await this.failBusiness(request, "SOURCE_UNAVAILABLE", "NO_LIVE_RATE_SOURCE", "No live OTA rate source is configured; production never falls back to fixture data");
      return;
    }

    await this.setStatus(request, "COLLECTING_TARGET");
    let fixtureSource;
    try {
      fixtureSource = await this.requireFixtureSource();
    } catch (error) {
      const code = error instanceof WorkerRequestError ? error.code : "SOURCE_UNAVAILABLE";
      const message = error instanceof Error ? error.message : "Development fixture source is unavailable";
      await this.failBusiness(request, "SOURCE_UNAVAILABLE", code, message);
      return;
    }
    const profile = await this.ensureCollectionProfile(request, fixtureSource.id);
    const run = await prisma.collectionRun.create({
      data: { jobId, analysisRequestId: request.id, dataSourceId: fixtureSource.id, collectionProfileId: profile.id, mode: "ON_DEMAND", status: "RUNNING", scope: { targetListingId: request.targetListingId, dateBasket: plan.dateBasket, mode: "DEVELOPMENT_FIXTURE" }, startedAt: new Date(), attemptCount: 1, correlationId: request.correlationId, isDemo: true },
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

export async function buildCompetitorSet(this: WorkerContext, analysisRequestId: string, jobId: string) {
  const request = await this.requireReadyIdentity(analysisRequestId);
  const addressCoverage = resolveNzAddressSignalCoverage(request.property ?? {});
  if (!addressCoverage) throw new WorkerRequestError("INVALID_MARKET_SCOPE", "The confirmed property is not mapped to New Zealand", 422);
  const analysisMarketKey = addressCoverage.marketKey;
  const competitors = await this.ensureFixtureCompetitors(request.sellableUnitId!, fixtureCompetitorCount(request.rawInput));
  const existing = await prisma.competitorSetVersion.findUnique({ where: { analysisRequestId_version: { analysisRequestId, version: 1 } } });
  const set = existing ?? await prisma.competitorSetVersion.create({
    data: {
      analysisRequestId,
      targetSellableUnitId: request.sellableUnitId!,
      version: 1,
      algorithmVersion: "deterministic-comparability-v1",
      marketScope: { market: analysisMarketKey, addressCoverage, expansionLevel: 0 },
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

export async function buildSnapshots(this: WorkerContext, analysisRequestId: string, jobId: string) {
  const request = await this.requireReadyIdentity(analysisRequestId);
  const targetUnit = await prisma.sellableUnit.findUniqueOrThrow({ where: { id: request.sellableUnitId! } });
  await this.setStatus(request, "VALIDATING");
  const plan = request.queryPlans[0] ?? await this.ensureQueryPlan(request);
  const competitorSet = await prisma.competitorSetVersion.findFirstOrThrow({ where: { analysisRequestId }, orderBy: { version: "desc" }, include: { members: true } });
  const observationIds = await this.analysisObservationIds(request, plan.querySignatureHash);
  const observations = await prisma.rateObservation.findMany({ where: { quarantine: null, id: { in: observationIds } }, orderBy: { collectedAt: "asc" } });
  const addressCoverage = resolveNzAddressSignalCoverage(request.property ?? {});
  if (!addressCoverage) throw new WorkerRequestError("INVALID_MARKET_SCOPE", "The confirmed property is not mapped to New Zealand", 422);
  const analysisMarketKey = addressCoverage.marketKey;
  const publicSignalPlan = publicSignalCollectionPlanForAddress(request.property ?? {});
  const [publicSignalRuns, publicSignalRegistry] = await Promise.all([
    prisma.collectionRun.findMany({
      where: { analysisRequestId: request.id, dataSource: { key: { in: publicSignalPlan.map((target) => target.sourceId) } } },
      orderBy: { createdAt: "asc" },
      select: { status: true, errorCode: true, dataSource: { select: { key: true } } },
    }),
    prisma.dataSource.findMany({
      where: { key: { in: publicSignalPlan.map((target) => target.sourceId) } },
      select: { key: true, adapterKey: true, operationalStatus: true },
    }),
  ]);
  const collectionCoverage = summarisePublicSignalCollectionCoverage(
    publicSignalPlan,
    publicSignalRuns.map((run) => ({ sourceId: run.dataSource.key, status: run.status, errorCode: run.errorCode })),
  );
  const publicSignalCoverage = { ...collectionCoverage, addressCoverage };
  const dates = [...new Set(observations.map((item) => nzDateKey(item.checkIn)))].sort();
  const dateSnapshotIds: string[] = [];
  const allFlags = new Set<string>();

  for (const date of dates) {
    const items = observations.filter((item) => nzDateKey(item.checkIn) === date);
    const stayDate = nzDateStorageValue(date);
    const stayDayStart = nzStartOfDay(date);
    const nextDate = nzStartOfDay(addNzCalendarDays(date, 1));
    const contextFloor = new Date(stayDayStart.getTime() - 400 * 86_400_000);
    const candidateSignals = await prisma.marketSignal.findMany({
      where: {
        marketKey: { in: [...new Set([analysisMarketKey, addressCoverage.level === "REGIONAL" ? addressCoverage.regionKey : null, "new-zealand"].filter((key): key is string => Boolean(key)))] },
        startsAt: { lt: nextDate },
        status: "CONFIRMED",
        OR: [
          { endsAt: { gt: stayDayStart } },
          { type: "TOURISM_DEMAND", endsAt: { gte: contextFloor, lte: stayDayStart } },
        ],
      },
      select: { id: true, dataSourceId: true, type: true, region: true, startsAt: true, endsAt: true, evidence: true },
    });
    const marketSignals = selectPricingMarketSignals(candidateSignals, stayDate);
    const signalSummary = summariseMarketSignals(marketSignals);
    const eventEvidence = {
      signalIds: marketSignals.map((signal) => signal.id),
      majorEventSignalIds: marketSignals.filter((signal) => signal.type === "MAJOR_EVENT").map((signal) => signal.id),
      signalTypes: [...new Set(marketSignals.map((signal) => signal.type))],
      regions: [...new Set(marketSignals.map((signal) => signal.region))],
      signalCount: marketSignals.length,
      majorEventSignalCount: signalSummary.majorEventCount,
      demandSignalCount: signalSummary.demandSignalCount,
      demandPressure: signalSummary.demandPressure,
      marketKey: analysisMarketKey,
      weekday: stayDayStart.toLocaleDateString("en-NZ", { weekday: "long", timeZone: "Pacific/Auckland" }),
      bookingHorizonDays: Math.max(0, nzCalendarDayDifference(date, new Date())),
      accommodationType: targetUnit.unitType,
      publicSignalCoverage,
      policyVersion: "event-impact-v2",
      causalClaim: false,
    };
    const target = items.find((item) => item.sellableUnitId === request.sellableUnitId);
    const memberScores = new Map(competitorSet.members.map((member) => [member.competitorSellableUnitId, member.comparabilityScore]));
    const comparableRates: ComparableRate[] = items.filter((item) => memberScores.has(item.sellableUnitId)).map((item) => ({ sellableUnitId: item.sellableUnitId, listingId: item.listingId, dedupeKey: `${item.propertyId}:${normaliseComparableUnitName(item.roomTypeNormalized)}`, amountMinor: item.effectiveNightlyTotalMinor, availabilityStatus: item.availabilityStatus, comparabilityScore: memberScores.get(item.sellableUnitId) ?? 0, collectedAt: item.collectedAt, feeComplete: item.feeCompleteness === "COMPLETE" }));
    const unique = collapseDuplicateListings(comparableRates);
    const distribution = calculatePriceDistribution(unique);
    const compression = calculateAvailabilityCompression(unique);
    const newest = maxDate(items.map((item) => item.collectedAt));
    const oldest = minDate(items.map((item) => item.collectedAt));
    const maxSkewMinutes = newest && oldest ? Math.round((newest.getTime() - oldest.getTime()) / 60_000) : null;
    const ageHours = newest ? Math.max(0, (Date.now() - newest.getTime()) / 3_600_000) : null;
    const horizonDays = Math.max(0, nzCalendarDayDifference(date, new Date()));
    const flags = evaluateBlockingQualityGates({ targetRatePresent: Boolean(target), unitConfirmed: Boolean(request.sellableUnitId), feesKnown: target?.feeCompleteness === "COMPLETE", comparable: unique.length >= 3, sourceAvailable: items.every((item) => item.operationalStatus === "HEALTHY"), severeConflict: false, freshnessExpired: ageHours === null || ageHours > this.environment.FRESHNESS_CORE_HOURS, snapshotCoherent: maxSkewMinutes !== null && maxSkewMinutes <= (horizonDays <= 7 ? this.environment.FRESHNESS_NEAR_TERM_SKEW_HOURS * 60 : this.environment.FRESHNESS_LONG_TERM_SKEW_HOURS * 60), competitorCount: distribution.count });
    flags.forEach((flag) => allFlags.add(flag));
    const confidence = confidenceForDate({ competitorCount: distribution.count, freshnessHours: ageHours, feeComplete: target?.feeCompleteness === "COMPLETE", maxSkewMinutes, horizonDays, blockingFlags: flags });
    const snapshot = await prisma.dateSnapshot.upsert({
      where: { analysisRequestId_stayDate_snapshotVersion: { analysisRequestId, stayDate, snapshotVersion: "date-snapshot-v1" } },
      create: { analysisRequestId, stayDate, targetRateMinor: target?.effectiveNightlyTotalMinor, validCompetitorCount: distribution.count, availableCount: compression.available, restrictedCount: compression.restricted, unavailableCount: compression.unavailable, dataMissingCount: compression.dataMissing, sourceFailureCount: compression.sourceFailure, marketMedianMinor: distribution.weightedMedianMinor, lowerQuartileMinor: distribution.lowerQuartileMinor, upperQuartileMinor: distribution.upperQuartileMinor, availabilityCompression: compression.compression, eventImpact: signalSummary.eventImpact, eventEvidence, disruptionImpact: signalSummary.disruptionImpact, newestObservationAt: newest, oldestObservationAt: oldest, maxObservationSkewMinutes: maxSkewMinutes, freshness: { ageHours, policyVersion: "freshness-v1" }, qualityGateResult: flags.length ? "BLOCKED" : confidence.level === "HIGH" ? "PASSED" : "PASSED_WITH_LIMITATIONS", qualityFlags: flags, confidenceScore: confidence.score, confidenceLevel: confidence.level, observationIds: items.map((item) => item.id), snapshotVersion: "date-snapshot-v1" },
      update: {},
    });
    dateSnapshotIds.push(snapshot.id);
  }

  await this.setStatus(request, "BUILDING_SNAPSHOT");
  const newest = maxDate(observations.map((item) => item.collectedAt));
  const oldest = minDate(observations.map((item) => item.collectedAt));
  const analysisType = request.priceCheck?.analysisType ?? "LISTING_PRICING";
  const spatialAnchor = analysisType === "LOCATION_BENCHMARK"
    ? { address: request.property!.address, latitude: request.property!.latitude, longitude: request.property!.longitude, timezone: request.property!.timezone }
    : null;
  const contentHash = stableHash({ analysisRequestId, analysisType, observationIds: [...observationIds].sort(), dateSnapshotIds: [...dateSnapshotIds].sort(), competitorSetVersionId: competitorSet.id, queryPlanId: plan.id, publicSignalCoverage, spatialAnchor });
  const marketSnapshot = await prisma.marketSnapshot.upsert({
    where: { contentHash },
    create: { analysisRequestId, priceCheckId: request.priceCheckId, analysisType, targetPropertyId: request.propertyId!, targetSellableUnitId: request.sellableUnitId, targetListingId: analysisType === "LISTING_PRICING" ? request.targetListingId : null, spatialAnchor: spatialAnchor ?? undefined, queryPlanId: plan.id, queryPlanVersion: plan.version, competitorSetVersionId: competitorSet.id, asOf: new Date(), marketScope: { market: analysisMarketKey, country: "NZ", addressCoverage, publicSignalCoverage }, observationIds, sourceRegistryVersions: [{ sourceId: fixtureSourceKey, version: "seed-v1" }, ...publicSignalRegistry.map((source) => ({ sourceId: source.key, version: source.adapterKey ?? "unversioned", operational: source.operationalStatus }))], collectionProfileVersions: [{ key: collectionProfileKey, version: 1 }], newestObservationAt: newest, oldestObservationAt: oldest, maxObservationSkewMinutes: newest && oldest ? Math.round((newest.getTime() - oldest.getTime()) / 60_000) : null, sourceCoverage: observations.length > 0 ? 1 : 0, competitorCoverage: competitorSet.members.length / 8, missingRate: dates.length ? dates.filter((date) => !observations.some((item) => nzDateKey(item.checkIn) === date)).length / dates.length : 1, conflicts: [], exclusionReasons: [], qualityGateResult: allFlags.size ? "BLOCKED" : "PASSED", qualityFlags: [...allFlags], snapshotVersion: "market-snapshot-v2", generationPolicyVersion: "snapshot-generation-v2", freshnessPolicyVersion: "freshness-v1", qualityGateVersion: "blocking-gates-v1", contentHash, status: allFlags.size ? "BLOCKED" : "READY" },
    update: {},
  });
  await recordTransformation({
    transformationType: "BUILD_MARKET_SNAPSHOT",
    transformationVersion: "snapshot-generation-v2",
    inputs: observations.map((observation) => ({ type: "NORMALIZED_FACT" as const, id: observation.id })),
    outputs: [{ type: "MARKET_SNAPSHOT", id: marketSnapshot.id }],
    metadata: { analysisType, queryPlanId: plan.id },
  });
  await recordQualityAssessments({
    entityType: "MARKET_SNAPSHOT",
    entityId: marketSnapshot.id,
    dataDomain: "OTA_PRICE",
    usagePurpose: analysisType,
    referenceTime: newest ?? undefined,
    freshnessLimitSeconds: this.environment.FRESHNESS_CORE_HOURS * 3_600,
    freshnessState: newest ? "FRESH" : "UNKNOWN",
    confidenceLayer: "SNAPSHOT",
    confidenceScore: Math.max(0, 1 - marketSnapshot.missingRate),
    confidenceLevel: marketSnapshot.qualityGateResult === "PASSED" ? "HIGH" : observations.length ? "LOW" : "INSUFFICIENT",
    limitations: [...allFlags],
  });
  await prisma.dateSnapshot.updateMany({ where: { id: { in: dateSnapshotIds }, marketSnapshotId: null }, data: { marketSnapshotId: marketSnapshot.id } });
  await this.enqueueWorkerJob(request, "PRICE_ANALYSIS", { marketSnapshotId: marketSnapshot.id }, `${jobId}:price-analysis`);
}

export async function analyseSnapshot(this: WorkerContext, analysisRequestId: string, jobId: string) {
  const request = await this.requireReadyIdentity(analysisRequestId);
  await this.setStatus(request, "ANALYSING");
  const snapshot = await prisma.marketSnapshot.findFirstOrThrow({ where: { analysisRequestId }, orderBy: { asOf: "desc" }, include: { dateSnapshots: { orderBy: { stayDate: "asc" } } } });
  const usable = snapshot.dateSnapshots.filter((date) => date.qualityGateResult !== "BLOCKED" && date.marketMedianMinor !== null && date.targetRateMinor !== null);
  if (usable.length === 0) {
    const observedDates = snapshot.dateSnapshots.filter((date) => date.targetRateMinor !== null);
    if (!request.isPreview && observedDates.length > 0) {
      return this.publishObservedOnlyResult(request, snapshot.id, observedDates, jobId);
    }
    await this.failBusiness(request, "INSUFFICIENT_DATA", "BLOCKING_QUALITY_GATES", "No date passed the blocking quality gates");
    return;
  }
  const ranked = usable.map((date) => ({
    id: date.id,
    date: nzDateKey(date.stayDate),
    target: date.targetRateMinor!,
    median: date.marketMedianMinor!,
    gap: date.marketMedianMinor! - date.targetRateMinor!,
    confidence: date.confidenceLevel,
    marketSignalIds: jsonStringArray(jsonRecord(date.eventEvidence).signalIds),
    hasMajorEvent: date.eventImpact !== null,
  })).sort((left, right) => right.gap - left.gap);
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
  const publicSignalCoverage = jsonRecord(jsonRecord(snapshot.marketScope).publicSignalCoverage);
  const publicSignalGapCodes = publicSignalCoverage.complete === false
    ? ["PUBLIC_SIGNAL_COVERAGE_INCOMPLETE", ...jsonStringArray(publicSignalCoverage.missingSourceIds).map((sourceId) => `PUBLIC_SIGNAL_MISSING:${sourceId}`), ...jsonStringArray(publicSignalCoverage.failedSourceIds).map((sourceId) => `PUBLIC_SIGNAL_FAILED:${sourceId}`)]
    : [];
  const eventEvidence = eventDates.length ? {
    affectedDateCount: eventDates.length,
    affectedDates: eventDates.map((date) => nzDateKey(date.stayDate)),
    dateSnapshotIds: eventDates.map((date) => date.id),
    signalIds: [...new Set(eventDates.flatMap((date) => jsonStringArray(jsonRecord(date.eventEvidence).majorEventSignalIds)))],
    publicSignalCoverage,
    policyVersion: "event-impact-v2",
    causalClaim: false,
  } : { publicSignalCoverage, policyVersion: "event-impact-v2", causalClaim: false };
  const demandPressureValues = usable.map((date) => jsonNumber(jsonRecord(date.eventEvidence).demandPressure)).filter((value): value is number => value !== null);
  const disruptionSummary = summariseDateDisruptions(usable.map((date) => date.disruptionImpact));
  const analysis = await prisma.priceAnalysis.create({
    data: { analysisRequestId, marketSnapshotId: snapshot.id, marketMedianMinor: marketMedian, weightedRange: { low: Math.min(...medians), high: Math.max(...medians) }, percentile, comparableCount: Math.min(...usable.map((date) => date.validCompetitorCount)), marketRateIndex: marketMedian / 100, availabilityCompression: average(usable.map((date) => date.availabilityCompression).filter((value): value is number => value !== null)), demandPressure: average(demandPressureValues), eventImpact: eventImpactScore, eventEvidence, accessibilityEffect: disruptionSummary.accessibilityEffect, demandDisplacementEffect: disruptionSummary.demandDisplacementEffect, strandedTravellerEffect: disruptionSummary.strandedTravellerEffect, disruptionDirection: disruptionSummary.direction, marketReferenceRange: { low: Math.min(...medians), high: Math.max(...medians) }, reviewRange: { low: Math.round(marketMedian * 0.9), high: Math.round(marketMedian * 1.1) }, targetPricePosition: position, keyDates, reasonCodes: position === "BELOW_MARKET" ? ["BELOW_COMPARABLE_RANGE", ...(eventDates.length ? ["MAJOR_LOCAL_EVENT"] : [])] : [], recommendedAction: position === "BELOW_MARKET" ? "REVIEW_RATE_UPWARD" : "MONITOR_DATE", confidenceScore, confidenceComponents: { datesPassing: usable.length, datesPlanned: snapshot.dateSnapshots.length, fixture: request.isFixture, eventDates: eventDates.length, demandSignalDates: demandPressureValues.length, disruptionSignalDates: disruptionSummary.signalDates, publicSignalCoverage: jsonNumber(publicSignalCoverage.coverage) ?? 0 }, dataGaps: [...jsonStringArray(snapshot.qualityFlags), ...publicSignalGapCodes], modelVersion: "deterministic-pricing-v1", ruleVersion: "worker-baseline-v1" },
  });
  if (request.isPreview) {
    await prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    return analysis;
  }
  await this.publishFormalResult(request, snapshot.id, analysis.id, confidence, keyDates, jobId);
  return analysis;
}

export async function requireFixtureSource(this: WorkerContext) {
  const source = await prisma.dataSource.findUnique({ where: { key: fixtureSourceKey } });
  if (!source || !source.enabled || source.operationalStatus !== "HEALTHY") throw new WorkerRequestError("SOURCE_UNAVAILABLE", "Development fixture source is unavailable", 503);
  return source;
}

export async function ensureCollectionProfile(this: WorkerContext, request: WorkerAnalysisRequest, dataSourceId: string) {
  return prisma.collectionProfile.upsert({ where: { key: collectionProfileKey }, create: { key: collectionProfileKey, sellableUnitId: request.sellableUnitId, dataSourceId, ipRegion: "NZ", locale: request.locale === "zh" ? "zh-NZ" : "en-NZ", currency: "NZD", deviceType: "DESKTOP", loggedInState: "LOGGED_OUT", memberState: "NON_MEMBER", mobilePriceContext: "STANDARD", publicRateContext: "DEVELOPMENT_FIXTURE", browserProfileVersion: "fixture-browser-v1" }, update: {} });
}

export async function ensureFixtureCompetitors(this: WorkerContext, targetUnitId: string, count = 8) {
  const source = await this.requireFixtureSource();
  const target = await prisma.sellableUnit.findUniqueOrThrow({ where: { id: targetUnitId }, include: { property: true } });
  const addressCoverage = resolveNzAddressSignalCoverage(target.property);
  if (!addressCoverage) throw new WorkerRequestError("INVALID_MARKET_SCOPE", "The target property is not mapped to New Zealand", 422);
  const result = [];
  for (let index = 1; index <= count; index += 1) {
    const propertyId = stableId("fixture-competitor-property", `${target.propertyId}:${index}`);
    const unitId = stableId("fixture-competitor-unit", `${targetUnitId}:${index}`);
    const property = await prisma.property.upsert({ where: { id: propertyId }, create: { id: propertyId, canonicalName: `Fixture Comparable Property ${index}`, address: `${100 + index} Fixture Market Street, ${target.property.city}`, city: target.property.city, countryCode: target.property.countryCode, latitude: target.property.latitude === null ? null : target.property.latitude + index / 10_000, longitude: target.property.longitude === null ? null : target.property.longitude + index / 10_000, region: target.property.region, territorialAuthority: target.property.territorialAuthority, rto: target.property.rto, postcode: target.property.postcode, microMarket: target.property.microMarket, timezone: target.property.timezone, accommodationType: target.property.accommodationType, supportStatus: target.property.supportStatus, identityConfidence: 1, status: "ACTIVE", isDemo: true }, update: {} });
    const unit = await prisma.sellableUnit.upsert({ where: { id: unitId }, create: { id: unitId, propertyId: property.id, canonicalName: `Fixture Comparable Unit ${index}`, officialName: `Fixture Comparable Unit ${index}`, capacity: target.capacity, bedrooms: target.bedrooms, bathrooms: target.bathrooms, bedTypes: inputJson(target.bedTypes, []), bedConfiguration: inputJson(target.bedConfiguration ?? target.bedTypes, []), amenities: inputJson(target.amenities, []), accessibilityAttributes: inputJson(target.accessibilityAttributes, []), unitType: target.unitType, entireOrShared: target.entireOrShared, status: "ACTIVE", version: 1, isDemo: true }, update: {} });
    const externalId = `worker-fixture-comparable-${stableId("x", targetUnitId).slice(-8)}-${index}`;
    const url = `https://example.invalid/worker-fixture/${externalId}`;
    const listing = await prisma.listing.upsert({ where: { dataSourceId_externalId: { dataSourceId: source.id, externalId } }, create: { propertyId: property.id, unitId: unit.id, dataSourceId: source.id, platform: "FIXTURE", externalId, sourceListingId: externalId, canonicalUrl: url, rawUrl: url, url, platformUnitName: unit.officialName, lastConfirmedAt: new Date(), onlineStatus: "ONLINE", listingStatus: "ACTIVE", matchConfidence: 1, operationalStatus: "HEALTHY", metadata: { fixture: true, targetUnitId }, isDemo: true }, update: {} });
    await recordListingVersion(listing.id, { collectedAt: new Date(), collectorVersion: "development-fixture-v1", parserVersion: "fixture.comparable@1.0.0", identityEvidence: { targetUnitId } });
    await prisma.competitorRelationship.upsert({ where: { targetUnitId_competitorUnitId_version: { targetUnitId, competitorUnitId: unit.id, version: 1 } }, create: { targetUnitId, competitorUnitId: unit.id, role: "CORE", version: 1, reasonCode: "FIXTURE_SAME_MICRO_MARKET", suggestedBy: "DETERMINISTIC_COMPARABILITY_V1", isDemo: true }, update: {} });
    await prisma.panelMembership.upsert({ where: { sellableUnitId_marketKey: { sellableUnitId: unit.id, marketKey: addressCoverage.marketKey } }, create: { sellableUnitId: unit.id, marketKey: addressCoverage.marketKey, membershipType: index <= 6 ? "ANCHOR" : "ROTATING", weight: 1, coverage24h: 1, coverage72h: 1, active: true, lastSuccessfulAt: new Date() }, update: { active: true } });
    result.push({ property, unit, listing });
  }
  return result;
}

export async function ensureStayQueryForDate(this: WorkerContext, date: string, analysisRequestId: string) {
  const id = stableId("worker-stay-query", `${analysisRequestId}:${date}:1:2:0:1`);
  const checkIn = nzDateStorageValue(date);
  return prisma.stayQuery.upsert({ where: { id }, create: { id, checkIn, checkOut: nzDateStorageValue(addNzCalendarDays(date, 1)), nights: 1, adults: 2, children: 0, childrenAges: [], units: 1, unitConstraints: {}, mealPlan: "ANY_PUBLIC", currency: "NZD", cancellationCategory: "STANDARD", cancellationPolicy: "ANY_PUBLIC", ratePlan: "PUBLIC", taxAndFeePolicy: "MANDATORY_INCLUDED", publicRateContext: "PUBLIC_ANONYMOUS", querySemanticsVersion: "v1", timezone: "Pacific/Auckland", reason: "Worker query plan date" }, update: {} });
}

export async function analysisObservationIds(this: WorkerContext, request: WorkerAnalysisRequest, querySignatureHash: string) {
  const runs = await prisma.rateObservation.findMany({ where: { quarantine: null, collectionRun: { analysisRequestId: request.id } }, select: { id: true } });
  const cache = await prisma.queryCacheEntry.findUnique({ where: { querySignatureHash_collectionProfileKey: { querySignatureHash, collectionProfileKey } } });
  return [...new Set([...runs.map((item) => item.id), ...jsonStringArray(cache?.observationIds)])];
}

export async function publishFormalResult(this: WorkerContext, request: WorkerAnalysisRequest, marketSnapshotId: string, priceAnalysisId: string, confidence: "HIGH" | "MEDIUM" | "LOW", keyDates: Array<{ date: string; target: number; median: number; gap: number; confidence: string; marketSignalIds: string[]; hasMajorEvent: boolean }>, jobId: string) {
  if (!request.priceCheckId || !request.emailHash || !request.encryptedEmail) throw new Error("Formal analysis is missing PriceCheck or email delivery identity");
  return prisma.$transaction(async (prisma) => {
  if (!request.priceCheckId || !request.emailHash || !request.encryptedEmail) throw new Error("FORMAL_IDENTITY_REQUIRED");
  await prisma.$queryRaw`SELECT id FROM "PriceCheck" WHERE id = ${request.priceCheckId} FOR UPDATE`;
  const owner = await prisma.priceCheck.findUniqueOrThrow({ where: { id: request.priceCheckId! }, include: { customerUser: { select: { status: true } } } });
  if (["CANCELLED", "EXPIRED", "ARCHIVED"].includes(owner.status) || owner.customerUser?.status === "DELETED") throw new Error("REQUEST_NOT_DELIVERABLE");
  const replay = await prisma.resultVersion.findFirst({ where: { priceCheckId: request.priceCheckId, payload: { path: ["generationJobId"], equals: jobId } } });
  if (replay) return replay;
  const current = await prisma.resultVersion.findFirst({ where: { priceCheckId: request.priceCheckId, status: "PUBLISHED" }, orderBy: { version: "desc" } });
  const latest = await prisma.resultVersion.aggregate({ where: { priceCheckId: request.priceCheckId }, _max: { version: true } });
  const snapshot = await prisma.marketSnapshot.findUniqueOrThrow({ where: { id: marketSnapshotId }, select: { marketScope: true, observationIds: true } });
  const observedSources = request.sellableUnitId ? await prisma.rateObservation.findMany({ where: { quarantine: null, id: { in: jsonStringArray(snapshot.observationIds) }, sellableUnitId: request.sellableUnitId }, distinct: ["dataSourceId"], select: { dataSourceId: true } }) : [];
  const publicSignalCoverage = jsonRecord(jsonRecord(snapshot.marketScope).publicSignalCoverage);
  const addressCoverage = jsonRecord(publicSignalCoverage.addressCoverage);
  const publicSignalIncomplete = publicSignalCoverage.complete === false || addressCoverage.level !== "FULL";
  const result = await prisma.resultVersion.create({ data: { priceCheckId: request.priceCheckId, analysisRequestId: request.id, version: (latest._max.version ?? 0) + 1, status: "PUBLISHED", outcome: "PUBLISHED", generatedAt: new Date(), publishedAt: new Date(), dataLastCheckedAt: new Date(), analysisVersion: "worker-baseline-v1", confidence, priceResultStatus: "COMPLETED", recommendationStatus: publicSignalIncomplete ? "LIMITED_EVIDENCE" : "COMPLETED", observedSourceCount: observedSources.length, priceEvidenceStatus: observedSources.length > 1 ? "OBSERVED_MULTI_SOURCE" : "OBSERVED_SINGLE_SOURCE", recommendationReasonCode: publicSignalIncomplete ? "PUBLIC_SIGNAL_COVERAGE_INCOMPLETE" : null, payload: { generationJobId: jobId, priceAnalysisId, fixture: request.isFixture, disclaimer: request.isFixture ? "Development fixture data. Not real market data." : null, dateRangeDays: 30, keyDateCount: keyDates.length, publicSignalCoverage }, supersedesId: current?.id, isDemo: request.isFixture, marketSnapshotId } });
  if (current) await prisma.resultVersion.update({ where: { id: current.id }, data: { status: "SUPERSEDED" } });
  const insightIds: string[] = [];
  for (const [index, item] of keyDates.entries()) {
    const insight = await prisma.insight.create({ data: { id: `${result.id}:insight:${index + 1}`, resultVersionId: result.id, stayDate: nzDateStorageValue(item.date), risk: item.gap > item.median * 0.15 ? "REVIEW" : "WATCH", reasonCodes: item.gap > 0 ? ["BELOW_COMPARABLE_RANGE", ...(item.hasMajorEvent ? ["MAJOR_LOCAL_EVENT"] : [])] : [], marketSignalIds: item.marketSignalIds, targetPriceMinor: item.target, competitorMedianMinor: item.median, competitorLowMinor: Math.round(item.median * 0.9), competitorHighMinor: Math.round(item.median * 1.1), recommendedAction: item.gap > 0 ? "REVIEW_RATE_UPWARD" : "MONITOR_DATE", confidence: item.confidence as "HIGH" | "MEDIUM" | "LOW", limitations: [...(request.isFixture ? ["Development fixture data. Not real market data."] : []), ...(publicSignalIncomplete ? ["PUBLIC_SIGNAL_COVERAGE_INCOMPLETE"] : [])], explanation: { whatChanged: "The observed public target rate is compared with the unique CORE cohort.", whyItMatters: item.hasMajorEvent ? "A promoted local event corroborates the price comparison for this date; it does not prove causation by itself." : "This date may warrant a rate review; this is not a guaranteed optimal price.", suggestedAction: item.gap > 0 ? "Review the public rate and operational context before changing price." : "Monitor this date." } } });
    insightIds.push(insight.id);
  }
  await recordTransformation({ transformationType: "PUBLISH_PRICING_RESULT", transformationVersion: "worker-baseline-v1", inputs: [{ type: "MARKET_SNAPSHOT", id: marketSnapshotId }, { type: "NORMALIZED_FACT", id: priceAnalysisId }], outputs: [{ type: "RESULT_VERSION", id: result.id }, ...insightIds.map((id) => ({ type: "INSIGHT" as const, id }))], metadata: { jobId, confidence } }, prisma);
  await Promise.all([
    prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
    prisma.priceCheck.update({ where: { id: request.priceCheckId }, data: { status: "PUBLISHED", currentResultVersionNumber: result.version, dataSnapshotVersion: marketSnapshotId } }),
  ]);
  await prisma.emailDelivery.updateMany({ where: { priceCheckId: request.priceCheckId, resultVersionId: { not: result.id }, status: { in: ["PENDING", "FAILED"] } }, data: { status: "CANCELLED", lastError: "Superseded result version" } });
  const emailKey = `${request.id}:${request.emailHash}:result-ready:${result.id}`;
  const delivery = await prisma.emailDelivery.upsert({ where: { idempotencyKey: emailKey }, create: { analysisRequestId: request.id, priceCheckId: request.priceCheckId, resultVersionId: result.id, type: "RESULT_READY", locale: request.locale, recipientHash: request.emailHash, encryptedRecipient: request.encryptedEmail, provider: "pending", idempotencyKey: emailKey }, update: {} });
  await enqueueJob({ type: "EMAIL_DELIVERY", payload: { deliveryId: delivery.id }, idempotencyKey: `${emailKey}:job`, analysisRequestId: request.id, priceCheckId: request.priceCheckId, correlationId: request.correlationId, snapshotId: marketSnapshotId, resultVersionId: result.id }, prisma);
  return result;
  }, { timeout: 15000 });
}

export async function publishObservedOnlyResult(this: WorkerContext, request: WorkerAnalysisRequest, marketSnapshotId: string, dates: Array<{ stayDate: Date; targetRateMinor: number | null; qualityFlags: Prisma.JsonValue }>, jobId: string) {
  if (!request.priceCheckId || !request.emailHash || !request.encryptedEmail || !request.sellableUnitId) throw new Error("Formal analysis is missing customer or target identity");
  const snapshot = await prisma.marketSnapshot.findUniqueOrThrow({ where: { id: marketSnapshotId }, select: { observationIds: true, marketScope: true } });
  const observations = await prisma.rateObservation.findMany({
    where: { quarantine: null, id: { in: jsonStringArray(snapshot.observationIds) }, sellableUnitId: request.sellableUnitId, availabilityStatus: "AVAILABLE" },
    include: { dataSource: { select: { key: true } }, listing: { select: { canonicalUrl: true } } },
    orderBy: { collectedAt: "desc" },
  });
  if (!observations.length) {
    await this.failBusiness(request, "INSUFFICIENT_DATA", "NO_TARGET_PRICE", "No valid target-property OTA price was observed");
    return;
  }
  return prisma.$transaction(async (prisma) => {
  if (!request.priceCheckId || !request.emailHash || !request.encryptedEmail) throw new Error("FORMAL_IDENTITY_REQUIRED");
  await prisma.$queryRaw`SELECT id FROM "PriceCheck" WHERE id = ${request.priceCheckId} FOR UPDATE`;
  const owner = await prisma.priceCheck.findUniqueOrThrow({ where: { id: request.priceCheckId! }, include: { customerUser: { select: { status: true } } } });
  if (["CANCELLED", "EXPIRED", "ARCHIVED"].includes(owner.status) || owner.customerUser?.status === "DELETED") throw new Error("REQUEST_NOT_DELIVERABLE");
  const replay = await prisma.resultVersion.findFirst({ where: { priceCheckId: request.priceCheckId, payload: { path: ["generationJobId"], equals: jobId } } });
  if (replay) return replay;
  const current = await prisma.resultVersion.findFirst({ where: { priceCheckId: request.priceCheckId, status: "PUBLISHED" }, orderBy: { version: "desc" } });
  const latest = await prisma.resultVersion.aggregate({ where: { priceCheckId: request.priceCheckId }, _max: { version: true } });
  const observedPrices = observations.map((item) => ({ source: item.dataSource.key, amountMinor: item.displayedAmountMinor ?? item.totalAmountMinor, currency: item.currency, basis: item.priceBasis, feeCompleteness: item.feeCompleteness, sourceUrl: item.listing.canonicalUrl, asOf: item.collectedAt.toISOString() }));
  const observedSourceCount = new Set(observations.map((item) => item.dataSourceId)).size;
  const result = await prisma.resultVersion.create({
    data: {
      priceCheckId: request.priceCheckId,
      analysisRequestId: request.id,
      version: (latest._max.version ?? 0) + 1,
      status: "PUBLISHED",
      outcome: "PUBLISHED",
      generatedAt: new Date(),
      publishedAt: new Date(),
      dataLastCheckedAt: observations[0].collectedAt,
      analysisVersion: "worker-observed-price-v1",
      confidence: "LOW",
      priceResultStatus: "COMPLETED",
      recommendationStatus: "NOT_AVAILABLE",
      observedSourceCount,
      priceEvidenceStatus: observedSourceCount > 1 ? "OBSERVED_MULTI_SOURCE" : "OBSERVED_SINGLE_SOURCE",
      recommendationReasonCode: "NOT_ENOUGH_COMPARABLE_EVIDENCE",
      payload: { generationJobId: jobId, observedPrices, publicSignalCoverage: jsonRecord(jsonRecord(snapshot.marketScope).publicSignalCoverage), recommendationUnavailable: true },
      supersedesId: current?.id,
      isDemo: request.isFixture,
      marketSnapshotId,
    },
  });
  if (current) await prisma.resultVersion.update({ where: { id: current.id }, data: { status: "SUPERSEDED" } });
  const insightIds: string[] = [];
  for (const [index, date] of dates.entries()) {
    const insight = await prisma.insight.create({
      data: {
        id: `${result.id}:observed:${index + 1}`,
        resultVersionId: result.id,
        stayDate: date.stayDate,
        risk: "NO_CLEAR_RISK",
        reasonCodes: ["NOT_ENOUGH_COMPARABLE_EVIDENCE"],
        marketSignalIds: [],
        targetPriceMinor: date.targetRateMinor,
        competitorMedianMinor: null,
        competitorLowMinor: null,
        competitorHighMinor: null,
        recommendedAction: "NO_RECOMMENDATION",
        confidence: "LOW",
        limitations: ["NOT_ENOUGH_COMPARABLE_EVIDENCE", ...jsonStringArray(date.qualityFlags)],
        explanation: { whatChanged: "A public target-property price was observed.", whyItMatters: "The price is valid even though adjustment evidence is insufficient.", suggestedAction: "Do not treat this observation as a market recommendation." },
      },
    });
    insightIds.push(insight.id);
  }
  await recordTransformation({ transformationType: "PUBLISH_OBSERVED_PRICE_RESULT", transformationVersion: "worker-observed-price-v1", inputs: [{ type: "MARKET_SNAPSHOT", id: marketSnapshotId }, ...observations.map((observation) => ({ type: "NORMALIZED_FACT" as const, id: observation.id }))], outputs: [{ type: "RESULT_VERSION", id: result.id }, ...insightIds.map((id) => ({ type: "INSIGHT" as const, id }))], metadata: { jobId, observedSourceCount } }, prisma);
  await Promise.all([
    prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
    prisma.priceCheck.update({ where: { id: request.priceCheckId }, data: { status: "PUBLISHED", currentResultVersionNumber: result.version, dataSnapshotVersion: marketSnapshotId } }),
  ]);
  await prisma.emailDelivery.updateMany({ where: { priceCheckId: request.priceCheckId, resultVersionId: { not: result.id }, status: { in: ["PENDING", "FAILED"] } }, data: { status: "CANCELLED", lastError: "Superseded result version" } });
  const emailKey = `${request.id}:${request.emailHash}:observed-price-ready:${result.id}`;
  const delivery = await prisma.emailDelivery.upsert({ where: { idempotencyKey: emailKey }, create: { analysisRequestId: request.id, priceCheckId: request.priceCheckId, resultVersionId: result.id, type: "RESULT_READY", locale: request.locale, recipientHash: request.emailHash, encryptedRecipient: request.encryptedEmail, provider: "pending", idempotencyKey: emailKey }, update: {} });
  await enqueueJob({ type: "EMAIL_DELIVERY", payload: { deliveryId: delivery.id }, idempotencyKey: `${emailKey}:job`, analysisRequestId: request.id, priceCheckId: request.priceCheckId, correlationId: request.correlationId, snapshotId: marketSnapshotId, resultVersionId: result.id }, prisma);
  return result;
  }, { timeout: 15000 });
}

export function fixtureEnabled(this: WorkerContext) {
  return this.environment.NODE_ENV !== "production" && this.environment.FIXTURE_COLLECTION_ENABLED && ["demo", "fixture"].includes(this.environment.PROVIDER_MODE);
}
