import { randomUUID } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { prisma, expireAdminMembershipGrant, type Prisma } from "@tymra/db";
import { addNzCalendarDays, effectiveMembership, entitlementsForMembership, membershipIsServiceable, nzDateKey, nzDateStorageValue } from "@tymra/domain";

// One bounded, explicitly dated refresh per object per cadence. Alternate near-term
// and rotating horizon dates; never turn an unsampled date into observed coverage.
export function scheduledStayDate(now: Date, horizon: number, sequence: number) {
  const offset = sequence % 2 === 0 ? 1 + (Math.floor(sequence / 2) % Math.min(14, horizon)) : 1 + (Math.floor(sequence / 2) % horizon);
  return addNzCalendarDays(nzDateKey(now), offset);
}

export async function enqueueDueMembershipAnalyses(now = new Date()) {
  const memberships = await prisma.membershipSubscription.findMany({
    where: { OR: [{ plan: { in: ["HOST", "PRO", "PORTFOLIO"] }, status: { in: ["ACTIVE", "PAST_DUE"] } }, { adminGrant: { is: { revokedAt: null } } }] },
    include: { adminGrant: true, customerUser: { include: { pricingUnits: { where: { active: true }, orderBy: { activatedAt: "asc" }, select: { id: true, sellableUnitId: true } } } } },
  });
  let queued = 0;
  let skipped = 0;
  for (const base of memberships) {
    if (await prisma.$transaction(tx => expireAdminMembershipGrant(tx, base.customerUserId, now))) { skipped += base.customerUser.pricingUnits.length; continue; }
    const membership = effectiveMembership(base, now);
    if (membership.plan === "FREE") continue;
    if (membership.customerUser.status !== "ACTIVE" || !membership.customerUser.emailVerifiedAt || !membershipIsServiceable(membership.status, membership.graceEndsAt, now, membership.currentPeriodEnd)) { skipped += membership.customerUser.pricingUnits.length; continue; }
    const entitlements = entitlementsForMembership(membership);
    const cadenceMs = Math.ceil(7 * 86_400_000 / entitlements.scheduledAnalysesPerWeek);
    for (const unit of membership.customerUser.pricingUnits.slice(0, entitlements.activePricingUnitLimit)) {
      const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "CustomerUser" WHERE id = ${membership.customerUserId} FOR UPDATE`;
        await expireAdminMembershipGrant(tx, membership.customerUserId, now);
        const current = effectiveMembership(await tx.membershipSubscription.findUniqueOrThrow({ where: { customerUserId: membership.customerUserId }, include: { customerUser: true, adminGrant: true } }), now);
        if (current.version !== membership.version || current.customerUser.status !== "ACTIVE" || !current.customerUser.emailVerifiedAt || !membershipIsServiceable(current.status, current.graceEndsAt, now, current.plan === "FREE" ? null : current.currentPeriodEnd) || !await tx.customerPricingUnit.findFirst({ where: { id: unit.id, customerUserId: membership.customerUserId, active: true } })) return false;
        const latest = await tx.membershipUsage.findFirst({ where: { customerUserId: membership.customerUserId, pricingUnitId: unit.id, type: "SCHEDULED_ANALYSIS", correction: null }, orderBy: { countedAt: "desc" } });
        if (latest && now.getTime() - latest.countedAt.getTime() < cadenceMs) return false;
        if (await tx.priceCheck.count({ where: { customerUserId: membership.customerUserId, unitId: unit.sellableUnitId, status: { in: ["QUEUED", "COLLECTING", "NORMALIZING", "ANALYSING", "AUTO_VALIDATING"] } } })) return false;
        const template = await tx.priceCheck.findFirst({
          where: { customerUserId: membership.customerUserId, unitId: unit.sellableUnitId, stayQueryId: { not: null }, status: "PUBLISHED", requestOrigin: { not: "MEMBERSHIP_SCHEDULE" } },
          orderBy: { createdAt: "desc" }, include: { stayQuery: true },
        });
        if (!template?.stayQuery || !template.propertyId || (template.analysisType === "LISTING_PRICING" && ["REQUIRED", "PENDING", "CONFLICT", "SOURCE_UNAVAILABLE"].includes(template.listingValidationStatus))) return false;
        const sequence = await tx.membershipUsage.count({ where: { pricingUnitId: unit.id, type: "SCHEDULED_ANALYSIS", correction: null } });
        const horizon = Math.max(1, entitlements.dailyPriceCheckHorizonDays - template.stayQuery.nights + 1);
        const event = membership.plan === "PORTFOLIO" && sequence % 2 === 1 ? await tx.marketSignal.findFirst({ where: { marketKey: template.marketKey, type: "MAJOR_EVENT", status: "CONFIRMED", startsAt: { gte: nzDateStorageValue(addNzCalendarDays(nzDateKey(now), 1)), lt: nzDateStorageValue(addNzCalendarDays(nzDateKey(now), horizon + 1)) } }, orderBy: { startsAt: "asc" } }) : null;
        const start = event ? nzDateKey(event.startsAt) : scheduledStayDate(now, horizon, sequence);
        const { id: _queryId, createdAt: _createdAt, querySignatureHash: _signature, ...profile } = template.stayQuery;
        const query = { ...profile, checkIn: nzDateStorageValue(start), checkOut: nzDateStorageValue(addNzCalendarDays(start, profile.nights)), reason: "Incremental membership refresh; confirmed occupancy and stay length" };
        const fresh = await tx.priceCheck.findFirst({ where: {
          customerUserId: membership.customerUserId, unitId: unit.sellableUnitId, analysisType: template.analysisType, locale: template.locale, listingUrl: template.listingUrl, isDemo: template.isDemo, status: "PUBLISHED",
          stayQuery: { checkIn: query.checkIn, checkOut: query.checkOut, adults: query.adults, children: query.children, units: query.units, currency: query.currency, childrenAges: { equals: query.childrenAges as Prisma.InputJsonValue }, unitConstraints: { equals: query.unitConstraints as Prisma.InputJsonValue }, cancellationCategory: query.cancellationCategory, cancellationPolicy: query.cancellationPolicy, mealPlan: query.mealPlan, ratePlan: query.ratePlan, taxAndFeePolicy: query.taxAndFeePolicy, publicRateContext: query.publicRateContext, querySemanticsVersion: query.querySemanticsVersion },
          resultVersions: { some: { status: "PUBLISHED", priceResultStatus: "COMPLETED", dataLastCheckedAt: { gte: new Date(now.getTime() - getEnvironment().FRESHNESS_CORE_HOURS * 3600000), lte: now } } },
        }, orderBy: { createdAt: "desc" } });
        const key = `scheduled-analysis:${unit.id}:${Math.floor(now.getTime() / cadenceMs)}`;
        if (await tx.membershipUsage.findUnique({ where: { idempotencyKey: key } })) return false;
        const stay = fresh ? null : await tx.stayQuery.create({ data: { ...query, childrenAges: query.childrenAges as Prisma.InputJsonValue, unitConstraints: query.unitConstraints as Prisma.InputJsonValue } });
        const check = fresh ?? await tx.priceCheck.create({ data: {
          customerUserId: template.customerUserId, analysisType: template.analysisType, requestOrigin: "MEMBERSHIP_SCHEDULE", rawInput: template.rawInput, listingUrl: template.listingUrl,
          listingValidationStatus: template.listingValidationStatus, listingValidatedAt: template.listingValidatedAt, locale: template.locale, emailHash: template.emailHash, encryptedEmail: template.encryptedEmail,
          serviceConsent: template.serviceConsent, propertyId: template.propertyId, unitId: template.unitId, marketKey: template.marketKey, isDemo: template.isDemo, status: "QUEUED", accessKeyHash: randomUUID(), idempotencyKey: key,
          stayQueryId: stay!.id,
        } });
        const usage = await tx.membershipUsage.create({ data: { customerUserId: membership.customerUserId, type: "SCHEDULED_ANALYSIS", idempotencyKey: key, pricingUnitId: unit.id, priceCheckId: check.id, countedAt: now, metadata: { plan: membership.plan, cadenceMs, exactFresh: Boolean(fresh), checkIn: start, templateCheckId: template.id } } });
        if (fresh) return false;
        await tx.job.create({ data: { type: "RATE_COLLECTION", payload: { priceCheckId: check.id, membershipUsageId: usage.id, scheduled: true }, idempotencyKey: `${key}:rate-collection`, priceCheckId: check.id, sellableUnitId: unit.sellableUnitId, queueName: "rate-collection", priority: entitlements.queuePriority, runAt: now } });
        return true;
      });
      if (result) queued += 1; else skipped += 1;
    }
  }
  return { queued, skipped };
}
