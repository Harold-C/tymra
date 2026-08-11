import { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { issueCustomerEmailVerification } from "@/lib/server/membership/magic-links";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export async function POST(request: NextRequest) {
  try {
    if (!isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const session = await requireCustomerSession(request);
    const rateLimit = consumeRateLimit(request, "customer-verify-email", 3, 60 * 60_000);
    if (!rateLimit.allowed) return apiError(429, "RATE_LIMITED", "Please wait before requesting another verification email.", { headers: { "retry-after": String(rateLimit.retryAfterSeconds) } });
    const result = await issueCustomerEmailVerification(session.customerUserId);
    return apiSuccess({ accepted: true, ...result }, { status: 202 });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}
