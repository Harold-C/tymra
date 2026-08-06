import { getEnvironment } from "@tymra/config";
import {
  addressIdentityPersistentCache,
  encryptPersonalData,
  enqueueJob,
  findStoredAddressIdentity,
  hashPersonalIdentifier,
  prisma,
} from "@tymra/db";
import {
  createPriceCheckSchema,
  propertySearchSchema,
  stayQuerySchema,
  type PriceCheckStatus,
} from "@tymra/domain";
import {
  linzAddressIdentityProvider,
  normalizeAddressQuery,
  otaArgusConnectorForSource,
  parseOtaListingReference,
  resolveNzAddressSignalCoverage,
  stableAddressIdentityId,
  type AddressIdentity,
} from "@tymra/providers";
import { withRedisLockWait } from "@tymra/queue";

import { checkAccessHash, deriveCheckAccessKey } from "./check-access";
import { queuePriceCheckEmail } from "./email-deliveries";
import { getDataProvider } from "./providers";

const nonNewZealandPattern = /\b(australia|sydney|melbourne|brisbane|london|singapore|usa|united states)\b|澳大利亚|悉尼|墨尔本|伦敦|新加坡|美国/i;

export async function searchProperties(inputValue: unknown) {
  const input = propertySearchSchema.parse(inputValue);
  if (nonNewZealandPattern.test(input.input)) {
    return { supportStatus: "UNSUPPORTED" as const, matchStatus: "NONE" as const, candidates: [] };
  }

  if (looksLikeNzStreetAddress(input.input)) {
    try {
      const result = await linzAddressIdentityProvider.search(input.input, {
        correlationId: `property-search:${Date.now().toString(36)}`,
        limit: 10,
        queryHash: hashPersonalIdentifier(normalizeAddressQuery(input.input), getEnvironment().ACCESS_KEY_SECRET),
        persistentCache: addressIdentityPersistentCache,
        withCacheLock: (key, operation) => withRedisLockWait(key, 15_000, operation),
      });
      if (result.matchStatus === "NONE") {
        return { supportStatus: "SUPPORTED" as const, matchStatus: "NONE" as const, candidates: [], identity: result };
      }
      const propertyIds = result.candidates.map((candidate) => `property_${stableAddressIdentityId(candidate.externalId)}`);
      const existingProperties = await prisma.property.findMany({
        where: { id: { in: propertyIds } },
        include: { units: { where: { status: "ACTIVE" }, select: { id: true } } },
      });
      const existingById = new Map(existingProperties.map((property) => [property.id, property]));
      const candidates = result.candidates.map((candidate) => mapAddressCandidate(candidate, existingById));
      return { supportStatus: "SUPPORTED" as const, matchStatus: result.matchStatus, candidates, identity: { ...result, candidates: result.candidates } };
    } catch (error) {
      return {
        supportStatus: "SOURCE_UNAVAILABLE" as const,
        matchStatus: "NONE" as const,
        candidates: [],
        identity: { provider: "linz-nz-addresses", warnings: [error instanceof Error ? error.message : "ADDRESS_SOURCE_UNAVAILABLE"] },
      };
    }
  }

  const environment = getEnvironment();
  const provider = await getDataProvider();
  const candidates = await provider.identifyProperty(input.input, {
    sourceKey: provider.key,
    locale: input.locale,
    correlationId: `search:${Date.now().toString(36)}`,
  });

  const mapped = await Promise.all(
    candidates.map(async (candidate) => {
      const demoPropertyId =
        candidate.externalId === "demo-christchurch-central-stay"
          ? "demo-property-central"
          : candidate.externalId === "demo-riverside-motel"
            ? "demo-property-motel"
            : null;
      const propertyId = demoPropertyId
        ? demoPropertyId
        : (await prisma.property.findUnique({ where: { id: candidate.externalId }, select: { id: true } }))?.id ?? null;
      const units = propertyId
        ? await prisma.sellableUnit.findMany({ where: { propertyId, status: "ACTIVE" }, select: { id: true } })
        : [];
      return { ...candidate, propertyId, unitIds: units.map((unit) => unit.id) };
    }),
  );

  const source = await prisma.dataSource.findUnique({ where: { key: provider.key === "demo" ? "development-demo" : "manual-import" } });
  if (!source || !source.enabled || source.healthStatus === "DOWN") {
    return { supportStatus: "SOURCE_UNAVAILABLE" as const, matchStatus: "NONE" as const, candidates: [] };
  }
  if (environment.DEFAULT_MARKET !== "christchurch") {
    return { supportStatus: "COMING_SOON" as const, matchStatus: "NONE" as const, candidates: [] };
  }

  return {
    supportStatus: "SUPPORTED" as const,
    matchStatus: mapped.length === 1 ? mapped[0].matchStatus : mapped.length > 1 ? ("MULTIPLE" as const) : ("NONE" as const),
    candidates: mapped,
  };
}

