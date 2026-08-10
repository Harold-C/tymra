import { getEnvironment } from "@tymra/config";
import { hashPersonalIdentifier, prisma, recordFunnelEvent, type AnonymousCheckStatus, type Prisma } from "@tymra/db";
import { createAnonymousCheckSchema } from "@tymra/domain";

import { resolveSupportedListingUrl, type ListingPricingContext } from "./listing-input";
import { abuseOutcome, createChallengeProvider, type ChallengeDescriptor } from "./security-controls";

type RequestIdentity = {
  deviceId: string;
  ipAddress: string;
};

export class RoughCheckLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many rough checks. Please try again later.");
    this.name = "RoughCheckLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class RoughCheckChallengeError extends Error {
  constructor(readonly challenge: ChallengeDescriptor) {
    super("An additional verification step is required.");
    this.name = "RoughCheckChallengeError";
  }
}

export async function createAnonymousCheck(inputValue: unknown, identity: RequestIdentity) {
  const input = createAnonymousCheckSchema.parse(inputValue);
  const environment = getEnvironment();
  const isFixture = ["demo", "fixture"].includes(environment.PROVIDER_MODE);
  const idempotent = await prisma.anonymousCheck.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { roughResult: true },
  });
  if (idempotent) return serializeAnonymousCheck(idempotent, true);

  const resolved = resolveSupportedListingUrl(input.input);
  await recordFunnelEvent({ name: "rough_check_started", dimensions: { locale: input.locale, platform: resolved.platform } });
  const deviceHash = hashPersonalIdentifier(identity.deviceId, environment.ACCESS_KEY_SECRET);
  const ipHash = hashPersonalIdentifier(identity.ipAddress, environment.ACCESS_KEY_SECRET);
  await enforceRoughLimits(deviceHash, ipHash, input.challengeToken, environment);

  const contextKey = JSON.stringify(resolved.context);
  const cacheKey = hashPersonalIdentifier(`${resolved.platform}:${resolved.listingId}:${contextKey}`, environment.ACCESS_KEY_SECRET);
  const cacheCutoff = new Date(Date.now() - environment.ROUGH_RESULT_CACHE_HOURS * 3_600_000);
  const cached = await prisma.anonymousCheck.findFirst({
    where: { cacheKey, status: "ROUGH_READY", createdAt: { gte: cacheCutoff }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    include: { roughResult: true },
  });
  const cachedResult = cached?.roughResult;
  if (cached && cachedResult) {
    const copied = await prisma.$transaction(async (transaction) => {
      const created = await transaction.anonymousCheck.create({
        data: {
          locale: input.locale,
          platform: resolved.platform,
          listingId: resolved.listingId,
          cacheKey,
          idempotencyKey: input.idempotencyKey,
          status: "ROUGH_READY",
          pricingContext: resolved.context as unknown as Prisma.InputJsonValue,
          propertyId: cached.propertyId,
          unitId: cached.unitId,
          isDemo: cached.isDemo,
          expiresAt: new Date(Date.now() + environment.ANONYMOUS_CHECK_RETENTION_DAYS * 86_400_000),
        },
      });
      await transaction.roughResult.create({
        data: {
          anonymousCheckId: created.id,
          propertyName: cachedResult.propertyName,
          locality: cachedResult.locality,
          unitName: cachedResult.unitName,
          pricePosition: cachedResult.pricePosition,
          estimatedGapLowPct: cachedResult.estimatedGapLowPct,
          estimatedGapHighPct: cachedResult.estimatedGapHighPct,
          observedPriceMinor: cachedResult.observedPriceMinor,
          marketLowMinor: cachedResult.marketLowMinor,
          marketHighMinor: cachedResult.marketHighMinor,
          currency: cachedResult.currency,
          confidence: cachedResult.confidence,
          sourceLabel: cachedResult.sourceLabel,
          capturedAt: cachedResult.capturedAt,
          limitations: cachedResult.limitations as Prisma.InputJsonValue,
          isDemo: cachedResult.isDemo,
        },
      });
      return transaction.anonymousCheck.findUniqueOrThrow({ where: { id: created.id }, include: { roughResult: true } });
    });
    await recordRoughUsage(copied.id, deviceHash, ipHash, true);
    await recordFunnelEvent({ name: "rough_check_completed", dimensions: { locale: input.locale, platform: resolved.platform, outcome: copied.status, reused: true, isDemo: copied.isDemo } });
    return serializeAnonymousCheck(copied, true);
  }

  const listing = await resolveListingRecord(resolved.platform, resolved.listingId);
  const expiresAt = new Date(Date.now() + environment.ANONYMOUS_CHECK_RETENTION_DAYS * 86_400_000);
  const noQuote = resolved.listingId.includes("no-price") || (!listing && !isFixture);

  const check = await prisma.$transaction(async (transaction) => {
    const created = await transaction.anonymousCheck.create({
      data: {
        locale: input.locale,
        platform: resolved.platform,
        listingId: resolved.listingId,
        cacheKey,
        idempotencyKey: input.idempotencyKey,
        status: noQuote ? "NO_DEFAULT_QUOTE" : "ROUGH_ANALYSING",
        pricingContext: resolved.context as unknown as Prisma.InputJsonValue,
        failureReason: noQuote ? "NO_DEFAULT_QUOTE" : null,
        propertyId: listing?.propertyId ?? demoIdentity(resolved.listingId).propertyId,
        unitId: listing?.unitId ?? demoIdentity(resolved.listingId).unitId,
        isDemo: isFixture,
        expiresAt,
      },
    });
    if (noQuote) return created;

    const rough = roughFixture(resolved.listingId, resolved.context, listing);
    await transaction.roughResult.create({
      data: {
        anonymousCheckId: created.id,
        ...rough,
        limitations: [
          "Preliminary result based on the listing's observed default display context.",
          "The formal report checks a broader evidence set after email verification.",
        ],
        isDemo: isFixture,
      },
    });
    return transaction.anonymousCheck.update({ where: { id: created.id }, data: { status: "ROUGH_READY" } });
  });

  await recordRoughUsage(check.id, deviceHash, ipHash, false);
  await recordFunnelEvent({ name: "rough_check_completed", dimensions: { locale: input.locale, platform: resolved.platform, outcome: check.status, reused: false, isDemo: check.isDemo } });
  return serializeAnonymousCheck(
    await prisma.anonymousCheck.findUniqueOrThrow({ where: { id: check.id }, include: { roughResult: true } }),
    false,
  );
}

