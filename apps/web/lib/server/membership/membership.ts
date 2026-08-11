import type { MembershipPlan, MembershipSubscriptionStatus, Prisma } from "@tymra/db";
import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import {
  membershipEntitlements,
  membershipIsServiceable,
  spotCheckAllowance,
  type MembershipPlanId,
  nzDateKey,
  nzStartOfDay,
} from "@tymra/domain";
import { ensureBenefitGroup } from "./member-risk";

type Transaction = Prisma.TransactionClient;
const PRICING_UNIT_REPLACEMENT_RETENTION_DAYS = 30;

export async function runMembershipTransaction<T>(operation: (transaction: Transaction) => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === maxAttempts) throw error;
    }
  }
  throw new Error("Membership transaction retry exhausted");
}

function retainedUntil(now: Date) {
  return new Date(now.getTime() + PRICING_UNIT_REPLACEMENT_RETENTION_DAYS * 86_400_000);
}

function occupiedPricingUnitWhere(customerUserId: string, now: Date, excludeId?: string): Prisma.CustomerPricingUnitWhereInput {
  return {
    customerUserId,
    ...(excludeId ? { id: { not: excludeId } } : {}),
    OR: [{ active: true }, { slotRetainedUntil: { gt: now } }],
  };
}

export class MembershipAccessError extends Error {
  constructor(readonly code: "MEMBERSHIP_INACTIVE" | "EMAIL_VERIFICATION_REQUIRED" | "SPOT_CHECK_QUOTA_REACHED" | "PRICING_UNIT_LIMIT_REACHED") {
    super(code === "MEMBERSHIP_INACTIVE"
      ? "The membership is not currently eligible for new collection."
      : code === "EMAIL_VERIFICATION_REQUIRED"
        ? "Verify the membership email before starting a public data collection."
      : code === "SPOT_CHECK_QUOTA_REACHED"
        ? "The rolling spot-check allowance has been used."
        : "The active pricing-unit limit has been reached.");
    this.name = "MembershipAccessError";
  }
}

export class MembershipOperationError extends Error {
  constructor(readonly code: "EXPORT_NOT_INCLUDED" | "EXPORT_NOT_LAUNCHED" | "EXPORT_QUOTA_REACHED" | "API_NOT_INCLUDED" | "API_NOT_LAUNCHED" | "API_QUOTA_REACHED" | "IDEMPOTENCY_KEY_REQUIRED") {
    super(code === "IDEMPOTENCY_KEY_REQUIRED"
      ? "An idempotency key is required."
      : code.includes("NOT_INCLUDED")
        ? "This operation is not included in the membership plan."
        : code.includes("NOT_LAUNCHED")
          ? "This operation has not passed its production launch gate."
          : "The independent operation allowance has been used.");
    this.name = "MembershipOperationError";
  }
}

