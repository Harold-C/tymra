import { getEnvironment } from "@tymra/config";
import {
  encryptPersonalData,
  enqueueJob,
  hashPersonalIdentifier,
  prisma,
} from "@tymra/db";
import {
  createPriceCheckSchema,
  propertySearchSchema,
  stayQuerySchema,
  type PriceCheckStatus,
} from "@tymra/domain";

import { checkAccessHash, deriveCheckAccessKey } from "./check-access";
import { queuePriceCheckEmail } from "./email-deliveries";
import { getDataProvider } from "./providers";

const nonNewZealandPattern = /\b(australia|sydney|melbourne|brisbane|london|singapore|usa|united states)\b|澳大利亚|悉尼|墨尔本|伦敦|新加坡|美国/i;

export async function searchProperties(inputValue: unknown) {
  const input = propertySearchSchema.parse(inputValue);
  if (nonNewZealandPattern.test(input.input)) {
    return { supportStatus: "UNSUPPORTED" as const, matchStatus: "NONE" as const, candidates: [] };
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
      nextAction: nextAction(existing.status),
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
        marketKey: property?.city.toLowerCase() === "christchurch" ? "christchurch" : "unknown",
        status,
        accessKeyHash: checkAccessHash(accessKey),
        idempotencyKey: input.idempotencyKey,
        isDemo: environment.PROVIDER_MODE === "demo",
      },
    });
  });

  await queuePriceCheckEmail(check.id, "CHECK_RECEIVED", "check-received");
  await queuePriceCheckEmail(check.id, "CONFIRMATION_REQUIRED", "confirmation-required");

  return { accepted: true as const, check, accessKey, nextAction: nextAction(status), reused: false };
}

export async function confirmProperty(checkId: string, propertyId: string) {
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
    include: { units: { where: { status: "ACTIVE" } } },
  });
  const unitId = property.units.length === 1 ? property.units[0].id : null;
  return prisma.priceCheck.update({
    where: { id: checkId },
    data: { propertyId, unitId, status: "NEEDS_CONFIRMATION" },
  });
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
  await prisma.stayQuery.update({ where: { id: check.stayQueryId! }, data: { ...input, nights } });
  const updated = await prisma.priceCheck.update({ where: { id: checkId }, data: { status: "QUEUED" } });
  await enqueueJob({
    type: "RATE_COLLECTION",
    payload: { priceCheckId: check.id },
    idempotencyKey: `${check.id}:rate-collection`,
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
  return check ? { ...check, nextAction: nextAction(check.status) } : null;
}

function nextAction(status: PriceCheckStatus) {
  if (status === "NEEDS_CONFIRMATION") return "CONFIRM_DETAILS" as const;
  if (status === "PUBLISHED" || status === "READY") return "VIEW_RESULT" as const;
  if (["PARTIAL", "INSUFFICIENT_DATA", "UNSUPPORTED", "SOURCE_UNAVAILABLE", "FAILED", "CANCELLED", "EXPIRED", "WITHDRAWN"].includes(status)) {
    return "REVIEW_STATUS" as const;
  }
  return "WAIT" as const;
}