function mapAddressCandidate(candidate: AddressIdentity, existingById: Map<string, { id: string; units: { id: string }[] }>) {
  const coverage = resolveNzAddressSignalCoverage(candidate);
  const propertyId = `property_${stableAddressIdentityId(candidate.externalId)}`;
  const existing = existingById.get(propertyId);
  return {
    externalId: candidate.externalId,
    canonicalName: `Property at ${candidate.normalizedAddress}`,
    address: candidate.normalizedAddress,
    city: candidate.city,
    countryCode: "NZ",
    region: candidate.region,
    territorialAuthority: candidate.territorialAuthority,
    rto: candidate.rto,
    postcode: candidate.postcode,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    confidence: candidate.confidence,
    coverageLevel: coverage?.level ?? "NATIONAL_ONLY",
    accommodationType: "UNCLASSIFIED_ACCOMMODATION",
    matchStatus: candidate.matchStatus,
    isDemo: false,
    propertyId: existing?.id ?? null,
    addressExternalId: candidate.externalId,
    unitIds: existing?.units.map((unit) => unit.id) ?? [],
  };
}

function looksLikeNzStreetAddress(value: string) {
  return /\d/.test(value) && /[a-z\u0100-\u017f]{2,}/i.test(value) && !/^https?:\/\//i.test(value.trim());
}

function addressSupportStatus(level: "FULL" | "REGIONAL" | "NATIONAL_ONLY" | undefined) {
  if (level === "FULL") return "SUPPORTED" as const;
  if (level === "REGIONAL") return "PILOT_AVAILABLE" as const;
  return "INSUFFICIENT_MARKET_DATA" as const;
}

export async function createPriceCheck(inputValue: unknown) {
  const input = createPriceCheckSchema.parse(inputValue);
  const environment = getEnvironment();
  if (!environment.ACCEPT_NEW_CHECKS) return { accepted: false as const, reason: "CHECKS_PAUSED" as const };

  const existing = await prisma.priceCheck.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    return {
      accepted: true as const,
      check: existing,
      accessKey: deriveCheckAccessKey(input.idempotencyKey),
      nextAction: nextActionForStatus(existing.status),
      reused: true,
    };
  }

  const property = input.propertyId
    ? await prisma.property.findUnique({ where: { id: input.propertyId }, include: { units: { where: { status: "ACTIVE" } } } })
    : null;
  let unitId = input.unitId;
  if (!unitId && property?.units.length === 1) unitId = property.units[0].id;

  // Every accepted check passes through the explicit query confirmation screen.
  // Collection starts only after confirmQuery has persisted the user's final dates.
  const status: PriceCheckStatus = "NEEDS_CONFIRMATION";
  const accessKey = deriveCheckAccessKey(input.idempotencyKey);
  const stay = stayQuerySchema.parse(input.stayQuery);
  const nights = Math.max(1, Math.round((stay.checkOut.getTime() - stay.checkIn.getTime()) / 86_400_000));

  const check = await prisma.$transaction(async (transaction) => {
    const stayQuery = await transaction.stayQuery.create({ data: { ...stay, nights } });
    return transaction.priceCheck.create({
      data: {
        rawInput: input.input,
        locale: input.locale,
        emailHash: hashPersonalIdentifier(input.email, environment.ACCESS_KEY_SECRET),
        encryptedEmail: encryptPersonalData(input.email, environment.DATA_ENCRYPTION_KEY),
        serviceConsent: input.serviceConsent,
        marketingConsent: input.marketingConsent,
        propertyId: property?.id,
        unitId,
        stayQueryId: stayQuery.id,
        marketKey: property ? resolveNzAddressSignalCoverage(property)?.marketKey ?? "unknown" : "unknown",
        status,
        accessKeyHash: checkAccessHash(accessKey),
        idempotencyKey: input.idempotencyKey,
        isDemo: environment.PROVIDER_MODE === "demo",
      },
    });
  });

  await queuePriceCheckEmail(check.id, "CHECK_RECEIVED", "check-received");
  await queuePriceCheckEmail(check.id, "CONFIRMATION_REQUIRED", "confirmation-required");

  return { accepted: true as const, check, accessKey, nextAction: nextActionForStatus(status), reused: false };
}