export async function reserveMembershipOperation(input: { customerUserId: string; action: "MEMBER_EXPORT" | "MEMBER_API"; idempotencyKey: string; now?: Date }) {
  if (!input.idempotencyKey.trim()) throw new MembershipOperationError("IDEMPOTENCY_KEY_REQUIRED");
  const now = input.now ?? new Date();
  return runMembershipTransaction(async (transaction) => {
    const operationKey = `${input.action}:${input.customerUserId}:${input.idempotencyKey}`;
    const existing = await transaction.usageLedger.findUnique({ where: { operationKey } });
    if (existing) return { idempotent: true, usage: existing };
    const membership = await ensureFreeMembership(transaction, input.customerUserId, now);
    const customer = await ensureBenefitGroup(transaction, input.customerUserId, now);
    if (!customer.emailVerifiedAt) throw new MembershipAccessError("EMAIL_VERIFICATION_REQUIRED");
    if (!membershipIsServiceable(membership.status, membership.graceEndsAt, now)) throw new MembershipAccessError("MEMBERSHIP_INACTIVE");
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`membership-operation:${input.action}:${input.customerUserId}`}))`;
    const entitlement = membershipEntitlements[membership.plan];
    const isExport = input.action === "MEMBER_EXPORT";
    const environment = getEnvironment();
    if (isExport && !environment.MEMBERSHIP_EXPORT_LAUNCH_ENABLED) throw new MembershipOperationError("EXPORT_NOT_LAUNCHED");
    if (!isExport && !environment.MEMBERSHIP_API_LAUNCH_ENABLED) throw new MembershipOperationError("API_NOT_LAUNCHED");
    const limit = isExport ? entitlement.monthlyExportLimit : entitlement.dailyApiRequestLimit;
    if (limit === 0) throw new MembershipOperationError(isExport ? "EXPORT_NOT_INCLUDED" : "API_NOT_INCLUDED");
    const dateKey = nzDateKey(now);
    const since = isExport ? nzStartOfDay(`${dateKey.slice(0, 7)}-01`) : nzStartOfDay(dateKey);
    const used = await transaction.usageLedger.count({ where: { customerUserId: input.customerUserId, action: input.action, createdAt: { gte: since } } });
    if (used >= limit) throw new MembershipOperationError(isExport ? "EXPORT_QUOTA_REACHED" : "API_QUOTA_REACHED");
    const usage = await transaction.usageLedger.create({ data: { operationKey, action: input.action, subjectType: "ACCOUNT", subjectHash: input.customerUserId, customerUserId: input.customerUserId, benefitGroupId: customer.benefitGroupId, metadata: { plan: membership.plan, period: isExport ? dateKey.slice(0, 7) : dateKey, limit } } });
    return { idempotent: false, usage, remainingAfter: limit - used - 1 };
  });
}

export async function ensureFreeMembership(transaction: Transaction, customerUserId: string, entitlementStartedAt = new Date()) {
  return await transaction.membershipSubscription.findUnique({ where: { customerUserId } })
    ?? transaction.membershipSubscription.create({ data: { customerUserId, plan: "FREE", status: "ACTIVE", entitlementStartedAt } });
}

export async function reserveSpotCheck(
  transaction: Transaction,
  input: { customerUserId: string; sellableUnitId: string | null; idempotencyKey: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const existingUsage = await transaction.membershipUsage.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  const membership = await ensureFreeMembership(transaction, input.customerUserId, now);
  if (existingUsage) return { membership, usage: existingUsage, remainingAfter: null, idempotent: true };
  const customer = await ensureBenefitGroup(transaction, input.customerUserId, now);
  if (!customer.emailVerifiedAt) throw new MembershipAccessError("EMAIL_VERIFICATION_REQUIRED");
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`membership-benefit:${customer.benefitGroupId}`}))`;
  const benefitGroup = await transaction.benefitGroup.findUniqueOrThrow({ where: { id: customer.benefitGroupId } });
  if (benefitGroup.status === "LIMITED") throw new MembershipAccessError("MEMBERSHIP_INACTIVE");
  if (!membershipIsServiceable(membership.status, membership.graceEndsAt, now)) throw new MembershipAccessError("MEMBERSHIP_INACTIVE");

  const entitlements = membershipEntitlements[membership.plan];
  let pricingUnitId: string | null = null;
  if (input.sellableUnitId) {
    const sellableUnit = await transaction.sellableUnit.findUniqueOrThrow({
      where: { id: input.sellableUnitId },
      select: { propertyId: true },
    });
    const quotaIdentityKey = `property:${sellableUnit.propertyId}`;
    const existingUnit = await transaction.customerPricingUnit.findUnique({
      where: { customerUserId_quotaIdentityKey: { customerUserId: input.customerUserId, quotaIdentityKey } },
    });
    if (existingUnit?.active) {
      pricingUnitId = existingUnit.id;
    } else {
      const alreadyOccupiesSlot = Boolean(existingUnit?.slotRetainedUntil && existingUnit.slotRetainedUntil > now);
      const occupiedCount = alreadyOccupiesSlot
        ? 0
        : await transaction.customerPricingUnit.count({ where: occupiedPricingUnitWhere(input.customerUserId, now, existingUnit?.id) });
      if (!alreadyOccupiesSlot && occupiedCount >= entitlements.activePricingUnitLimit) throw new MembershipAccessError("PRICING_UNIT_LIMIT_REACHED");
      const unit = await transaction.customerPricingUnit.upsert({
        where: { customerUserId_quotaIdentityKey: { customerUserId: input.customerUserId, quotaIdentityKey } },
        update: { sellableUnitId: input.sellableUnitId, active: true, activatedAt: now, deactivatedAt: null, slotRetainedUntil: null },
        create: { customerUserId: input.customerUserId, sellableUnitId: input.sellableUnitId, quotaIdentityKey, activatedAt: now },
      });
      pricingUnitId = unit.id;
    }
  }

  const rollingStart = new Date(now.getTime() - 30 * 86_400_000);
  const usageOwner = membership.plan === "FREE" ? { benefitGroupId: customer.benefitGroupId } : { customerUserId: input.customerUserId };
  const [initialReportConsumed, rollingSpotChecks] = await Promise.all([
    transaction.membershipUsage.count({
      where: { ...usageOwner, type: "INITIAL_REPORT", ...(membership.plan === "FREE" ? {} : { countedAt: { gte: membership.entitlementStartedAt } }) },
    }).then((count) => count > 0),
    transaction.membershipUsage.count({
      where: {
        ...usageOwner,
        type: "SPOT_CHECK",
        countedAt: { gte: membership.plan === "FREE" ? rollingStart : rollingStart > membership.entitlementStartedAt ? rollingStart : membership.entitlementStartedAt },
      },
    }),
  ]);
  const allowance = spotCheckAllowance({ plan: membership.plan, initialReportConsumed, rollingSpotChecks });
  if (!allowance.allowed || !allowance.usageType) throw new MembershipAccessError("SPOT_CHECK_QUOTA_REACHED");

  const usage = await transaction.membershipUsage.create({
    data: {
      customerUserId: input.customerUserId,
      benefitGroupId: customer.benefitGroupId,
      type: allowance.usageType,
      idempotencyKey: input.idempotencyKey,
      pricingUnitId,
      metadata: { plan: membership.plan },
      countedAt: now,
    },
  });
  if (membership.plan === "FREE") {
    await transaction.benefitClaim.create({
      data: {
        benefitGroupId: customer.benefitGroupId,
        customerUserId: input.customerUserId,
        type: allowance.usageType === "INITIAL_REPORT" ? "FREE_INITIAL_REPORT" : "FREE_SPOT_CHECK",
        windowKey: allowance.usageType === "INITIAL_REPORT" ? "lifetime" : `rolling:${usage.id}`,
        membershipUsageId: usage.id,
        metadata: { policyVersion: "member-abuse-v1" },
        claimedAt: now,
        expiresAt: allowance.usageType === "SPOT_CHECK" ? new Date(now.getTime() + 30 * 86_400_000) : null,
      },
    });
  }
  return { membership, usage, remainingAfter: allowance.remainingAfter, idempotent: false };
}

