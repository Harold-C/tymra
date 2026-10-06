import { randomBytes, randomUUID } from "node:crypto";
import { addressIdentityPersistentCache, encryptPersonalData, enqueueJob, hashOpaqueToken, hashPersonalIdentifier, prisma, Prisma, recordIdentityEntityVersion, recordListingVersion, recordQualityAssessments, sourceHasCapability, type WorkerAnalysisRequest, type WorkerAnalysisStatus } from "@tymra/db";
import { buildDailyPriceDates, buildNationalDateBasket, createQuerySignature, membershipEntitlements, NEW_ZEALAND_TIME_ZONE, addNzCalendarDays, nzDateStorageValue } from "@tymra/domain";
import { AdapterError, type AdapterContext, type OtaAdapter, type ResolvedOtaListing } from "@tymra/providers/types";
import { getOtaAdapterForInput, otaAdapters } from "@tymra/providers/ota-adapters";
import { linzAddressIdentityProvider, normalizeAddressQuery } from "@tymra/providers/address-identity";
import { otaProviderDetails } from "@tymra/providers/ota-argus-contracts";
import { resolveNzAddressSignalCoverage } from "@tymra/providers/nz-market-coverage";
import { withRedisLockWait } from "@tymra/queue";
import { CreateWorkerRequest, ConfirmWorkerRequest } from "./contracts";
import { collectionProfileKey, stableId, looksLikeUrl, looksLikeAddress, tomorrow, jsonStringArray, propertySupportStatus, mapWorkerStatusToPriceCheck } from "./helpers";
import { WorkerRequestError } from "./errors";
import type { WorkerContext } from "./context";

export async function createPreview(this: WorkerContext, input: CreateWorkerRequest) {
  return this.createRequest({ ...input, email: undefined, serviceConsent: false }, true);
}

export async function createFormalAnalysis(this: WorkerContext, input: CreateWorkerRequest) {
  if (!input.email || !/^\S+@\S+\.\S+$/.test(input.email.trim().toLowerCase())) throw new WorkerRequestError("INVALID_EMAIL", "A valid email is required", 422);
  if (input.serviceConsent !== true) throw new WorkerRequestError("SERVICE_CONSENT_REQUIRED", "Service email consent is required", 422);
  return this.createRequest(input, false);
}

export async function confirmAnalysis(this: WorkerContext, analysisRequestId: string, input: ConfirmWorkerRequest) {
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

export async function getAnalysis(this: WorkerContext, id: string) {
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

export async function getResult(this: WorkerContext, id: string) {
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

export async function cancelAnalysis(this: WorkerContext, id: string) {
  const request = await prisma.workerAnalysisRequest.findUniqueOrThrow({ where: { id } });
  if (["COMPLETED", "CANCELLED"].includes(request.status)) return request;
  await prisma.$transaction([
    prisma.workerAnalysisRequest.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } }),
    prisma.job.updateMany({ where: { analysisRequestId: id, status: { in: ["PENDING", "RUNNING"] } }, data: { status: "CANCELLED", completedAt: new Date(), lockedAt: null, lockedBy: null, leaseExpiresAt: null } }),
    ...(request.priceCheckId ? [prisma.priceCheck.update({ where: { id: request.priceCheckId }, data: { status: "CANCELLED" } })] : []),
  ]);
  return prisma.workerAnalysisRequest.findUniqueOrThrow({ where: { id } });
}

export async function resendResultNotification(this: WorkerContext, id: string) {
  const request = await prisma.workerAnalysisRequest.findUniqueOrThrow({ where: { id }, include: { resultVersions: { where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1 } } });
  const result = request.resultVersions[0];
  if (!result || !request.emailHash || !request.encryptedEmail) throw new WorkerRequestError("RESULT_NOT_READY", "No published result is available", 409);
  const key = `${request.id}:${request.emailHash}:result-reminder-v1:${result.version}`;
  const delivery = await prisma.emailDelivery.upsert({
    where: { idempotencyKey: key },
    create: { analysisRequestId: request.id, priceCheckId: request.priceCheckId, resultVersionId: result.id, type: "RESULT_REMINDER", locale: request.locale, recipientHash: request.emailHash, encryptedRecipient: request.encryptedEmail, provider: "pending", idempotencyKey: key },
    update: {},
  });
  await enqueueJob({ type: "EMAIL_DELIVERY", payload: { deliveryId: delivery.id }, idempotencyKey: `${key}:job`, analysisRequestId: request.id, priceCheckId: request.priceCheckId ?? undefined, correlationId: request.correlationId });
  return delivery;
}

