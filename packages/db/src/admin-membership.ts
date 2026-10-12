import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { adminGrantHistoryGrace, effectiveMembership } from "@tymra/domain";
import type { MembershipPlan, MembershipSubscriptionStatus } from "@prisma/client";

export function effectiveMembershipFilter(plan?: MembershipPlan, status?: MembershipSubscriptionStatus, now = new Date()): Prisma.MembershipSubscriptionWhereInput {
  const activeGrant: Prisma.AdminMembershipGrantWhereInput = { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  return { OR: [
    ...(status && status !== "ACTIVE" ? [] : [{ adminGrant: { is: { ...activeGrant, ...(plan ? { plan } : {}) } } }]),
    { AND: [{ OR: [{ adminGrant: { is: null } }, { adminGrant: { is: { OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: now } }] } } }] }, { ...(plan ? { plan } : {}), ...(status ? { status } : {}) }] },
  ] };
}

/** Read the same effective rights in Web and Worker; financial fields stay in the base row. */
export async function findEffectiveMembership(database: Prisma.TransactionClient, customerUserId: string, now = new Date()) {
  const membership = await database.membershipSubscription.findUnique({ where: { customerUserId }, include: { adminGrant: true } });
  return membership ? effectiveMembership(membership, now) : null;
}

/** Stop only this customer's pending collection work. Existing results and usage are preserved. */
export async function stopGrantedMembershipWork(transaction: Prisma.TransactionClient, customerUserId: string, now: Date, retainedUnitIds: string[] = []) {
  const stoppedUnits = await transaction.customerPricingUnit.findMany({ where: { customerUserId, id: { notIn: retainedUnitIds } }, select: { id: true, sellableUnitId: true } });
  await transaction.customerPricingUnit.updateMany({ where: { customerUserId, id: { in: stoppedUnits.map(unit => unit.id) } }, data: { active: false, deactivatedAt: now, slotRetainedUntil: null } });
  const jobs = await transaction.job.findMany({ where: {
    status: "PENDING", type: { in: ["RATE_COLLECTION", "CATALOG_DISCOVERY"] }, priceCheck: { customerUserId },
    ...(retainedUnitIds.length ? { sellableUnitId: { in: stoppedUnits.map(unit => unit.sellableUnitId) } } : {}),
  }, select: { id: true, priceCheckId: true } });
  await transaction.job.updateMany({ where: { id: { in: jobs.map(job => job.id) }, status: "PENDING" }, data: { status: "CANCELLED", completedAt: now } });
  await transaction.priceCheck.updateMany({ where: { id: { in: jobs.flatMap(job => job.priceCheckId ? [job.priceCheckId] : []) }, customerUserId, status: "QUEUED" }, data: { status: "CANCELLED" } });
  return { stoppedUnitIds: stoppedUnits.map(unit => unit.id), cancelledJobIds: jobs.map(job => job.id) };
}

export async function expireAdminMembershipGrant(transaction: Prisma.TransactionClient, customerUserId: string, now = new Date()) {
  const due = await transaction.adminMembershipGrant.findUnique({ where: { customerUserId } });
  if (!due || due.revokedAt || !due.expiresAt || due.expiresAt > now) return false;
  await transaction.$queryRaw`SELECT id FROM "CustomerUser" WHERE id = ${customerUserId} FOR UPDATE`;
  const grant = await transaction.adminMembershipGrant.findUniqueOrThrow({ where: { customerUserId } });
  if (grant.revokedAt || !grant.expiresAt || grant.expiresAt > now) return false;
  const change = await stopGrantedMembershipWork(transaction, customerUserId, now);
  const after = await transaction.adminMembershipGrant.update({ where: { id: grant.id }, data: {
    revokedAt: grant.expiresAt, revocationReason: "EXPIRED", version: { increment: 1 }, ...adminGrantHistoryGrace(grant, grant.expiresAt),
  } });
  await transaction.auditEvent.create({ data: {
    eventType: "admin_membership_grant_expired", entityType: "AdminMembershipGrant", entityId: grant.id,
    eventHash: createHash("sha256").update(`admin-membership-expiry:${grant.id}:${grant.version}`).digest("hex"),
    payload: { customerUserId, plan: grant.plan, capacity: grant.capacity, expiredAt: grant.expiresAt.toISOString(), previousVersion: grant.version, version: after.version, ...change, financialSubscriptionPreserved: true, usagePreserved: true },
  } });
  return true;
}
