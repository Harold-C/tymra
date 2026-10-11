import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { BillingError, changeMembershipPlan } from "@/lib/server/membership/stripe-billing";

const inputSchema = z.object({ plan: z.enum(["HOST", "PRO", "PORTFOLIO"]), capacity: z.number().int().min(1).max(200), quoteToken: z.string().min(1).max(4096), retainedUnitIds: z.array(z.string().min(1).max(100)).max(200).optional() });

export async function POST(request: NextRequest) {
  try {
    if (!isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const session = await requireCustomerSession(request);
    const input = inputSchema.parse(await request.json());
    return apiSuccess(await changeMembershipPlan(session.customerUserId, input.plan, input.capacity, input.quoteToken, input.retainedUnitIds));
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    if (error instanceof BillingError) return apiError(409, error.code, error.message);
    return apiException(error);
  }
}