export async function createRequest(this: WorkerContext, input: CreateWorkerRequest, isPreview: boolean) {
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

export async function resolveAndPersistInput(this: WorkerContext, input: string, correlationId: string, locale: "en" | "zh") {
  const fixture = this.fixtureEnabled();
  let adapter: OtaAdapter | null = getOtaAdapterForInput(input);
  let resolvedInput = input;
  let resolvedAddress: ResolvedOtaListing | null = null;
  if (!adapter && looksLikeAddress(input) && !/\bfixture\b/i.test(input)) {
    let identityResult;
    try {
      identityResult = await linzAddressIdentityProvider.search(input, {
        correlationId,
        limit: 10,
        queryHash: hashPersonalIdentifier(normalizeAddressQuery(input), this.environment.ACCESS_KEY_SECRET),
        persistentCache: addressIdentityPersistentCache,
        withCacheLock: (key, operation) => withRedisLockWait(key, 15_000, operation),
      });
    } catch (error) {
      throw new WorkerRequestError("SOURCE_UNAVAILABLE", error instanceof Error ? error.message : "LINZ address source is unavailable", 503);
    }
    if (identityResult.matchStatus === "MULTIPLE") throw new WorkerRequestError("AMBIGUOUS_ADDRESS", "Multiple LINZ addresses match; confirm a single address before starting analysis", 409);
    const identity = identityResult.matchStatus === "UNIQUE" ? identityResult.candidates[0] : null;
    if (!identity) throw new WorkerRequestError("ADDRESS_NOT_CONFIRMED", "No sufficiently confident LINZ address match was found", 422);
    if (!fixture) {
      throw new WorkerRequestError("LISTING_REQUIRED", "The address is confirmed; add a matching supported public OTA listing before analysis", 409);
    }
    resolvedAddress = {
      sourceId: "linz",
      sourceListingId: identity.externalId,
      canonicalUrl: identity.sourceUrl,
      rawUrl: input,
      property: {
        externalId: identity.externalId,
        canonicalName: `Property at ${identity.normalizedAddress}`,
        address: identity.normalizedAddress,
        city: identity.city,
        countryCode: "NZ",
        region: identity.region ?? "",
        territorialAuthority: identity.territorialAuthority,
        rto: identity.rto,
        postcode: identity.postcode ?? "",
        latitude: identity.latitude,
        longitude: identity.longitude,
        microMarket: null,
        timezone: "Pacific/Auckland",
        propertyType: "UNCLASSIFIED_ACCOMMODATION",
      },
      units: [{ externalId: `${identity.externalId}:entire-property`, canonicalName: "Entire property", sourceUnitName: "Entire property", unitType: "UNCONFIRMED", bedrooms: null, bathrooms: null, beds: [], occupancyCapacity: 2, entireOrShared: "ENTIRE", amenities: [] }],
      matchConfidence: identity.confidence,
      operationalStatus: "HEALTHY",
      fixture: false,
    };
  }
  if (!adapter && !resolvedAddress && fixture) {
    adapter = otaAdapters.booking;
    const slug = input.toLowerCase().includes("multiple") || input.toLowerCase().includes("hotel") || input.toLowerCase().includes("motel") ? `fixture-multi-hotel-${stableId("input", input).slice(-8)}` : `fixture-property-${stableId("input", input).slice(-8)}`;
    resolvedInput = `https://www.booking.com/hotel/nz/${slug}.html`;
  }
  if (!adapter && !resolvedAddress) throw new WorkerRequestError("SOURCE_UNAVAILABLE", "Property/address discovery requires a configured source", 503);
  const context: AdapterContext = { mode: fixture ? "fixture" : "live", correlationId, locale, currency: "NZD" };
  let resolved: ResolvedOtaListing;
  try { resolved = resolvedAddress ?? await adapter!.resolveListing(resolvedInput, context); }
  catch (error) {
    if (error instanceof AdapterError) throw new WorkerRequestError(error.code, error.message, error.code === "INVALID_INPUT" ? 422 : 503);
    throw error;
  }
  const source = await prisma.dataSource.findUnique({ where: { key: resolved.sourceId } });
  if (!source) throw new WorkerRequestError("SOURCE_UNAVAILABLE", `SourceRegistry is missing ${resolved.sourceId}; run the seed`, 503);
  if (!resolvedAddress && !await sourceHasCapability(source.id, "RESOLVE_LISTING")) {
    throw new WorkerRequestError("SOURCE_CAPABILITY_MISSING", `${resolved.sourceId} is not registered for RESOLVE_LISTING`, 409);
  }
  const addressCoverage = resolveNzAddressSignalCoverage(resolved.property);
  if (!addressCoverage) throw new WorkerRequestError("INVALID_MARKET_SCOPE", "The resolved property is not in New Zealand", 422);
  const propertyId = stableId("property", resolved.property.externalId);
  const property = await prisma.property.upsert({
    where: { id: propertyId },
    create: { id: propertyId, canonicalName: resolved.property.canonicalName, legalOrBrandName: resolved.property.canonicalName, address: resolved.property.address, city: resolved.property.city, countryCode: resolved.property.countryCode, latitude: resolved.property.latitude, longitude: resolved.property.longitude, region: resolved.property.region, territorialAuthority: resolved.property.territorialAuthority, rto: resolved.property.rto, postcode: resolved.property.postcode, microMarket: resolved.property.microMarket, timezone: NEW_ZEALAND_TIME_ZONE, accommodationType: resolved.property.propertyType, supportStatus: propertySupportStatus(addressCoverage.level), identityConfidence: resolved.matchConfidence, status: "ACTIVE", isDemo: fixture },
    update: { canonicalName: resolved.property.canonicalName, address: resolved.property.address, city: resolved.property.city, countryCode: resolved.property.countryCode, latitude: resolved.property.latitude, longitude: resolved.property.longitude, region: resolved.property.region, territorialAuthority: resolved.property.territorialAuthority, rto: resolved.property.rto, postcode: resolved.property.postcode, microMarket: resolved.property.microMarket, timezone: NEW_ZEALAND_TIME_ZONE, supportStatus: propertySupportStatus(addressCoverage.level), identityConfidence: resolved.matchConfidence, status: "ACTIVE" },
  });
  await recordIdentityEntityVersion("PROPERTY", property.id, { collectedAt: new Date(), collectorVersion: adapter?.metadata.collectorVersion, parserVersion: adapter?.metadata.parserVersion, identityEvidence: { sourceId: resolved.sourceId, sourceListingId: resolved.sourceListingId } });
  const units = [];
  const listings = [];
  const provider = otaProviderDetails(resolved.sourceId);
  for (const unit of resolved.units) {
    const unitId = stableId("unit", `${resolved.sourceId}:${resolved.sourceListingId}:${unit.externalId}`);
    const persistedUnit = await prisma.sellableUnit.upsert({
      where: { id: unitId },
      create: { id: unitId, propertyId: property.id, canonicalName: unit.canonicalName, officialName: unit.sourceUnitName, capacity: unit.occupancyCapacity, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms, bedTypes: unit.beds, bedConfiguration: unit.beds, amenities: unit.amenities, accessibilityAttributes: [], unitType: unit.unitType, entireOrShared: unit.entireOrShared, status: "ACTIVE", version: 1, isDemo: fixture },
      update: { canonicalName: unit.canonicalName, officialName: unit.sourceUnitName, capacity: unit.occupancyCapacity, status: "ACTIVE" },
    });
    await recordIdentityEntityVersion("SELLABLE_UNIT", persistedUnit.id, { collectedAt: new Date(), collectorVersion: adapter?.metadata.collectorVersion, parserVersion: adapter?.metadata.parserVersion, identityEvidence: { sourceId: resolved.sourceId, sourceListingId: resolved.sourceListingId, sourceUnitId: unit.externalId } });
    const externalId = resolved.units.length === 1 ? resolved.sourceListingId : `${resolved.sourceListingId}:${unit.externalId}`;
    const persistedListing = await prisma.listing.upsert({
      where: { dataSourceId_externalId: { dataSourceId: source.id, externalId } },
      create: { propertyId: property.id, unitId: persistedUnit.id, dataSourceId: source.id, platform: resolved.sourceId.toUpperCase(), providerBrand: provider?.brand, providerFamily: provider?.family, externalId, sourceListingId: resolved.sourceListingId, canonicalUrl: resolved.canonicalUrl, rawUrl: input, url: resolved.canonicalUrl, platformUnitName: unit.sourceUnitName, lastConfirmedAt: new Date(), onlineStatus: "ONLINE", listingStatus: "ACTIVE", matchConfidence: resolved.matchConfidence, operationalStatus: resolved.operationalStatus, metadata: { adapterKey: adapter?.metadata.adapterKey ?? "identity:linz-nz-addresses:arcgis-v1", fixture, identityProvider: resolvedAddress ? "linz-nz-addresses" : null }, isDemo: fixture },
      update: { propertyId: property.id, unitId: persistedUnit.id, providerBrand: provider?.brand, providerFamily: provider?.family, canonicalUrl: resolved.canonicalUrl, rawUrl: input, platformUnitName: unit.sourceUnitName, lastConfirmedAt: new Date(), onlineStatus: "ONLINE", listingStatus: "ACTIVE", matchConfidence: resolved.matchConfidence, operationalStatus: resolved.operationalStatus },
    });
    const listingVersion = await recordListingVersion(persistedListing.id, {
      collectedAt: new Date(),
      collectorVersion: adapter?.metadata.collectorVersion,
      parserVersion: adapter?.metadata.parserVersion,
      identityEvidence: { sourceListingId: resolved.sourceListingId, unitExternalId: unit.externalId, matchConfidence: resolved.matchConfidence },
    });
    await recordQualityAssessments({ entityType: "LISTING_VERSION", entityId: listingVersion.id, dataDomain: "OTA_IDENTITY", usagePurpose: "ANALYSIS", referenceTime: listingVersion.collectedAt, freshnessLimitSeconds: this.environment.FRESHNESS_CORE_HOURS * 3_600, freshnessState: "FRESH", confidenceLayer: "IDENTITY", confidenceScore: resolved.matchConfidence, confidenceLevel: resolved.matchConfidence >= 0.9 ? "HIGH" : resolved.matchConfidence >= 0.7 ? "MEDIUM" : "LOW", limitations: resolved.matchConfidence < 0.9 ? ["PARTIAL_IDENTITY_EVIDENCE"] : [] });
    units.push(persistedUnit);
    listings.push(persistedListing);
  }
  return { source, property, units, listings, fixture };
}

export async function createBackingPriceCheck(this: WorkerContext, request: WorkerAnalysisRequest) {
  if (!request.emailHash || !request.encryptedEmail) throw new Error("Formal analysis is missing email identity");
  const start = tomorrow();
  const property = request.propertyId ? await prisma.property.findUnique({ where: { id: request.propertyId } }) : null;
  const addressCoverage = property ? resolveNzAddressSignalCoverage(property) : null;
  if (!addressCoverage) throw new WorkerRequestError("INVALID_MARKET_SCOPE", "The confirmed property is not mapped to New Zealand", 422);
  const stayQuery = await prisma.stayQuery.create({ data: { checkIn: start, checkOut: nzDateStorageValue(addNzCalendarDays(start, 1)), nights: 1, adults: 2, children: 0, childrenAges: [], units: 1, unitConstraints: {}, mealPlan: "ANY_PUBLIC", currency: "NZD", cancellationCategory: "STANDARD", cancellationPolicy: "ANY_PUBLIC", ratePlan: "PUBLIC", taxAndFeePolicy: "MANDATORY_INCLUDED", publicRateContext: "PUBLIC_ANONYMOUS", querySemanticsVersion: "v1", timezone: "Pacific/Auckland", reason: "Worker Baseline default formal analysis" } });
  const accessToken = randomBytes(32).toString("base64url");
  const check = await prisma.priceCheck.create({ data: { rawInput: request.rawInput, locale: request.locale, emailHash: request.emailHash, encryptedEmail: request.encryptedEmail, serviceConsent: true, marketingConsent: request.marketingConsent, propertyId: request.propertyId, unitId: request.sellableUnitId, stayQueryId: stayQuery.id, marketKey: addressCoverage.marketKey, status: request.status === "NEEDS_CONFIRMATION" ? "NEEDS_CONFIRMATION" : "QUEUED", accessKeyHash: hashOpaqueToken(accessToken, this.environment.ACCESS_KEY_SECRET), idempotencyKey: `${request.idempotencyKey}:price-check`, rulesVersion: "worker-baseline-v1", isDemo: request.isFixture } });
  await prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { priceCheckId: check.id } });
}

