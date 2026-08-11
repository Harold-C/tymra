import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { MembershipAccessError, setPricingUnitActive } from "@/lib/server/membership/membership";

const inputSchema = z.object({ active: z.boolean() });

export async function PATCH(request: NextRequest, { params }: { params: { pricingUnitId: string } }) {
  try {
    if (!isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const session = await requireCustomerSession(request);
    const item = await setPricingUnitActive(session.customerUserId, params.pricingUnitId, inputSchema.parse(await request.json()).active);
    if (!item) return apiError(404, "PRICING_UNIT_NOT_FOUND", "The pricing unit was not found.");
    return apiSuccess({ id: item.id, active: item.active });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    if (error instanceof MembershipAccessError) return apiError(409, error.code, error.message);
    return apiException(error);
  }
}
