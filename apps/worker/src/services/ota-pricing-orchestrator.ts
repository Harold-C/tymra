import { createHash } from "node:crypto";

import type { Environment } from "@tymra/config";
import { prisma, Prisma } from "@tymra/db";
import { nzDateKey } from "@tymra/domain";
import {
  locateOtaDiscoveryCandidate,
  otaArgusConnectorForSource,
  otaCollectRatesExtractionSchema,
  otaDiscoverListingsExtractionSchema,
  otaDiscoveryUrlForSource,
  otaProviderDetails,
  otaResolveListingExtractionSchema,
} from "@tymra/providers";
import type { ArgusBrowserTaskResult } from "../clients/argus-client";
import { ACTIVE_OTA_SOURCE_KEYS, otaCollectionFailureCode } from "../operations/ota-health";
import { sortOtaSourcesByMarketWeight } from "../operations/ota-source-priority";
import { captureBrowserTaskWithDurableArgus, durableArgusTraceId } from "./argus-orchestrator";
import { publicOtaPrice } from "./ota-price";

type PersistEvidence = (
  dataSourceId: string,
  collectionRunId: string,
  result: ArgusBrowserTaskResult,
  extractor: string,
  requestedUrl: string,
) => Promise<void>;

type AddressOtaPricingInput = {
  environment: Environment;
  priceCheckId: string;
  parentJobId: string;
  reuseCachedComparable: boolean;
  persistEvidence: PersistEvidence;
};