export async function confirmProperty(checkId: string, input: { propertyId?: string; addressExternalId?: string }) {
  const current = await prisma.priceCheck.findUniqueOrThrow({ where: { id: checkId }, select: { rawInput: true } });
  const propertyId = input.propertyId ?? await promoteAddressIdentity(input.addressExternalId!, current.rawInput);
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
    include: {
      units: { where: { status: "ACTIVE" } },
      listings: { where: { listingStatus: "ACTIVE", operationalStatus: "HEALTHY", dataSource: { sourceType: "OTA" } }, select: { id: true } },
    },
  });
  const unitId = property.units.length === 1 ? property.units[0].id : null;
  const requiresListingConfirmation = Boolean(input.addressExternalId) && property.listings.length === 0;
  const check = await prisma.priceCheck.update({
    where: { id: checkId },
    data: {
      propertyId,
      unitId,
      status: "NEEDS_CONFIRMATION",
      listingValidationStatus: requiresListingConfirmation ? "REQUIRED" : "NOT_REQUIRED",
      listingValidationMessage: null,
      listingValidatedAt: null,
    },
  });
  return { check, requiresListingConfirmation, requiresUnitConfirmation: property.units.length > 1 };
}

export async function confirmListing(checkId: string, listingUrl: string) {
  const reference = parseOtaListingReference(listingUrl);
  if (!otaArgusConnectorForSource(reference.sourceId)) throw new Error("This public OTA listing source is not supported for live validation");
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: checkId }, select: { propertyId: true, updatedAt: true } });
  if (!check.propertyId) throw new Error("Confirm the Property before adding an OTA listing");
  await prisma.priceCheck.update({
    where: { id: checkId },
    data: {
      listingUrl: reference.canonicalUrl,
      listingValidationStatus: "PENDING",
      listingValidationMessage: null,
      listingValidatedAt: null,
      unitId: null,
      status: "VALIDATING",
    },
  });
  await enqueueJob({
    type: "PROPERTY_IDENTIFICATION",
    payload: { priceCheckId: checkId },
    idempotencyKey: `${checkId}:ota-listing:${reference.sourceId}:${stableAddressIdentityId(`${reference.sourceListingId}:${check.updatedAt.toISOString()}`)}`,
    priceCheckId: checkId,
  });
  return { checkId, status: "VALIDATING" as const, nextStep: "status" as const };
}

async function promoteAddressIdentity(externalId: string, rawInput: string) {
  const environment = getEnvironment();
  const queryHash = hashPersonalIdentifier(normalizeAddressQuery(rawInput), environment.ACCESS_KEY_SECRET);
  const candidate = await findStoredAddressIdentity("linz-nz-addresses", externalId, queryHash);
  if (!candidate?.resolutionCandidates.length) throw new Error("The selected address identity is not a candidate for this Price Check");
  const coverage = resolveNzAddressSignalCoverage(candidate);
  const propertyId = `property_${stableAddressIdentityId(candidate.providerExternalId)}`;
  const unitId = `unit_${stableAddressIdentityId(`${candidate.providerExternalId}:entire-property`)}`;
  await prisma.$transaction([
    prisma.property.upsert({
      where: { id: propertyId },
      create: {
        id: propertyId,
        canonicalName: `Property at ${candidate.normalizedAddress}`,
        address: candidate.normalizedAddress,
        city: candidate.city,
        countryCode: candidate.countryCode,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        region: candidate.region,
        territorialAuthority: candidate.territorialAuthority,
        rto: candidate.rto,
        postcode: candidate.postcode,
        accommodationType: "UNCLASSIFIED_ACCOMMODATION",
        supportStatus: addressSupportStatus(coverage?.level),
        identityConfidence: candidate.resolutionCandidates[0].confidence,
        status: "ACTIVE",
        isDemo: false,
      },
      update: {
        address: candidate.normalizedAddress,
        city: candidate.city,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        region: candidate.region,
        territorialAuthority: candidate.territorialAuthority,
        rto: candidate.rto,
        postcode: candidate.postcode,
        supportStatus: addressSupportStatus(coverage?.level),
        identityConfidence: candidate.resolutionCandidates[0].confidence,
        status: "ACTIVE",
      },
    }),
    prisma.sellableUnit.upsert({
      where: { id: unitId },
      create: { id: unitId, propertyId, canonicalName: "Entire property", officialName: "Entire property", capacity: 2, bedrooms: null, bathrooms: null, bedTypes: [], amenities: [], unitType: "UNCONFIRMED", entireOrShared: "ENTIRE", status: "ACTIVE", isDemo: false },
      update: { propertyId, status: "ACTIVE" },
    }),
  ]);
  return propertyId;
}

