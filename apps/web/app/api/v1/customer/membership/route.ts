import { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, requireCustomerSession } from "@/lib/server/customer-auth";
import { getMembershipSummary } from "@/lib/server/membership";
import { planLaunchAvailability } from "@/lib/server/stripe-billing";

export async function GET(request: NextRequest) {
  try {
    const session = await requireCustomerSession(request);
    return apiSuccess({ ...(await getMembershipSummary(session.customerUserId)), launchAvailability: planLaunchAvailability() });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}