export async function getAnonymousCheck(checkId: string) {
  const check = await prisma.anonymousCheck.findUnique({ where: { id: checkId }, include: { roughResult: true } });
  if (!check) return null;
  if (check.expiresAt <= new Date() && check.status !== "EXPIRED") {
    await prisma.anonymousCheck.update({ where: { id: check.id }, data: { status: "EXPIRED" } });
    return serializeAnonymousCheck({ ...check, status: "EXPIRED" }, false);
  }
  if (check.status === "ROUGH_READY" && check.roughResult) {
    await recordFunnelEvent({ name: "rough_result_viewed", dimensions: { locale: check.locale === "zh" ? "zh" : "en", platform: check.platform, isDemo: check.isDemo } });
  }
  return serializeAnonymousCheck(check, false);
}

async function resolveListingRecord(platform: string, listingId: string) {
  const direct = await prisma.listing.findFirst({
    where: { platform: { equals: platform, mode: "insensitive" }, externalId: listingId, onlineStatus: "ONLINE" },
    include: { unit: { include: { property: true } }, dataSource: true },
  });
  if (!direct || !direct.dataSource.enabled || !["HEALTHY", "DEGRADED"].includes(direct.dataSource.operationalStatus)) return null;
  return {
    propertyId: direct.unit.propertyId,
    unitId: direct.unitId,
    propertyName: direct.unit.property.canonicalName,
    locality: direct.unit.property.city,
    unitName: direct.unit.officialName,
    sourceLabel: direct.dataSource.name,
  };
}

function roughFixture(
  listingId: string,
  context: ListingPricingContext,
  listing: Awaited<ReturnType<typeof resolveListingRecord>>,
) {
  const motel = listingId.includes("riverside") || listingId.includes("motel");
  const identity = demoIdentity(listingId);
  return {
    propertyName: listing?.propertyName ?? identity.propertyName,
    locality: listing?.locality ?? "Christchurch",
    unitName: listing?.unitName ?? identity.unitName,
    pricePosition: motel ? "NEAR_RANGE" : "POSSIBLY_LOW",
    estimatedGapLowPct: motel ? 0 : 10,
    estimatedGapHighPct: motel ? 8 : 22,
    observedPriceMinor: motel ? 21900 : 18500,
    marketLowMinor: motel ? 21000 : 20500,
    marketHighMinor: motel ? 25800 : 24800,
    currency: context.currency,
    confidence: "MEDIUM" as const,
    sourceLabel: listing?.sourceLabel ?? "Development Demo Data - Not real market data",
    capturedAt: new Date(),
  };
}