export async function ensureQueryPlan(this: WorkerContext, request: WorkerAnalysisRequest & { queryPlans?: unknown[] }) {
  const existing = await prisma.queryPlan.findFirst({ where: { analysisRequestId: request.id }, orderBy: { version: "desc" } });
  if (existing) return existing;
  if (!request.targetListingId || !request.sellableUnitId) throw new WorkerRequestError("UNIT_UNCONFIRMED", "A specific Sellable Unit and Listing are required", 409);
  const customerPlan = request.priceCheckId ? await prisma.priceCheck.findUnique({
    where: { id: request.priceCheckId },
    select: { customerUser: { select: { membership: { select: { plan: true } } } } },
  }) : null;
  const planId = customerPlan?.customerUser?.membership?.plan ?? "HOST";
  const dailyHorizonDays = membershipEntitlements[planId].dailyPriceCheckHorizonDays;
  const dateBasket = request.isPreview ? buildNationalDateBasket(new Date()).slice(0, 2) : buildDailyPriceDates(new Date(), dailyHorizonDays);
  const firstDate = nzDateStorageValue(dateBasket[0].checkIn);
  const stayQuery = await prisma.stayQuery.create({ data: { checkIn: firstDate, checkOut: nzDateStorageValue(addNzCalendarDays(dateBasket[0].checkIn, 1)), nights: 1, adults: 2, children: 0, childrenAges: [], units: 1, unitConstraints: {}, mealPlan: "ANY_PUBLIC", currency: "NZD", cancellationCategory: "STANDARD", cancellationPolicy: "ANY_PUBLIC", ratePlan: "PUBLIC", taxAndFeePolicy: "MANDATORY_INCLUDED", publicRateContext: "PUBLIC_ANONYMOUS", querySemanticsVersion: "v1", timezone: "Pacific/Auckland", reason: request.isPreview ? "Anonymous preliminary date basket" : `Membership ${planId} ${dailyHorizonDays}-day price basket` } });
  const signature = createQuerySignature({ sourceId: request.dataSourceId!, listingId: request.targetListingId, sellableUnitId: request.sellableUnitId, checkIn: firstDate, nights: 1, adults: 2, childrenAges: [], units: 1, unitConstraints: {}, mealPlan: "ANY_PUBLIC", cancellationPolicy: "ANY_PUBLIC", ratePlan: "PUBLIC", currency: "NZD", taxAndFeePolicy: "MANDATORY_INCLUDED", collectionProfileId: collectionProfileKey, publicRateContext: "PUBLIC_ANONYMOUS", querySemanticsVersion: "v1" });
  await prisma.stayQuery.update({ where: { id: stayQuery.id }, data: { querySignatureHash: signature.hash } });
  return prisma.queryPlan.create({ data: { analysisRequestId: request.id, priceCheckId: request.priceCheckId, stayQueryId: stayQuery.id, dataSourceId: request.dataSourceId, version: 1, dateBasket: dateBasket as unknown as Prisma.InputJsonValue, querySignatureHash: signature.hash, querySignaturePayload: signature.payload as unknown as Prisma.InputJsonValue, collectionProfileKey, generationPolicyVersion: request.isPreview ? "preview-plan-v1" : `membership-${planId.toLowerCase()}-${dailyHorizonDays}-day-v1`, freshnessPolicyVersion: "freshness-v1" } });
}