export async function getMembershipSummary(customerUserId: string, now = new Date()) {
  const membership = await prisma.$transaction((transaction) => ensureFreeMembership(transaction, customerUserId));
  const customer = await prisma.$transaction((transaction) => ensureBenefitGroup(transaction, customerUserId, now));
  const benefitGroup = await prisma.benefitGroup.findUniqueOrThrow({ where: { id: customer.benefitGroupId } });
  const rollingStart = new Date(now.getTime() - 30 * 86_400_000);
  const [initialReports, rollingSpotChecks, oldestRollingSpotCheck, pricingUnits] = await Promise.all([
    prisma.membershipUsage.count({ where: { ...(membership.plan === "FREE" ? { benefitGroupId: customer.benefitGroupId } : { customerUserId }), type: "INITIAL_REPORT", ...(membership.plan === "FREE" ? {} : { countedAt: { gte: membership.entitlementStartedAt } }) } }),
    prisma.membershipUsage.count({ where: { ...(membership.plan === "FREE" ? { benefitGroupId: customer.benefitGroupId } : { customerUserId }), type: "SPOT_CHECK", countedAt: { gte: membership.plan === "FREE" ? rollingStart : rollingStart > membership.entitlementStartedAt ? rollingStart : membership.entitlementStartedAt } } }),
    prisma.membershipUsage.findFirst({ where: { ...(membership.plan === "FREE" ? { benefitGroupId: customer.benefitGroupId } : { customerUserId }), type: "SPOT_CHECK", countedAt: { gte: membership.plan === "FREE" ? rollingStart : rollingStart > membership.entitlementStartedAt ? rollingStart : membership.entitlementStartedAt } }, orderBy: { countedAt: "asc" }, select: { countedAt: true } }),
    prisma.customerPricingUnit.findMany({
      where: { customerUserId },
      orderBy: [{ active: "desc" }, { activatedAt: "asc" }],
      include: { sellableUnit: { select: { id: true, officialName: true, property: { select: { canonicalName: true, city: true } } } } },
    }),
  ]);
  const plan = membership.plan as MembershipPlanId;
  const entitlements = membershipEntitlements[plan];
  const remainingSpotChecks = plan === "FREE" && initialReports === 0
    ? entitlements.rollingSpotCheckLimit + 1
    : Math.max(0, entitlements.rollingSpotCheckLimit - rollingSpotChecks);
  return {
    plan,
    emailVerified: Boolean(customer.emailVerifiedAt),
    benefitGroupId: customer.benefitGroupId,
    status: membership.status,
    serviceable: Boolean(customer.emailVerifiedAt) && benefitGroup.status === "ACTIVE" && membershipIsServiceable(membership.status, membership.graceEndsAt, now),
    collectionBlockReason: !customer.emailVerifiedAt ? "EMAIL_VERIFICATION_REQUIRED" : benefitGroup.status !== "ACTIVE" ? "MEMBERSHIP_REVIEW_REQUIRED" : null,
    cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
    currentPeriodStart: membership.currentPeriodStart,
    currentPeriodEnd: membership.currentPeriodEnd,
    entitlementStartedAt: membership.entitlementStartedAt,
    graceEndsAt: membership.graceEndsAt,
    pendingPlan: membership.pendingPlan,
    entitlements,
    usage: {
      initialReportConsumed: initialReports > 0,
      rollingSpotChecks,
      remainingSpotChecks,
      nextSpotCheckAt: remainingSpotChecks > 0 || !oldestRollingSpotCheck ? null : new Date(oldestRollingSpotCheck.countedAt.getTime() + 30 * 86_400_000),
    },
    pricingUnits: pricingUnits.map((item) => ({
      id: item.id,
      active: item.active,
      sellableUnitId: item.sellableUnitId,
      unitName: item.sellableUnit.officialName,
      propertyName: item.sellableUnit.property.canonicalName,
      city: item.sellableUnit.property.city,
      activatedAt: item.activatedAt,
      deactivatedAt: item.deactivatedAt,
      slotRetainedUntil: item.slotRetainedUntil,
      occupiesSlot: item.active || Boolean(item.slotRetainedUntil && item.slotRetainedUntil > now),
    })),
  };
}

