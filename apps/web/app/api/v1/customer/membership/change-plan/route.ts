import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession } from "@/lib/server/customer-auth";
import { BillingError, changeMembershipPlan } from "@/lib/server/stripe-billing";

const inputSchema = z.object({ plan: z.enum(["HOST", "PRO", "PORTFOLIO"]) });

export async function POST(request: NextRequest) {
  try {
    if (!isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const session = await requireCustomerSession(request);
    return apiSuccess(await changeMembershipPlan(session.customerUserId, inputSchema.parse(await request.json()).plan));
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    if (error instanceof BillingError) return apiError(409, error.code, error.message);
    return apiException(error);
  }
}