export async function enqueueCollection(this: WorkerContext, request: WorkerAnalysisRequest) {
  await this.enqueueWorkerJob(request, "RATE_COLLECTION", {}, "rate-collection");
}

export async function enqueueWorkerJob(this: WorkerContext, request: Pick<WorkerAnalysisRequest, "id" | "correlationId" | "priceCheckId" | "targetListingId" | "sellableUnitId">, type: Parameters<typeof enqueueJob>[0]["type"], payload: Record<string, unknown>, suffix: string) {
  return enqueueJob({ type, payload: { ...payload, analysisRequestId: request.id }, idempotencyKey: `${request.id}:${suffix}`, analysisRequestId: request.id, priceCheckId: request.priceCheckId ?? undefined, correlationId: request.correlationId, listingId: request.targetListingId ?? undefined, sellableUnitId: request.sellableUnitId ?? undefined });
}

export async function requireReadyIdentity(this: WorkerContext, id: string) {
  const request = await prisma.workerAnalysisRequest.findUniqueOrThrow({ where: { id }, include: { property: true, priceCheck: { select: { analysisType: true } }, queryPlans: { orderBy: { version: "desc" }, take: 1 } } });
  if (!request.propertyId || !request.sellableUnitId || !request.targetListingId) throw new WorkerRequestError("UNIT_UNCONFIRMED", "Property, Sellable Unit and OTA Listing must be confirmed", 409);
  if (request.status === "CANCELLED") throw new WorkerRequestError("CANCELLED", "The analysis was cancelled", 409);
  return request;
}

