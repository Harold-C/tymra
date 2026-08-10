import { randomUUID } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { encryptPersonalData, hashPersonalIdentifier, prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";

const schema = z.object({ status: z.enum(["IN_PROGRESS", "COMPLETED", "REJECTED"]), reason: z.string().trim().min(3).max(1_000), evidenceReference: z.string().trim().min(3).max(500).optional() }).superRefine((value, context) => {
  if (value.status === "COMPLETED" && !value.evidenceReference) context.addIssue({ code: "custom", path: ["evidenceReference"], message: "A delivery or approval reference is required to complete a request." });
});

export async function PATCH(request: NextRequest, { params }: { params: { requestId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
    const input = schema.parse(await request.json());
    const current = await prisma.customerDataRequest.findUnique({ where: { id: params.requestId }, include: { customerUser: { include: { membership: true } } } });
    if (!current) return apiError(404, "DATA_REQUEST_NOT_FOUND", "The data request was not found.");
    if (current.type === "DELETE" && input.status === "COMPLETED" && current.customerUser.membership?.stripeSubscriptionId && current.customerUser.membership.status !== "CANCELLED") {
      return apiError(409, "ACTIVE_BILLING_MUST_BE_RESOLVED", "The paid subscription must be cancelled and reconciled before account deletion can complete.");
    }
    const updated = await prisma.$transaction(async (transaction) => {
      const now = new Date();
      const result = await transaction.customerDataRequest.update({ where: { id: current.id }, data: { status: input.status, reason: input.reason, resolutionReference: input.evidenceReference, completedAt: input.status === "COMPLETED" || input.status === "REJECTED" ? now : null } });
      if (current.type === "DELETE" && input.status === "COMPLETED") {
        const environment = getEnvironment();
        const tombstone = `deleted:${current.customerUserId}:${randomUUID()}`;
        const tombstoneHash = hashPersonalIdentifier(tombstone, environment.ACCESS_KEY_SECRET);
        const encryptedTombstone = encryptPersonalData(tombstone, environment.DATA_ENCRYPTION_KEY);
        const [checks, pricingUnits] = await Promise.all([
          transaction.priceCheck.findMany({ where: { customerUserId: current.customerUserId }, select: { id: true } }),
          transaction.customerPricingUnit.findMany({ where: { customerUserId: current.customerUserId }, select: { sellableUnitId: true } }),
        ]);
        const checkIds = checks.map((item) => item.id);
        await transaction.emailDelivery.updateMany({ where: { OR: [{ recipientHash: current.customerUser.emailHash }, { priceCheckId: { in: checkIds } }] }, data: { recipientHash: tombstoneHash, encryptedRecipient: encryptedTombstone } });
        await transaction.priceCheck.updateMany({ where: { id: { in: checkIds } }, data: { emailHash: tombstoneHash, encryptedEmail: encryptedTombstone } });
        await transaction.magicLink.updateMany({ where: { customerUserId: current.customerUserId }, data: { emailHash: tombstoneHash, encryptedEmail: encryptedTombstone, status: "REVOKED", revokedAt: now } });
        await transaction.customerSession.updateMany({ where: { customerUserId: current.customerUserId, revokedAt: null }, data: { revokedAt: now } });
        await transaction.customerPricingUnit.updateMany({ where: { customerUserId: current.customerUserId, active: true }, data: { active: false, deactivatedAt: now } });
        await transaction.job.updateMany({ where: { sellableUnitId: { in: pricingUnits.map((item) => item.sellableUnitId) }, status: "PENDING", payload: { path: ["scheduled"], equals: true } }, data: { status: "CANCELLED", completedAt: now } });
        await transaction.membershipSubscription.updateMany({ where: { customerUserId: current.customerUserId }, data: { status: "CANCELLED", cancelAtPeriodEnd: false, pendingPlan: null, version: { increment: 1 } } });
        await transaction.customerUser.update({ where: { id: current.customerUserId }, data: { emailHash: tombstoneHash, encryptedEmail: encryptedTombstone, passwordHash: null, passwordChangedAt: null, status: "DELETED", marketingConsent: false } });
      }
      await transaction.auditEvent.create({ data: { actorAdminId: admin.id, eventType: "customer_data_request_updated", entityType: "CustomerDataRequest", entityId: current.id, payload: { previousStatus: current.status, status: input.status, reason: input.reason, resolutionReference: input.evidenceReference ?? null, customerUserId: current.customerUserId, requestType: current.type }, eventHash: hashPersonalIdentifier(`${current.id}:${input.status}:${randomUUID()}`, getEnvironment().ACCESS_KEY_SECRET) } });
      return result;
    });
    return apiSuccess(updated);
  } catch (error) { return apiException(error); }
}