export async function discoverAndCollectAddressOtaComparables(input: AddressOtaPricingInput) {
  const check = await prisma.priceCheck.findUniqueOrThrow({
    where: { id: input.priceCheckId },
    include: { property: true, unit: true, stayQuery: true },
  });
  if (!check.property || !check.unit || !check.stayQuery) {
    throw new Error("Price Check is missing a confirmed Property, Unit or Stay Query");
  }

  const cachedComparable = input.reuseCachedComparable ? await prisma.listing.findFirst({
    where: {
      listingStatus: "ACTIVE",
      operationalStatus: "HEALTHY",
      isDemo: false,
      metadata: { path: ["discoveredFor"], equals: check.property.id },
      unit: { status: "ACTIVE", capacity: { gte: check.stayQuery.adults } },
      dataSource: { sourceType: "OTA", enabled: true, operationalStatus: "HEALTHY" },
    },
    orderBy: { lastConfirmedAt: "desc" },
  }) : null;
  if (cachedComparable) {
    const collected = await collectComparableOtaRate(input, cachedComparable.id, true);
    const cachedRun = await prisma.collectionRun.findFirst({
      where: { jobId: input.parentJobId, dataSourceId: cachedComparable.dataSourceId, status: "RUNNING" },
      orderBy: { createdAt: "desc" },
    });
    if (cachedRun) {
      await prisma.collectionRun.update({
        where: { id: cachedRun.id },
        data: { status: collected ? "SUCCEEDED" : "PARTIAL", finishedAt: new Date() },
      });
    }
    if (collected) return { discovered: 1, reused: true };
  }

  const sources = sortOtaSourcesByMarketWeight(await prisma.dataSource.findMany({
    where: { key: { in: [...ACTIVE_OTA_SOURCE_KEYS] }, sourceType: "OTA", enabled: true, operationalStatus: "HEALTHY" },
    orderBy: { key: "asc" },
  }));
  const searchQuery = check.property.address;
  const checkIn = nzDateKey(check.stayQuery.checkIn);
  const checkOut = nzDateKey(check.stayQuery.checkOut);
  const discoveredListingIds: string[] = [];
  const activeRunIds = new Set<string>();
  const synchronousComparableLimit = 1;

  for (const source of sources) {
    if (discoveredListingIds.length >= synchronousComparableLimit) break;
    const connectorId = otaArgusConnectorForSource(source.key);
    const discoveryUrl = otaDiscoveryUrlForSource(source.key, searchQuery);
    const provider = otaProviderDetails(source.key);
    if (!connectorId || !discoveryUrl || !provider) continue;
    let run = await prisma.collectionRun.findFirst({
      where: { jobId: input.parentJobId, dataSourceId: source.id, scope: { path: ["operation"], equals: "OTA_COMPARABLE_DISCOVERY" } },
      orderBy: { createdAt: "desc" },
    });
    if (run && comparableDiscoveryRunIsTerminal(run.status)) continue;
    if (!run) {
      run = await prisma.collectionRun.create({
        data: {
          jobId: input.parentJobId,
          dataSourceId: source.id,
          priceCheckId: input.priceCheckId,
          mode: "ON_DEMAND",
          status: "RUNNING",
          scope: { operation: "OTA_COMPARABLE_DISCOVERY", searchQuery, maxRecords: 3 },
          startedAt: new Date(),
          attemptCount: 1,
          isDemo: false,
        },
      });
    }
    activeRunIds.add(run.id);
    const traceId = durableArgusTraceId(input.parentJobId, connectorId, "discover_listings", discoveryUrl);
    const response = await captureBrowserTaskWithDurableArgus(input.environment, {
      traceId,
      connectorId,
      workflowId: "discover_listings",
      url: discoveryUrl,
      searchQuery,
      checkIn,
      checkOut,
      adults: check.stayQuery.adults,
      children: check.stayQuery.children,
      units: check.stayQuery.units,
      currency: "NZD",
      maxRecords: 3,
    }, { parentJobId: input.parentJobId, collectionRunId: run.id, dataSourceId: source.id });
    if (!response.ok || response.payload.status !== "success") {
      if (response.ok) await input.persistEvidence(source.id, run.id, response.payload, connectorId, discoveryUrl);
      const message = response.ok ? response.payload.error?.message ?? "OTA discovery failed" : response.message;
      await prisma.collectionRun.update({
        where: { id: run.id },
        data: {
          status: "PARTIAL",
          failureCount: { increment: 1 },
          errorCode: otaCollectionFailureCode(response.ok
            ? { captureStatus: response.payload.status, errorCategory: response.payload.error?.category }
            : { httpStatus: response.httpStatus }),
          errorSummary: message.slice(0, 1_000),
          finishedAt: new Date(),
        },
      });
      continue;
    }
    await input.persistEvidence(source.id, run.id, response.payload, connectorId, discoveryUrl);
    const extraction = otaDiscoverListingsExtractionSchema.parse(response.payload.extracted);

    for (const candidate of extraction.listings) {
      if (discoveredListingIds.length >= synchronousComparableLimit) break;
      if (candidate.provider !== source.key) continue;
      let candidateName = candidate.canonicalName;
      let candidateAddress = candidate.address;
      let candidateCity = candidate.city;
      let candidateRegion = candidate.region;
      let candidateTerritorialAuthority = candidate.territorialAuthority;
      let candidatePostcode = candidate.postcode;
      let candidateLatitude = candidate.latitude;
      let candidateLongitude = candidate.longitude;
      let candidatePropertyType = candidate.propertyType;
      let candidateQuality = candidate.quality;
      let candidateWarnings = candidate.warnings;
      let candidateFieldSources = candidate.fieldSources;
      let candidateUnits = candidate.units;

      if (!candidateUnits.some((unit) => unit.capacity !== null)) {
        const resolveTraceId = durableArgusTraceId(input.parentJobId, connectorId, "resolve_listing", candidate.canonicalUrl);
        const resolvedResponse = await captureBrowserTaskWithDurableArgus(input.environment, {
          traceId: resolveTraceId,
          connectorId,
          workflowId: "resolve_listing",
          url: candidate.canonicalUrl,
        }, { parentJobId: input.parentJobId, collectionRunId: run.id, dataSourceId: source.id });
        if (!resolvedResponse.ok || resolvedResponse.payload.status !== "success") {
          if (resolvedResponse.ok) await input.persistEvidence(source.id, run.id, resolvedResponse.payload, connectorId, candidate.canonicalUrl);
          await recordIdentityFailure(run.id, "COMPARABLE_IDENTITY_UNRESOLVED", "A discovered OTA comparable could not be resolved to a public unit identity");
          continue;
        }
        await input.persistEvidence(source.id, run.id, resolvedResponse.payload, connectorId, candidate.canonicalUrl);
        const resolved = otaResolveListingExtractionSchema.parse(resolvedResponse.payload.extracted);
        const identityMatches = resolved.sourceListingId === candidate.sourceListingId
          || resolved.sourceListingId === `${source.key}:${candidate.sourceListingId}`;
        if (resolved.provider !== source.key || !identityMatches) {
          await recordIdentityFailure(run.id, "COMPARABLE_IDENTITY_CONFLICT", "A resolved OTA comparable did not match its discovery identity");
          continue;
        }
        candidateName = resolved.canonicalName;
        candidateAddress = resolved.address ?? candidateAddress;
        candidateCity = resolved.city ?? candidateCity;
        candidateRegion = resolved.region ?? candidateRegion;
        candidateTerritorialAuthority = resolved.territorialAuthority ?? candidateTerritorialAuthority;
        candidatePostcode = resolved.postcode ?? candidatePostcode;
        candidateLatitude = resolved.latitude ?? candidateLatitude;
        candidateLongitude = resolved.longitude ?? candidateLongitude;
        candidatePropertyType = resolved.propertyType;
        candidateQuality = resolved.quality;
        candidateWarnings = resolved.warnings;
        candidateFieldSources = resolved.fieldSources;
        candidateUnits = resolved.units;
      }

      const hasCoordinates = candidateLatitude !== null && candidateLongitude !== null;
      if (!candidateAddress && !candidateCity && !hasCoordinates) continue;
      const location = locateOtaDiscoveryCandidate(check.property, {
        address: candidateAddress,
        city: candidateCity,
        region: candidateRegion,
        countryCode: candidate.countryCode,
        latitude: candidateLatitude,
        longitude: candidateLongitude,
      }, 5_000);
      if (location.status !== "COMPARABLE" || !location.city) continue;

      const propertyIdentity = candidateAddress
        ? normaliseComparableUnitName(candidateAddress)
        : `${source.key}:${candidate.sourceListingId}`;
      const propertyId = stableId("ota-property", propertyIdentity);
      const property = await prisma.property.upsert({
        where: { id: propertyId },
        create: {
          id: propertyId,
          canonicalName: candidateName,
          legalOrBrandName: candidateName,
          address: candidateAddress ?? "",
          city: location.city,
          countryCode: "NZ",
          latitude: candidateLatitude,
          longitude: candidateLongitude,
          region: candidateRegion,
          territorialAuthority: candidateTerritorialAuthority,
          postcode: candidatePostcode,
          timezone: "Pacific/Auckland",
          accommodationType: candidatePropertyType,
          supportStatus: check.property.supportStatus,
          identityConfidence: candidateQuality === "complete" && location.citySource === "LISTING" ? 0.9 : 0.7,
          status: "ACTIVE",
          isDemo: false,
        },
        update: {
          canonicalName: candidateName,
          ...(candidateAddress ? { address: candidateAddress } : {}),
          city: location.city,
          latitude: candidateLatitude,
          longitude: candidateLongitude,
          region: candidateRegion,
          territorialAuthority: candidateTerritorialAuthority,
          postcode: candidatePostcode,
          status: "ACTIVE",
        },
      });
      const comparableUnits = candidateUnits
        .filter((unit): unit is typeof unit & { capacity: number } => unit.capacity !== null)
        .sort((left, right) => {
          const leftTypePenalty = left.unitType === check.unit!.unitType ? 0 : 10;
          const rightTypePenalty = right.unitType === check.unit!.unitType ? 0 : 10;
          return leftTypePenalty + Math.abs(left.capacity - check.unit!.capacity)
            - rightTypePenalty - Math.abs(right.capacity - check.unit!.capacity);
        });

      for (const unit of comparableUnits.slice(0, 1)) {
        if (discoveredListingIds.length >= synchronousComparableLimit) break;
        const unitId = stableId("ota-unit", `${property.id}:${normaliseComparableUnitName(unit.officialName)}:${unit.unitType}:${unit.capacity}`);
        await prisma.sellableUnit.upsert({
          where: { id: unitId },
          create: { id: unitId, propertyId: property.id, canonicalName: unit.officialName, officialName: unit.officialName, capacity: unit.capacity, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms, bedTypes: unit.bedTypes, amenities: unit.amenities, unitType: unit.unitType, entireOrShared: unit.entireOrShared, status: "ACTIVE", isDemo: false },
          update: { propertyId: property.id, canonicalName: unit.officialName, officialName: unit.officialName, capacity: unit.capacity, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms, bedTypes: unit.bedTypes, amenities: unit.amenities, unitType: unit.unitType, entireOrShared: unit.entireOrShared, status: "ACTIVE" },
        });
        const externalId = `${candidate.sourceListingId}:${unit.externalId}`;
        const metadata = {
          discoveredFor: check.propertyId,
          discoveryLocation: { citySource: location.citySource, distanceMetres: location.distanceMetres, reasons: location.reasons },
          fieldSources: candidateFieldSources,
          warnings: candidateWarnings,
          quality: candidateQuality,
        };
        const listing = await prisma.listing.upsert({
          where: { dataSourceId_externalId: { dataSourceId: source.id, externalId } },
          create: { propertyId: property.id, unitId, dataSourceId: source.id, platform: candidate.provider, providerBrand: provider.brand, providerFamily: provider.family, externalId, sourceListingId: candidate.sourceListingId, canonicalUrl: candidate.canonicalUrl, rawUrl: candidate.canonicalUrl, url: candidate.canonicalUrl, platformUnitName: unit.officialName, lastConfirmedAt: new Date(candidate.observedAt), onlineStatus: "ONLINE", listingStatus: "ACTIVE", matchConfidence: candidateQuality === "complete" && location.citySource === "LISTING" ? 0.9 : 0.7, operationalStatus: "HEALTHY", metadata, isDemo: false },
          update: { propertyId: property.id, unitId, providerBrand: provider.brand, providerFamily: provider.family, canonicalUrl: candidate.canonicalUrl, platformUnitName: unit.officialName, lastConfirmedAt: new Date(candidate.observedAt), onlineStatus: "ONLINE", listingStatus: "ACTIVE", operationalStatus: "HEALTHY", metadata },
        });
        if (listing.propertyId === check.propertyId && listing.unitId === check.unitId) continue;
        await prisma.competitorRelationship.upsert({
          where: { targetUnitId_competitorUnitId_version: { targetUnitId: check.unit.id, competitorUnitId: unitId, version: 1 } },
          create: { targetUnitId: check.unit.id, competitorUnitId: unitId, role: "REFERENCE", version: 1, reasonCode: "OTA_ADDRESS_DISCOVERY", suggestedBy: "OTA_DISCOVERY_V1", isDemo: false },
          // CompetitorRelationship history is append-only. An identical discovery reuses
          // the existing version; changing or reopening it requires a new version.
          update: {},
        });
        discoveredListingIds.push(listing.id);
      }
    }
    await prisma.collectionRun.update({ where: { id: run.id }, data: { successCount: { increment: extraction.listings.length } } });
  }

  for (const listingId of [...new Set(discoveredListingIds)]) {
    await collectComparableOtaRate(input, listingId);
  }
  const runsToFinish = await prisma.collectionRun.findMany({
    where: { id: { in: [...activeRunIds] }, status: "RUNNING" },
    select: { id: true, failureCount: true },
  });
  await prisma.$transaction(runsToFinish.map((run) => prisma.collectionRun.update({
    where: { id: run.id },
    data: { status: run.failureCount > 0 ? "PARTIAL" : "SUCCEEDED", finishedAt: new Date() },
  })));
  return { discovered: new Set(discoveredListingIds).size };
}