export async function setStatus(this: WorkerContext, request: Pick<WorkerAnalysisRequest, "id" | "priceCheckId">, status: WorkerAnalysisStatus) {
  await prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { status } });
  if (!request.priceCheckId) return;
  const mapped = mapWorkerStatusToPriceCheck(status);
  if (mapped) await prisma.priceCheck.update({ where: { id: request.priceCheckId }, data: { status: mapped } });
}

export async function failBusiness(this: WorkerContext, request: Pick<WorkerAnalysisRequest, "id" | "priceCheckId">, status: "INSUFFICIENT_DATA" | "SOURCE_UNAVAILABLE" | "PARTIAL", code: string, message: string) {
  await prisma.workerAnalysisRequest.update({ where: { id: request.id }, data: { status, failureCode: code, failureMessage: message, completedAt: new Date() } });
  if (request.priceCheckId) await prisma.priceCheck.update({ where: { id: request.priceCheckId }, data: { status } });
}

export async function enforceWorkerLimits(this: WorkerContext, input: CreateWorkerRequest, isPreview: boolean, sellableUnitId: string | null) {
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

export async function recordWorkerUsage(this: WorkerContext, request: WorkerAnalysisRequest, input: CreateWorkerRequest, isPreview: boolean) {
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

export async function recordAbuseDecision(this: WorkerContext, action: string, subjectHash: string, reasonCodes: string[]) {
  const blocked = reasonCodes.length > 0;
  await prisma.abuseDecision.create({ data: { action, subjectHash, outcome: blocked ? "COOLDOWN" : "ALLOW", reasonCodes, cooldownUntil: blocked ? new Date(Date.now() + 3_600_000) : null } });
}
