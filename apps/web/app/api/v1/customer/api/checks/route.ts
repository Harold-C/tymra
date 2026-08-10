import { prisma } from "@tymra/db";
import { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, requireCustomerSession } from "@/lib/server/customer-auth";
import { MembershipAccessError, MembershipOperationError, reserveMembershipOperation } from "@/lib/server/membership";

export async function GET(request: NextRequest) {
  try {
    const session = await requireCustomerSession(request);
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    const reservation = await reserveMembershipOperation({ customerUserId: session.customerUserId, action: "MEMBER_API", idempotencyKey });
    const checks = await prisma.priceCheck.findMany({ where: { customerUserId: session.customerUserId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, analysisType: true, status: true, propertyId: true, unitId: true, createdAt: true, updatedAt: true } });
    return apiSuccess({ checks, remainingAfter: "remainingAfter" in reservation ? reservation.remainingAfter : null }, undefined, { reused: reservation.idempotent });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    if (error instanceof MembershipAccessError || error instanceof MembershipOperationError) return apiError(error.code.includes("QUOTA") ? 429 : 403, error.code, error.message);
    return apiException(error);
  }
}
