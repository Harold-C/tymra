import { prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { reconcileCustomerBilling, BillingError } from "@/lib/server/membership/stripe-billing";
import { ServiceRecoveryError, writeServiceAudit } from "@/lib/server/service-recovery";

const inputSchema = z.object({
  action: z.enum(["RECONCILE_BILLING", "REVOKE_SESSIONS", "SUSPEND_CUSTOMER", "ACTIVATE_CUSTOMER", "RESOLVE_RISK_ALLOW", "RESOLVE_RISK_DENY"]),
  value: z.string().trim().min(1).max(128).optional(),
  reason: z.string().trim().min(3).max(1_000),
}).strict();

export async function PATCH(request: NextRequest, { params }: { params: { customerId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
    const input = inputSchema.parse(await request.json());
    const customer = await prisma.customerUser.findUnique({ where: { id: params.customerId }, include: { membership: true } });
    if (!customer) return apiError(404, "CUSTOMER_NOT_FOUND", "The customer was not found.");
    if (customer.status === "DELETED") return apiError(409, "CUSTOMER_DELETED", "Deleted accounts cannot be reactivated.");
    if (input.action === "RECONCILE_BILLING") return apiSuccess(await reconcileCustomerBilling(customer.id, admin.id, input.reason));
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "CustomerUser" WHERE id = ${customer.id} FOR UPDATE`;
      const locked = await transaction.customerUser.findUniqueOrThrow({ where: { id: customer.id } });
      if (locked.status === "DELETED") throw new ServiceRecoveryError("CUSTOMER_DELETED");
      if (input.action === "REVOKE_SESSIONS") {
        await transaction.customerSession.updateMany({ where: { customerUserId: customer.id, revokedAt: null }, data: { revokedAt: new Date() } });
      } else if (input.action === "RESOLVE_RISK_ALLOW" || input.action === "RESOLVE_RISK_DENY") {
        if (!input.value) throw new ServiceRecoveryError("RISK_CASE_REQUIRED", 422);
        const riskCase = await transaction.membershipRiskCase.findFirst({ where: { id: input.value, customerUserId: customer.id } });
        if (!riskCase) throw new ServiceRecoveryError("RISK_CASE_NOT_FOUND", 404);
        if (riskCase.status !== "OPEN") throw new ServiceRecoveryError("RISK_CASE_ALREADY_REVIEWED");
        const approved = input.action === "RESOLVE_RISK_ALLOW";
        await transaction.membershipRiskCase.update({ where: { id: riskCase.id }, data: { status: approved ? "APPROVED" : "DENIED", adminNote: input.reason, resolvedAt: new Date(), resolvedByAdminId: admin.id } });
        if (riskCase.benefitGroupId) {
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`membership-benefit:${riskCase.benefitGroupId}`}))`;
          const unresolved = await transaction.membershipRiskCase.count({ where: { benefitGroupId: riskCase.benefitGroupId, status: { in: ["OPEN", "DENIED"] } } });
          await transaction.benefitGroup.update({ where: { id: riskCase.benefitGroupId }, data: { status: approved && !unresolved ? "ACTIVE" : "LIMITED" } });
        }
      } else {
        const status = input.action === "SUSPEND_CUSTOMER" ? "SUSPENDED" : "ACTIVE";
        await transaction.customerUser.update({ where: { id: customer.id }, data: { status } });
        if (status === "SUSPENDED") await transaction.customerSession.updateMany({ where: { customerUserId: customer.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await writeServiceAudit(transaction, admin.id, `customer_${input.action.toLowerCase()}`, "CustomerUser", customer.id, { previousPlan: customer.membership?.plan ?? null, previousMembershipStatus: customer.membership?.status ?? null, previousCustomerStatus: customer.status, value: input.value ?? null, reason: input.reason });
    });
    return apiSuccess({ updated: true });
  } catch (error) {
    if (error instanceof ServiceRecoveryError) return apiError(error.statusCode, error.code, error.message);
    if (error instanceof BillingError) return apiError(409, error.code, error.message);
    return apiException(error);
  }
}