function demoIdentity(listingId: string) {
  const motel = listingId.includes("riverside") || listingId.includes("motel");
  return motel
    ? {
        propertyId: "demo-property-motel",
        unitId: "demo-unit-motel-studio",
        propertyName: "Development Demo - Riverside Motel",
        unitName: "Development Demo - Queen Studio",
      }
    : {
        propertyId: "demo-property-central",
        unitId: "demo-unit-central",
        propertyName: "Development Demo - Christchurch Central Stay",
        unitName: "Development Demo - Entire Apartment",
      };
}

async function enforceRoughLimits(
  deviceHash: string,
  ipHash: string,
  challengeToken: string | undefined,
  environment: ReturnType<typeof getEnvironment>,
) {
  const hourAgo = new Date(Date.now() - 3_600_000);
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [deviceHour, deviceDay, ipHour, ipDay] = await Promise.all([
    usageCount("DEVICE", deviceHash, hourAgo),
    usageCount("DEVICE", deviceHash, dayAgo),
    usageCount("IP", ipHash, hourAgo),
    usageCount("IP", ipHash, dayAgo),
  ]);
  const provider = createChallengeProvider({
    mode: environment.ABUSE_CHALLENGE_MODE,
    secret: environment.SESSION_SECRET,
    verifyUrl: environment.ABUSE_CHALLENGE_VERIFY_URL,
    siteKey: environment.ABUSE_CHALLENGE_SITE_KEY,
    providerSecret: environment.ABUSE_CHALLENGE_SECRET,
  });
  let outcome = abuseOutcome({ deviceHour, deviceDay, ipHour, ipDay });
  if (outcome === "CHALLENGE" && await provider.verify(challengeToken, deviceHash)) outcome = "ALLOW";
  await prisma.abuseDecision.create({
    data: {
      action: "ROUGH_CHECK",
      subjectHash: deviceHash,
      outcome,
      reasonCodes: outcome === "COOLDOWN" ? ["ROUGH_LIMIT_REACHED"] : outcome === "CHALLENGE" ? ["ROUGH_CHALLENGE_REQUIRED"] : [],
      cooldownUntil: outcome === "COOLDOWN" ? new Date(Date.now() + 3_600_000) : null,
    },
  });
  if (outcome === "CHALLENGE") {
    const challenge = await provider.issue(deviceHash);
    if (challenge) throw new RoughCheckChallengeError(challenge);
  }
  if (outcome === "COOLDOWN") throw new RoughCheckLimitError(3_600);
}

function usageCount(subjectType: string, subjectHash: string, since: Date) {
  return prisma.usageLedger.count({ where: { action: "ROUGH_CHECK", subjectType, subjectHash, createdAt: { gte: since } } });
}

async function recordRoughUsage(anonymousCheckId: string, deviceHash: string, ipHash: string, cached: boolean) {
  await prisma.usageLedger.createMany({
    data: [
      { action: "ROUGH_CHECK", subjectType: "DEVICE", subjectHash: deviceHash, anonymousCheckId, metadata: { cached } },
      { action: "ROUGH_CHECK", subjectType: "IP", subjectHash: ipHash, anonymousCheckId, metadata: { cached } },
    ],
  });
}

function serializeAnonymousCheck(
  check: {
    id: string;
    locale: string;
    platform: string;
    listingId: string;
    status: AnonymousCheckStatus;
    pricingContext: Prisma.JsonValue;
    failureReason: string | null;
    isDemo: boolean;
    expiresAt: Date;
    createdAt: Date;
    roughResult?: null | {
      propertyName: string;
      locality: string;
      unitName: string;
      pricePosition: string;
      estimatedGapLowPct: number | null;
      estimatedGapHighPct: number | null;
      observedPriceMinor: number | null;
      marketLowMinor: number | null;
      marketHighMinor: number | null;
      currency: string;
      confidence: string;
      sourceLabel: string;
      capturedAt: Date;
      limitations: Prisma.JsonValue;
      isDemo: boolean;
    };
  },
  reused: boolean,
) {
  return {
    id: check.id,
    locale: check.locale,
    platform: check.platform,
    listingId: check.listingId,
    status: check.status,
    pricingContext: check.pricingContext,
    failureReason: check.failureReason,
    isDemo: check.isDemo,
    expiresAt: check.expiresAt,
    createdAt: check.createdAt,
    reused,
    roughResult: check.roughResult ?? null,
    completedStages: stageList(check.status),
  };
}

function stageList(status: AnonymousCheckStatus) {
  if (status === "ROUGH_READY") return ["VALIDATING_LISTING", "CAPTURING_CONTEXT", "ROUGH_ANALYSING", "ROUGH_READY"];
  if (status === "NO_DEFAULT_QUOTE") return ["VALIDATING_LISTING", "CAPTURING_CONTEXT", "NO_DEFAULT_QUOTE"];
  return [status];
}
