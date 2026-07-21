import { enqueueJob, hashPersonalIdentifier, prisma } from "@tymra/db";
import { getEnvironment } from "@tymra/config";
import type { NextRequest } from "next/server";

import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";

export async function POST(request: NextRequest, { params }: { params: { checkId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
    const check = await prisma.priceCheck.findUnique({ where: { id: params.checkId } });
    if (!check) return apiError(404, "CHECK_NOT_FOUND", "The Price Check was not found.");
    const result = await prisma.resultVersion.findFirst({ where: { priceCheckId: check.id, status: "PUBLISHED" }, orderBy: { version: "desc" } });
    if (!result) return apiError(409, "NO_PUBLISHED_RESULT", "No published Result Version can be reissued.");

    const sequence = await prisma.emailDelivery.count({ where: { priceCheckId: check.id, type: "LINK_REISSUED" } });
    const delivery = await prisma.emailDelivery.create({
      data: {
        priceCheckId: check.id,
        resultVersionId: result.id,
        type: "LINK_REISSUED",
        locale: check.locale,
        recipientHash: check.emailHash,
        encryptedRecipient: check.encryptedEmail,
        provider: "pending",
        idempotencyKey: `${check.id}:link-reissued:${result.version}:${sequence + 1}`,
      },
    });
    await enqueueJob({ type: "EMAIL_DELIVERY", payload: { deliveryId: delivery.id }, idempotencyKey: `${check.id}:link-reissued-job:${delivery.id}`, priceCheckId: check.id });
    await prisma.auditEvent.create({
      data: {
        actorAdminId: admin.id,
        eventType: "result_link_reissue_requested",
        entityType: "PriceCheck",
        entityId: check.id,
        payload: { resultVersion: result.version, deliveryId: delivery.id },
        eventHash: hashPersonalIdentifier(`${delivery.id}:result-link-reissue`, getEnvironment().ACCESS_KEY_SECRET),
        isDemo: check.isDemo,
      },
    });
    return apiSuccess({ queued: true, deliveryId: delivery.id }, { status: 202 });
  } catch (error) {
    return apiException(error);
  }
}
