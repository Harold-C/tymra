import { prisma, type Prisma } from "@tymra/db";
import { membershipEntitlements, membershipIsServiceable, type MembershipPlanId } from "@tymra/domain";

export async function enqueueDueMembershipAnalyses(now = new Date()) {
  const memberships = await prisma.membershipSubscription.findMany({
    where: { plan: { in: ["HOST", "PRO", "PORTFOLIO"] }, status: { in: ["ACTIVE", "PAST_DUE"] } },
    include: {
      customerUser: {
        include: {
          pricingUnits: { where: { active: true }, select: { id: true, sellableUnitId: true } },
        },
      },
    },
  });
  let queued = 0;
  let skipped = 0;
  for (const membership of memberships) {
    if (!membershipIsServiceable(membership.status, membership.graceEndsAt, now)) {
      skipped += membership.customerUser.pricingUnits.length;
      continue;
    }
    const plan = membership.plan as MembershipPlanId;
    const entitlements = membershipEntitlements[plan];
    const cadenceMs = Math.ceil(7 * 86_400_000 / entitlements.scheduledAnalysesPerWeek);
    for (const pricingUnit of membership.customerUser.pricingUnits.slice(0, entitlements.activePricingUnitLimit)) {
      const latestUsage = await prisma.membershipUsage.findFirst({
        where: { customerUserId: membership.customerUserId, pricingUnitId: pricingUnit.id, type: "SCHEDULED_ANALYSIS" },
        orderBy: { countedAt: "desc" },
      });
      if (latestUsage && now.getTime() - latestUsage.countedAt.getTime() < cadenceMs) {
        skipped += 1;
        continue;
      }
      const priceCheck = await prisma.priceCheck.findFirst({
        where: { customerUserId: membership.customerUserId, unitId: pricingUnit.sellableUnitId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!priceCheck) {
        skipped += 1;
        continue;
      }
      const bucket = Math.floor(now.getTime() / cadenceMs);
      const idempotencyKey = `scheduled-analysis:${pricingUnit.id}:${bucket}`;
      const created = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.membershipUsage.findUnique({ where: { idempotencyKey } });
        if (existing) return false;
        const usage = await transaction.membershipUsage.create({
          data: {
            customerUserId: membership.customerUserId,
            type: "SCHEDULED_ANALYSIS",
            idempotencyKey,
            pricingUnitId: pricingUnit.id,
            priceCheckId: priceCheck.id,
            countedAt: now,
            metadata: { plan, cadenceMs },
          },
        });
        await transaction.job.create({
          data: {
            type: "RATE_COLLECTION",
            payload: { priceCheckId: priceCheck.id, membershipUsageId: usage.id, scheduled: true } as Prisma.InputJsonValue,
            idempotencyKey: `${idempotencyKey}:rate-collection`,
            priceCheckId: priceCheck.id,
            sellableUnitId: pricingUnit.sellableUnitId,
            queueName: "rate-collection",
            priority: entitlements.queuePriority,
            runAt: now,
          },
        });
        return true;
      });
      if (created) queued += 1;
      else skipped += 1;
    }
  }
  return { queued, skipped };
}