export function comparableDiscoveryRunIsTerminal(status: string) {
  return ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"].includes(status);
}

async function collectComparableOtaRate(input: AddressOtaPricingInput, listingId: string, createRun = false) {
  const [check, listing] = await Promise.all([
    prisma.priceCheck.findUniqueOrThrow({ where: { id: input.priceCheckId }, include: { stayQuery: true } }),
    prisma.listing.findUniqueOrThrow({ where: { id: listingId }, include: { dataSource: true, unit: true } }),
  ]);
  if (!check.stayQuery) return false;
  const connectorId = otaArgusConnectorForSource(listing.dataSource.key);
  if (!connectorId) return false;
  let run = await prisma.collectionRun.findFirst({
    where: { jobId: input.parentJobId, dataSourceId: listing.dataSourceId, scope: { path: ["operation"], equals: "OTA_COMPARABLE_DISCOVERY" } },
    orderBy: { createdAt: "desc" },
  });
  if (!run && createRun) {
    run = await prisma.collectionRun.create({
      data: { jobId: input.parentJobId, dataSourceId: listing.dataSourceId, priceCheckId: input.priceCheckId, mode: "ON_DEMAND", status: "RUNNING", scope: { operation: "OTA_COMPARABLE_DISCOVERY", reusedListingId: listing.id }, startedAt: new Date(), attemptCount: 1, isDemo: false },
    });
  }
  if (!run) throw new Error("Comparable OTA collection is missing its Collection Run");
  const traceId = durableArgusTraceId(input.parentJobId, connectorId, "collect_rates", `${listing.canonicalUrl}:${listing.sourceListingId}`);
  const response = await captureBrowserTaskWithDurableArgus(input.environment, {
    traceId,
    connectorId,
    workflowId: "collect_rates",
    url: listing.canonicalUrl,
    checkIn: nzDateKey(check.stayQuery.checkIn),
    checkOut: nzDateKey(check.stayQuery.checkOut),
    adults: check.stayQuery.adults,
    children: check.stayQuery.children,
    units: check.stayQuery.units,
    currency: "NZD",
    maxRecords: 3,
  }, { parentJobId: input.parentJobId, collectionRunId: run.id, dataSourceId: listing.dataSourceId });
  if (!response.ok || response.payload.status !== "success") {
    if (response.ok) await input.persistEvidence(listing.dataSourceId, run.id, response.payload, connectorId, listing.canonicalUrl);
    const message = response.ok ? response.payload.error?.message ?? "OTA comparable rate collection failed" : response.message;
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        failureCount: { increment: 1 },
        errorCode: otaCollectionFailureCode(response.ok
          ? { captureStatus: response.payload.status, errorCategory: response.payload.error?.category }
          : { httpStatus: response.httpStatus }),
        errorSummary: message.slice(0, 1_000),
      },
    });
    return false;
  }
  await input.persistEvidence(listing.dataSourceId, run.id, response.payload, connectorId, listing.canonicalUrl);
  const extraction = otaCollectRatesExtractionSchema.parse(response.payload.extracted);
  const unitExternalId = listing.externalId.startsWith(`${listing.sourceListingId}:`)
    ? listing.externalId.slice(listing.sourceListingId.length + 1)
    : listing.externalId;
  const rate = extraction.rates.find((candidate) => candidate.sourceListingId === listing.sourceListingId && candidate.unitExternalId === unitExternalId)
    ?? extraction.rates.find((candidate) => candidate.sourceListingId === listing.sourceListingId);
  const available = rate?.availabilityStatus === "AVAILABLE";
  const observedPrice = rate ? publicOtaPrice(rate, check.stayQuery.nights) : null;
  if (!rate || available && !observedPrice) {
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: { failureCount: { increment: 1 }, errorCode: rate ? "NO_EXPLICIT_PRICE" : "NO_MATCHING_RATE", errorSummary: rate ? "Comparable OTA rate did not publish an explicit price" : "No matching comparable OTA rate was returned" },
    });
    return false;
  }
  const baseAmountMinor = observedPrice?.baseAmountMinor ?? 0;
  const mandatoryFeesMinor = observedPrice?.mandatoryFeesMinor ?? 0;
  const taxesMinor = observedPrice?.taxesMinor ?? 0;
  const totalAmountMinor = observedPrice?.amountMinor ?? 0;
  const profileKey = `${listing.dataSource.key}:${listing.unit.id}:nz:${check.locale}:nzd:desktop:public:argus-v1`;
  const profile = await prisma.collectionProfile.upsert({
    where: { key: profileKey },
    create: { key: profileKey, sellableUnitId: listing.unit.id, dataSourceId: listing.dataSourceId, ipRegion: "NZ", locale: check.locale === "zh" ? "zh-NZ" : "en-NZ", currency: "NZD", deviceType: "DESKTOP", loggedInState: "LOGGED_OUT", memberState: "NON_MEMBER", mobilePriceContext: "STANDARD", publicRateContext: "PUBLIC_ANONYMOUS", browserProfileVersion: "argus-browser-v1" },
    update: {},
  });
  await prisma.$transaction([
    prisma.rateObservation.upsert({
      where: { idempotencyKey: `${input.parentJobId}:${listing.id}:${check.stayQuery.id}` },
      create: { propertyId: listing.propertyId, sellableUnitId: listing.unitId, listingId: listing.id, sourceListingId: listing.sourceListingId, stayQueryId: check.stayQuery.id, collectionProfileId: profile.id, dataSourceId: listing.dataSourceId, collectionRunId: run.id, requestedAt: new Date(), currency: "NZD", baseAmountMinor, mandatoryFeesMinor, taxesMinor, platformFeesMinor: 0, optionalFeesMinor: rate.optionalFeesMinor ?? 0, totalAmountMinor, displayedAmountMinor: observedPrice?.amountMinor, priceBasis: observedPrice?.basis ?? "UNAVAILABLE", sourcePriceStatus: rate.priceStatus, exchangeRate: 1, nzdTotalMinor: totalAmountMinor, effectiveNightlyTotalMinor: observedPrice?.effectiveNightlyMinor ?? 0, observedAt: new Date(rate.collectedAt), checkIn: check.stayQuery.checkIn, checkOut: check.stayQuery.checkOut, nights: check.stayQuery.nights, adults: check.stayQuery.adults, childrenAges: check.stayQuery.childrenAges as Prisma.InputJsonValue, units: check.stayQuery.units, localTimezone: check.stayQuery.timezone, roomTypeRaw: listing.platformUnitName, roomTypeNormalized: listing.unit.canonicalName, unitConstraints: check.stayQuery.unitConstraints as Prisma.InputJsonValue, occupancyCapacity: listing.unit.capacity, bedType: null, unitAttributesVersion: listing.unit.version, mealPlan: rate.mealPlan, cancellationCategory: rate.cancellationPolicy, cancellationPolicy: rate.cancellationPolicy, paymentTerms: rate.paymentTerms, rateFence: rate.rateFence, minimumStay: rate.minimumStay, availabilityStatus: mapOtaAvailability(rate.availabilityStatus), restrictionReason: rate.restrictionReason, feeCompleteness: available ? observedPrice?.feeCompleteness ?? "UNKNOWN" : "UNKNOWN", sourceUrl: rate.sourceUrl, evidenceRef: `tymra-evidence:${traceId}`, collectorVersion: "argus-ota-v1", parserVersion: "ota-public.collect_rates@1.0.0", qualityFlags: [...rate.qualityFlags, ...(observedPrice && observedPrice.feeCompleteness !== "COMPLETE" ? ["OBSERVED_PRICE_FEE_INCOMPLETE"] : [])], operationalStatus: listing.dataSource.operationalStatus, collectedAt: new Date(rate.collectedAt), rawDataStored: true, idempotencyKey: `${input.parentJobId}:${listing.id}:${check.stayQuery.id}`, isDemo: false },
      update: {},
    }),
    prisma.collectionRun.update({ where: { id: run.id }, data: { successCount: { increment: 1 } } }),
  ]);
  return true;
}

async function recordIdentityFailure(collectionRunId: string, errorCode: string, errorSummary: string) {
  await prisma.collectionRun.update({
    where: { id: collectionRunId },
    data: { failureCount: { increment: 1 }, errorCode, errorSummary },
  });
}

function stableId(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function normaliseComparableUnitName(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "unknown-unit";
}

function mapOtaAvailability(value: "AVAILABLE" | "UNAVAILABLE" | "MINIMUM_STAY_RESTRICTION" | "OCCUPANCY_RESTRICTION" | "DATE_RESTRICTION" | "SOLD_OUT" | "NOT_LISTED" | "UNKNOWN") {
  if (value === "AVAILABLE") return "AVAILABLE" as const;
  if (value === "MINIMUM_STAY_RESTRICTION") return "MINIMUM_STAY_RESTRICTION" as const;
  if (value === "SOLD_OUT") return "SOLD_OUT" as const;
  if (value === "NOT_LISTED" || value === "UNAVAILABLE") return "LISTING_UNAVAILABLE" as const;
  return "DATA_UNAVAILABLE" as const;
}