export async function confirmUnit(checkId: string, unitId: string) {
  const current = await prisma.priceCheck.findUniqueOrThrow({ where: { id: checkId }, select: { propertyId: true } });
  const unit = await prisma.sellableUnit.findUniqueOrThrow({ where: { id: unitId }, select: { propertyId: true, status: true } });
  if (!current.propertyId || unit.propertyId !== current.propertyId || unit.status !== "ACTIVE") {
    throw new Error("The selected Unit does not belong to the confirmed Property");
  }
  const check = await prisma.priceCheck.update({ where: { id: checkId }, data: { unitId, status: "NEEDS_CONFIRMATION" } });
  return check;
}

export async function confirmQuery(checkId: string, inputValue: unknown) {
  const input = stayQuerySchema.parse(inputValue);
  const nights = Math.max(1, Math.round((input.checkOut.getTime() - input.checkIn.getTime()) / 86_400_000));
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: checkId } });
  if (!check.propertyId || !check.unitId) throw new Error("Property and Unit confirmation are required");
  if (["REQUIRED", "PENDING", "CONFLICT", "SOURCE_UNAVAILABLE"].includes(check.listingValidationStatus)) throw new Error("A matching OTA listing must be verified before collection starts");
  await prisma.stayQuery.update({ where: { id: check.stayQueryId! }, data: { ...input, nights } });
  const updated = await prisma.priceCheck.update({ where: { id: checkId }, data: { status: "QUEUED" } });
  await enqueueJob({
    type: "RATE_COLLECTION",
    payload: { priceCheckId: check.id },
    idempotencyKey: `${check.id}:rate-collection:${stableAddressIdentityId(`${check.listingValidatedAt?.toISOString() ?? "not-required"}:${input.checkIn.toISOString()}:${input.checkOut.toISOString()}:${input.adults}:${input.children}:${input.units}`)}`,
    priceCheckId: check.id,
  });
  await queuePriceCheckEmail(check.id, "CHECK_PROCESSING", "check-processing");
  return updated;
}

export async function getPublicCheck(checkId: string) {
  const check = await prisma.priceCheck.findUnique({
    where: { id: checkId },
    select: {
      id: true,
      rawInput: true,
      locale: true,
      status: true,
      listingUrl: true,
      listingValidationStatus: true,
      listingValidationMessage: true,
      listingValidatedAt: true,
      unitId: true,
      isDemo: true,
      createdAt: true,
      updatedAt: true,
      property: {
        select: {
          id: true,
          canonicalName: true,
          city: true,
          units: {
            where: { status: "ACTIVE" },
            orderBy: { officialName: "asc" },
            select: { id: true, officialName: true, capacity: true, bedrooms: true, unitType: true, isDemo: true },
          },
        },
      },
      unit: { select: { id: true, officialName: true, isDemo: true } },
      stayQuery: true,
      resultVersions: { where: { status: "PUBLISHED" }, select: { id: true, outcome: true }, take: 1 },
    },
  });
  return check ? { ...check, nextAction: nextAction(check) } : null;
}

function nextAction(check: { status: PriceCheckStatus; listingValidationStatus: string; unitId: string | null; property: { units: { id: string }[] } | null }) {
  const { status } = check;
  if (status === "NEEDS_CONFIRMATION") {
    if (["REQUIRED", "CONFLICT"].includes(check.listingValidationStatus)) return "CONFIRM_LISTING" as const;
    if (check.listingValidationStatus === "PENDING") return "WAIT" as const;
    if (!check.unitId && (check.property?.units.length ?? 0) > 1) return "CONFIRM_UNIT" as const;
    return "CONFIRM_QUERY" as const;
  }
  if (status === "SOURCE_UNAVAILABLE" && check.listingValidationStatus === "SOURCE_UNAVAILABLE") return "CONFIRM_LISTING" as const;
  if (status === "PUBLISHED" || status === "READY") return "VIEW_RESULT" as const;
  if (["PARTIAL", "INSUFFICIENT_DATA", "UNSUPPORTED", "SOURCE_UNAVAILABLE", "FAILED", "CANCELLED", "EXPIRED", "WITHDRAWN"].includes(status)) {
    return "REVIEW_STATUS" as const;
  }
  return "WAIT" as const;
}

function nextActionForStatus(status: PriceCheckStatus) {
  if (status === "NEEDS_CONFIRMATION") return "CONFIRM_DETAILS" as const;
  if (status === "PUBLISHED" || status === "READY") return "VIEW_RESULT" as const;
  if (["PARTIAL", "INSUFFICIENT_DATA", "UNSUPPORTED", "SOURCE_UNAVAILABLE", "FAILED", "CANCELLED", "EXPIRED", "WITHDRAWN"].includes(status)) return "REVIEW_STATUS" as const;
  return "WAIT" as const;
}
