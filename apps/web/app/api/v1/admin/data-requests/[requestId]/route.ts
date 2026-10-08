import { randomUUID } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { encryptPersonalData, hashPersonalIdentifier, prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { prepareCustomerExport } from "@/lib/server/customer-data-export";
import { ServiceRecoveryError } from "@/lib/server/service-recovery";

const schema = z.object({ status: z.enum(["IN_PROGRESS", "COMPLETED", "REJECTED"]), reason: z.string().trim().min(3).max(1_000), evidenceReference: z.string().trim().min(3).max(500).optional() }).strict();

export async function PATCH(request: NextRequest, { params }: { params: { requestId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
    const input = schema.parse(await request.json());
    const current = await prisma.customerDataRequest.findUnique({ where: { id: params.requestId }, include: { customerUser: { include: { membership: true } } } });
    if (!current) return apiError(404, "DATA_REQUEST_NOT_FOUND", "The data request was not found.");
    if (current.type === "EXPORT" && input.status === "COMPLETED") return apiSuccess(await prepareCustomerExport(current.id, admin.id, input.reason));
    if (["COMPLETED", "REJECTED"].includes(current.status)) return apiError(409, "DATA_REQUEST_CLOSED", "The data request is closed.");
    if (current.type === "DELETE" && input.status === "COMPLETED" && !input.evidenceReference) return apiError(422, "DELETION_APPROVAL_REQUIRED", "A verified deletion request reference is required.");
    if (current.type === "DELETE" && input.status === "COMPLETED" && current.customerUser.membership?.stripeSubscriptionId && current.customerUser.membership.status !== "CANCELLED") {
      return apiError(409, "ACTIVE_BILLING_MUST_BE_RESOLVED", "The paid subscription must be cancelled and reconciled before account deletion can complete.");
    }
    const updated = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "CustomerDataRequest" WHERE id = ${current.id} FOR UPDATE`;
      const locked = await transaction.customerDataRequest.findUniqueOrThrow({ where: { id: current.id } });
      if (["COMPLETED", "REJECTED"].includes(locked.status)) throw new ServiceRecoveryError("DATA_REQUEST_CLOSED");
      const now = new Date();
      const result = await transaction.customerDataRequest.update({ where: { id: current.id }, data: { status: input.status, reason: input.reason, resolutionReference: input.evidenceReference, completedAt: input.status === "COMPLETED" || input.status === "REJECTED" ? now : null } });
      if (current.type === "DELETE" && input.status === "COMPLETED") {
        await transaction.$queryRaw`SELECT id FROM "CustomerUser" WHERE id = ${current.customerUserId} FOR UPDATE`;
        const membership = await transaction.membershipSubscription.findUnique({ where: { customerUserId: current.customerUserId } });
        if (membership?.stripeSubscriptionId && membership.status !== "CANCELLED") throw new ServiceRecoveryError("ACTIVE_BILLING_MUST_BE_RESOLVED");
        const environment = getEnvironment();
        const tombstone = `deleted:${current.customerUserId}:${randomUUID()}`;
        const tombstoneHash = hashPersonalIdentifier(tombstone, environment.ACCESS_KEY_SECRET);
        const encryptedTombstone = encryptPersonalData(tombstone, environment.DATA_ENCRYPTION_KEY);
        const [checks, pricingUnits] = await Promise.all([
          transaction.priceCheck.findMany({ where: { customerUserId: current.customerUserId }, select: { id: true } }),
          transaction.customerPricingUnit.findMany({ where: { customerUserId: current.customerUserId }, select: { sellableUnitId: true } }),
        ]);
        const checkIds = checks.map((item) => item.id);
        for (const id of [...checkIds].sort()) await transaction.$queryRaw`SELECT id FROM "PriceCheck" WHERE id = ${id} FOR UPDATE`;
        if (await transaction.job.count({ where: { priceCheckId: { in: checkIds }, status: "RUNNING" } }) || await transaction.emailDelivery.count({ where: { OR: [{ recipientHash: current.customerUser.emailHash }, { priceCheckId: { in: checkIds } }], status: "SENDING" } })) throw new ServiceRecoveryError("CUSTOMER_DELIVERY_STILL_ACTIVE");
        await transaction.emailDelivery.updateMany({ where: { OR: [{ recipientHash: current.customerUser.emailHash }, { priceCheckId: { in: checkIds } }], status: { in: ["PENDING", "FAILED"] } }, data: { status: "CANCELLED" } });
        await transaction.job.updateMany({ where: { priceCheckId: { in: checkIds }, status: "PENDING" }, data: { status: "CANCELLED", completedAt: now, lastErrorCode: "CUSTOMER_DELETED" } });
        await transaction.customerDataRequest.updateMany({ where: { customerUserId: current.customerUserId, type: "EXPORT" }, data: { encryptedExport: null, exportExpiresAt: now } });
        await transaction.emailDelivery.updateMany({ where: { OR: [{ recipientHash: current.customerUser.emailHash }, { priceCheckId: { in: checkIds } }] }, data: { recipientHash: tombstoneHash, encryptedRecipient: encryptedTombstone } });
        await transaction.priceCheck.updateMany({ where: { id: { in: checkIds } }, data: { emailHash: tombstoneHash, encryptedEmail: encryptedTombstone } });
        await transaction.workerAnalysisRequest.updateMany({ where: { OR: [{ priceCheckId: { in: checkIds } }, { emailHash: current.customerUser.emailHash }] }, data: { emailHash: tombstoneHash, encryptedEmail: encryptedTombstone } });
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
    return apiSuccess({ id: updated.id, status: updated.status, completedAt: updated.completedAt });
  } catch (error) {
    if (error instanceof ServiceRecoveryError) return apiError(error.statusCode, error.code, error.message);
    return apiException(error);
  }
}