export async function getPricingUnitDetail(customerUserId: string, pricingUnitId: string) {
  const pricingUnit = await prisma.customerPricingUnit.findFirst({
    where: { id: pricingUnitId, customerUserId },
    select: {
      id: true,
      active: true,
      activatedAt: true,
      deactivatedAt: true,
      slotRetainedUntil: true,
      sellableUnitId: true,
      sellableUnit: {
        select: {
          id: true,
          canonicalName: true,
          officialName: true,
          capacity: true,
          bedrooms: true,
          bathrooms: true,
          unitType: true,
          property: {
            select: { id: true, canonicalName: true, address: true, city: true, region: true, countryCode: true, timezone: true },
          },
          listings: {
            where: { listingStatus: "ACTIVE" },
            select: {
              id: true,
              platform: true,
              providerBrand: true,
              providerFamily: true,
              sourceListingId: true,
              canonicalUrl: true,
              platformUnitName: true,
              onlineStatus: true,
              dataSource: { select: { key: true, name: true } },
            },
            orderBy: { sourceListingId: "asc" },
          },
        },
      },
    },
  });
  if (!pricingUnit) return null;

  const [recentObservations, latestCheck] = await Promise.all([
    prisma.rateObservation.findMany({
      where: { sellableUnitId: pricingUnit.sellableUnitId },
      orderBy: { collectedAt: "desc" },
      take: 10,
      select: {
        id: true,
        checkIn: true,
        checkOut: true,
        currency: true,
        nzdTotalMinor: true,
        effectiveNightlyTotalMinor: true,
        priceBasis: true,
        availabilityStatus: true,
        feeCompleteness: true,
        collectedAt: true,
        dataSource: { select: { key: true, name: true } },
      },
    }),
    prisma.priceCheck.findFirst({
      where: { customerUserId, unitId: pricingUnit.sellableUnitId },
      orderBy: { createdAt: "desc" },
      select: {
        stayQuery: {
          select: { checkIn: true, checkOut: true, nights: true, adults: true, children: true, units: true, currency: true, cancellationCategory: true, timezone: true },
        },
      },
    }),
  ]);

  return { ...pricingUnit, recentObservations, latestStayQuery: latestCheck?.stayQuery ?? null };
}

