import { createHash } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { prisma, expireAdminMembershipGrant, stopGrantedMembershipWork, type AdminMembershipGrant, type Prisma } from "@tymra/db";
import { adminGrantExpiry, adminGrantHistoryGrace, adminGrantIsActive, effectiveMembership, entitlementsForMembership, membershipCapacity } from "@tymra/domain";
import { z } from "zod";
import { ensureFreeMembership, runMembershipTransaction } from "./membership";

export class AdminGrantError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 409) { super(message); }
}

export const adminGrantInputSchema = z.object({
  action: z.enum(["GRANT", "REVOKE"]),
  plan: z.enum(["HOST", "PRO", "PORTFOLIO"]).optional(),
  capacity: z.number().int().positive().max(200).optional(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expectedVersion: z.number().int().positive(),
  retainedUnitIds: z.array(z.string().min(1)).max(200).default([]),
  reason: z.string().trim().min(3).max(1_000),
  idempotencyKey: z.string().min(8).max(128),
}).strict().superRefine((input, context) => {
  if (input.action === "GRANT" && (!input.plan || input.capacity === undefined || input.expiresOn === undefined)) context.addIssue({ code: "custom", message: "Select the plan, capacity and duration." });
  if (input.action === "REVOKE" && (input.plan || input.capacity !== undefined || input.expiresOn !== undefined || input.retainedUnitIds.length)) context.addIssue({ code: "custom", message: "Revocation cannot include new entitlements." });
});
export type AdminGrantInput = z.infer<typeof adminGrantInputSchema>;

function snapshot(grant: AdminMembershipGrant | null) {
  return grant ? { id: grant.id, plan: grant.plan, capacity: grant.capacity, expiresAt: grant.expiresAt?.toISOString() ?? null, revokedAt: grant.revokedAt?.toISOString() ?? null, reason: grant.reason, revocationReason: grant.revocationReason, actorAdminId: grant.actorAdminId, version: grant.version } : null;
}

export async function administerMembershipGrant(customerUserId: string, actorAdminId: string, value: unknown, now = new Date()) {
  const input = adminGrantInputSchema.parse(value);
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const eventHash = createHash("sha256").update(`admin-membership:${actorAdminId}:${customerUserId}:${input.idempotencyKey}`).digest("hex");
  if (new Set(input.retainedUnitIds).size !== input.retainedUnitIds.length) throw new AdminGrantError("INVALID_RETAINED_UNITS", "Select each retained object once.", 422);
  return runMembershipTransaction(async transaction => {
    await transaction.$queryRaw`SELECT id FROM "CustomerUser" WHERE id = ${customerUserId} FOR UPDATE`;
    const admin = await transaction.adminUser.findFirst({ where: { id: actorAdminId, active: true }, select: { id: true } });
    if (!admin) throw new AdminGrantError("FORBIDDEN", "An active administrator is required.", 403);
    const previousAudit = await transaction.auditEvent.findUnique({ where: { eventHash } });
    if (previousAudit) {
      const payload = previousAudit.payload as Prisma.JsonObject;
      if (payload.requestHash !== requestHash) throw new AdminGrantError("REQUEST_KEY_REUSED", "The request key was used for a different change.");
      return { auditId: previousAudit.id, grant: payload.after as ReturnType<typeof snapshot>, idempotent: true };
    }
    const expiresAt = input.action === "GRANT" ? (() => {
      try { return adminGrantExpiry(input.expiresOn!, now); }
      catch { throw new AdminGrantError("INVALID_EXPIRY", "Choose a valid present or future expiry date.", 422); }
    })() : null;
    if (input.action === "GRANT" && (membershipCapacity(input.plan!, input.capacity) !== input.capacity || input.capacity! > getEnvironment().MEMBERSHIP_ADMIN_GRANT_CAPACITY_LIMIT)) throw new AdminGrantError("INVALID_GRANT_CAPACITY", "Choose an allowed capacity for this plan and the administrator limit.", 422);
    const customer = await transaction.customerUser.findUnique({ where: { id: customerUserId } });
    if (!customer) throw new AdminGrantError("CUSTOMER_NOT_FOUND", "The customer was not found.", 404);
    if (customer.status === "DELETED" || (customer.status !== "ACTIVE" && input.action === "GRANT")) throw new AdminGrantError("CUSTOMER_NOT_ACTIVE", "Only active accounts can receive or change entitlements.");
    const membership = await ensureFreeMembership(transaction, customerUserId);
    const before = await transaction.adminMembershipGrant.findUnique({ where: { customerUserId } });
    if (effectiveMembership({ ...membership, adminGrant: before }, now).version !== input.expectedVersion) throw new AdminGrantError("MEMBERSHIP_CHANGED", "Entitlements changed. Refresh and review again.");
    if (membership.plan !== "FREE" || membership.status !== "ACTIVE" || membership.stripeSubscriptionId || membership.stripeCheckoutSessionId || membership.pendingPlan || membership.pendingChangeKind) throw new AdminGrantError("BILLING_CONFLICT", "Resolve the linked or pending paid subscription before granting entitlements.");
    await expireAdminMembershipGrant(transaction, customerUserId, now);
    const current = await transaction.adminMembershipGrant.findUnique({ where: { customerUserId } });
    if (input.action === "REVOKE" && !adminGrantIsActive(current, now)) throw new AdminGrantError("NO_ACTIVE_GRANT", "There is no active administrator grant to revoke.");
    const units = await transaction.customerPricingUnit.findMany({ where: { customerUserId, OR: [{ active: true }, { slotRetainedUntil: { gt: now } }] }, select: { id: true } });
    const targetCapacity = input.action === "REVOKE" ? 0 : input.capacity!;
    if (input.retainedUnitIds.some(id => !units.some(unit => unit.id === id)) || input.retainedUnitIds.length > targetCapacity) throw new AdminGrantError("INVALID_RETAINED_UNITS", "Retained objects must belong to this customer and fit the capacity.", 422);
    if (input.action === "GRANT" && units.length > targetCapacity && input.retainedUnitIds.length !== targetCapacity) throw new AdminGrantError("RETAINED_UNITS_REQUIRED", "Choose exactly the objects to retain before lowering capacity.", 422);
    const previousRights = effectiveMembership({ ...membership, adminGrant: current }, now);
    const historyGrace = current && entitlementsForMembership(previousRights).historyRetentionDays > entitlementsForMembership({ plan: input.action === "GRANT" ? input.plan! : "FREE", purchasedCapacity: input.action === "REVOKE" ? 1 : targetCapacity }).historyRetentionDays ? adminGrantHistoryGrace(current, now) : {};
    const change = input.action === "REVOKE" || units.length > targetCapacity ? await stopGrantedMembershipWork(transaction, customerUserId, now, input.retainedUnitIds) : { stoppedUnitIds: [], cancelledJobIds: [] };
    const after = input.action === "REVOKE"
      ? await transaction.adminMembershipGrant.update({ where: { id: current!.id }, data: { revokedAt: now, revocationReason: input.reason, actorAdminId, version: { increment: 1 }, ...historyGrace } })
      : await transaction.adminMembershipGrant.upsert({ where: { customerUserId }, create: { customerUserId, actorAdminId, plan: input.plan!, capacity: input.capacity!, expiresAt, reason: input.reason }, update: { actorAdminId, plan: input.plan!, capacity: input.capacity!, expiresAt, reason: input.reason, revokedAt: null, revocationReason: null, version: { increment: 1 }, ...historyGrace } });
    const audit = await transaction.auditEvent.create({ data: {
      actorAdminId, eventType: input.action === "REVOKE" ? "admin_membership_grant_revoked" : "admin_membership_granted", entityType: "AdminMembershipGrant", entityId: after.id, eventHash,
      payload: { customerUserId, requestHash, correlationId: input.idempotencyKey, reason: input.reason, before: snapshot(before), after: snapshot(after), ...change, financialSubscriptionPreserved: true, usagePreserved: true, emailVerificationPreserved: true },
    } });
    return { auditId: audit.id, grant: snapshot(after), idempotent: false };
  });
}

export async function adminMembershipGrantHistory(customerUserId: string) {
  return prisma.auditEvent.findMany({ where: { eventType: { in: ["admin_membership_granted", "admin_membership_grant_revoked", "admin_membership_grant_expired"] }, payload: { path: ["customerUserId"], equals: customerUserId } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, eventType: true, createdAt: true, actorAdmin: { select: { email: true } }, payload: true } });
}
