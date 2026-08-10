import { prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession } from "@/lib/server/customer-auth";

const appealSchema = z.object({ caseId: z.string().cuid(), reason: z.string().trim().min(20).max(2_000) });

export async function GET(request: NextRequest) {
  try {
    const session = await requireCustomerSession(request);
    const cases = await prisma.membershipRiskCase.findMany({
      where: { customerUserId: session.customerUserId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, status: true, outcome: true, action: true, reasonCodes: true, cooldownUntil: true, appealReason: true, createdAt: true, resolvedAt: true },
    });
    return apiSuccess({ cases });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const session = await requireCustomerSession(request);
    const input = appealSchema.parse(await request.json());
    const updated = await prisma.membershipRiskCase.updateMany({ where: { id: input.caseId, customerUserId: session.customerUserId, status: "OPEN", appealReason: null }, data: { appealReason: input.reason } });
    if (updated.count !== 1) return apiError(409, "RISK_APPEAL_NOT_AVAILABLE", "This case cannot be appealed again.");
    return apiSuccess({ accepted: true }, { status: 202 });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}
