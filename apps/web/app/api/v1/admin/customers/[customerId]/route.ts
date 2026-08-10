import { randomUUID } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { hashPersonalIdentifier, prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";

const inputSchema = z.object({
  action: z.enum(["SET_PLAN", "SET_MEMBERSHIP_STATUS", "REVOKE_SESSIONS", "SUSPEND_CUSTOMER", "ACTIVATE_CUSTOMER", "RESOLVE_RISK_ALLOW", "RESOLVE_RISK_DENY", "RELEASE_BENEFIT_GROUP", "MARK_EMAIL_VERIFIED"]),
  value: z.string().optional(),
  reason: z.string().trim().min(3).max(1_000),
});

export async function PATCH(request: NextRequest, { params }: { params: { customerId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
    const input = inputSchema.parse(await request.json());
    const customer = await prisma.customerUser.findUnique({ where: { id: params.customerId }, include: { membership: true } });
    if (!customer) return apiError(404, "CUSTOMER_NOT_FOUND", "The customer was not found.");
    if ((input.action === "SET_PLAN" || input.action === "SET_MEMBERSHIP_STATUS") && customer.membership?.stripeSubscriptionId) {
      return apiError(409, "STRIPE_RECONCILIATION_REQUIRED", "Stripe-backed membership state must be corrected through billing reconciliation.");
    }
    await prisma.$transaction(async (transaction) => {
      if (input.action === "SET_PLAN") {
        const plan = z.enum(["FREE", "HOST", "PRO", "PORTFOLIO"]).parse(input.value);
        await transaction.membershipSubscription.upsert({ where: { customerUserId: customer.id }, create: { customerUserId: customer.id, plan }, update: { plan, pendingPlan: null, version: { increment: 1 } } });
      } else if (input.action === "SET_MEMBERSHIP_STATUS") {
        const status = z.enum(["ACTIVE", "PAST_DUE", "CANCELLED", "INCOMPLETE", "PAUSED"]).parse(input.value);
        await transaction.membershipSubscription.upsert({ where: { customerUserId: customer.id }, create: { customerUserId: customer.id, status }, update: { status, version: { increment: 1 } } });
      } else if (input.action === "REVOKE_SESSIONS") {
        await transaction.customerSession.updateMany({ where: { customerUserId: customer.id, revokedAt: null }, data: { revokedAt: new Date() } });
      } else if (input.action === "RESOLVE_RISK_ALLOW" || input.action === "RESOLVE_RISK_DENY") {
        if (!input.value) throw new Error("A risk case ID is required.");
        const riskCase = await transaction.membershipRiskCase.findFirst({ where: { id: input.value, customerUserId: customer.id, status: "OPEN" } });
        if (!riskCase) throw new Error("The open risk case was not found.");
        const approved = input.action === "RESOLVE_RISK_ALLOW";
        await transaction.membershipRiskCase.update({ where: { id: riskCase.id }, data: { status: approved ? "APPROVED" : "DENIED", adminNote: input.reason, resolvedAt: new Date(), resolvedByAdminId: admin.id } });
        if (riskCase.benefitGroupId) await transaction.benefitGroup.update({ where: { id: riskCase.benefitGroupId }, data: { status: approved ? "ACTIVE" : "LIMITED" } });
      } else if (input.action === "RELEASE_BENEFIT_GROUP") {
        const group = await transaction.benefitGroup.create({ data: { policyVersion: "member-abuse-v1" } });
        await transaction.customerUser.update({ where: { id: customer.id }, data: { benefitGroupId: group.id } });
        await transaction.riskIdentity.createMany({ data: [
          { benefitGroupId: group.id, customerUserId: customer.id, subjectType: "ACCOUNT", subjectHash: customer.id, confidence: 100, reasonCodes: ["ADMIN_RELEASE"] },
          { benefitGroupId: group.id, customerUserId: customer.id, subjectType: "EMAIL", subjectHash: customer.emailHash, confidence: 100, reasonCodes: ["ADMIN_RELEASE"] },
        ] });
      } else if (input.action === "MARK_EMAIL_VERIFIED") {
        await transaction.customerUser.update({ where: { id: customer.id }, data: { emailVerifiedAt: new Date() } });
      } else {
        const status = input.action === "SUSPEND_CUSTOMER" ? "SUSPENDED" : "ACTIVE";
        await transaction.customerUser.update({ where: { id: customer.id }, data: { status } });
        if (status === "SUSPENDED") await transaction.customerSession.updateMany({ where: { customerUserId: customer.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await transaction.auditEvent.create({ data: { actorAdminId: admin.id, eventType: `customer_${input.action.toLowerCase()}`, entityType: "CustomerUser", entityId: customer.id, payload: { previousPlan: customer.membership?.plan ?? null, previousMembershipStatus: customer.membership?.status ?? null, previousCustomerStatus: customer.status, value: input.value ?? null, reason: input.reason }, eventHash: hashPersonalIdentifier(`${customer.id}:${input.action}:${randomUUID()}`, getEnvironment().ACCESS_KEY_SECRET) } });
    });
    return apiSuccess({ updated: true });
  } catch (error) { return apiException(error); }
}
