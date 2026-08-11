import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { addPricingUnitFromCheck, getMembershipSummary, MembershipAccessError } from "@/lib/server/membership/membership";

const inputSchema = z.object({ priceCheckId: z.string().min(1).max(128) });

export async function GET(request: NextRequest) {
  try {
    const session = await requireCustomerSession(request);
    const summary = await getMembershipSummary(session.customerUserId);
    return apiSuccess({
      items: summary.pricingUnits,
      activePricingUnitLimit: summary.entitlements.activePricingUnitLimit,
      occupiedPricingUnits: summary.pricingUnits.filter((item) => item.occupiesSlot).length,
    });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const session = await requireCustomerSession(request);
    const input = inputSchema.parse(await request.json());
    const item = await addPricingUnitFromCheck(session.customerUserId, input.priceCheckId);
    if (!item) return apiError(404, "ELIGIBLE_PRICE_CHECK_NOT_FOUND", "An owned, confirmed Price Check was not found.");
    return apiSuccess(item, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    if (error instanceof MembershipAccessError) return apiError(409, error.code, error.message);
    return apiException(error);
  }
}