export async function addPricingUnitFromCheck(customerUserId: string, priceCheckId: string, now = new Date()) {
  const pricingUnitId = await runMembershipTransaction(async (transaction) => {
    const membership = await ensureFreeMembership(transaction, customerUserId, now);
    const customer = await ensureBenefitGroup(transaction, customerUserId, now);
    if (!customer.emailVerifiedAt) throw new MembershipAccessError("EMAIL_VERIFICATION_REQUIRED");
    if (!membershipIsServiceable(membership.status, membership.graceEndsAt, now)) throw new MembershipAccessError("MEMBERSHIP_INACTIVE");

    const check = await transaction.priceCheck.findFirst({
      where: {
        id: priceCheckId,
        customerUserId,
        unitId: { not: null },
      },
      select: { unitId: true },
    });
    const usage = check
      ? await transaction.membershipUsage.findFirst({ where: { customerUserId, priceCheckId }, select: { id: true } })
      : null;
    if (!check?.unitId || !usage) return null;

    const sellableUnit = await transaction.sellableUnit.findUniqueOrThrow({
      where: { id: check.unitId },
      select: { propertyId: true },
    });
    const quotaIdentityKey = `property:${sellableUnit.propertyId}`;
    const existing = await transaction.customerPricingUnit.findUnique({
      where: { customerUserId_quotaIdentityKey: { customerUserId, quotaIdentityKey } },
    });
    if (existing?.active) return existing.id;

    const alreadyOccupiesSlot = Boolean(existing?.slotRetainedUntil && existing.slotRetainedUntil > now);
    if (!alreadyOccupiesSlot) {
      const occupiedCount = await transaction.customerPricingUnit.count({
        where: occupiedPricingUnitWhere(customerUserId, now, existing?.id),
      });
      if (occupiedCount >= membershipEntitlements[membership.plan].activePricingUnitLimit) {
        throw new MembershipAccessError("PRICING_UNIT_LIMIT_REACHED");
      }
    }

    const pricingUnit = await transaction.customerPricingUnit.upsert({
      where: { customerUserId_quotaIdentityKey: { customerUserId, quotaIdentityKey } },
      update: { sellableUnitId: check.unitId, active: true, activatedAt: now, deactivatedAt: null, slotRetainedUntil: null },
      create: { customerUserId, sellableUnitId: check.unitId, quotaIdentityKey, activatedAt: now },
    });
    return pricingUnit.id;
  });

  return pricingUnitId ? getPricingUnitDetail(customerUserId, pricingUnitId) : null;
}

export async function setPricingUnitActive(customerUserId: string, pricingUnitId: string, active: boolean, now = new Date()) {
  return prisma.$transaction(async (transaction) => {
    const membership = await ensureFreeMembership(transaction, customerUserId);
    const pricingUnit = await transaction.customerPricingUnit.findFirst({ where: { id: pricingUnitId, customerUserId } });
    if (!pricingUnit) return null;
    if (!active) {
      const updated = await transaction.customerPricingUnit.update({
        where: { id: pricingUnit.id },
        data: { active: false, deactivatedAt: now, slotRetainedUntil: retainedUntil(now) },
      });
      await transaction.job.updateMany({
        where: {
          sellableUnitId: pricingUnit.sellableUnitId,
          status: "PENDING",
          payload: { path: ["scheduled"], equals: true },
        },
        data: { status: "CANCELLED", completedAt: now },
      });
      return updated;
    }
    if (!membershipIsServiceable(membership.status, membership.graceEndsAt, now)) throw new MembershipAccessError("MEMBERSHIP_INACTIVE");
    const alreadyOccupiesSlot = Boolean(pricingUnit.slotRetainedUntil && pricingUnit.slotRetainedUntil > now);
    if (!alreadyOccupiesSlot) {
      const occupiedCount = await transaction.customerPricingUnit.count({ where: occupiedPricingUnitWhere(customerUserId, now, pricingUnit.id) });
      if (occupiedCount >= membershipEntitlements[membership.plan].activePricingUnitLimit) throw new MembershipAccessError("PRICING_UNIT_LIMIT_REACHED");
    }
    return transaction.customerPricingUnit.update({ where: { id: pricingUnit.id }, data: { active: true, activatedAt: now, deactivatedAt: null, slotRetainedUntil: null } });
  });
}

export function membershipQueuePriority(plan: MembershipPlan): number {
  return membershipEntitlements[plan].queuePriority;
}

export function membershipHistoryCutoff(input: {
  plan: MembershipPlanId;
  status: MembershipSubscriptionStatus;
  currentPeriodEnd: Date | null;
  updatedAt?: Date;
}, now = new Date()): Date {
  const planCutoff = new Date(now.getTime() - membershipEntitlements[input.plan].historyRetentionDays * 86_400_000);
  if (input.status !== "CANCELLED") return planCutoff;
  const paidPeriodEnd = input.currentPeriodEnd ?? input.updatedAt ?? now;
  const readOnlyAccessEndsAt = new Date(paidPeriodEnd.getTime() + 30 * 86_400_000);
  return now <= readOnlyAccessEndsAt ? planCutoff : new Date(now.getTime() + 1);
}

export function stripeSubscriptionStatus(status: string): MembershipSubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing": return "ACTIVE";
    case "past_due":
    case "unpaid": return "PAST_DUE";
    case "canceled": return "CANCELLED";
    case "paused": return "PAUSED";
    default: return "INCOMPLETE";
  }
}

function isSerializableConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}
