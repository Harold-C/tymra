import { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { BillingError, createMembershipPortal } from "@/lib/server/membership/stripe-billing";

export async function POST(request: NextRequest) {
  try {
    if (!isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const session = await requireCustomerSession(request);
    return apiSuccess(await createMembershipPortal(session.customerUserId));
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    if (error instanceof BillingError) return apiError(409, error.code, error.message);
    return apiException(error);
  }
}
