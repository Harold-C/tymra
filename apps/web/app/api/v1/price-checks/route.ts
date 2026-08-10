import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { setCheckAccessCookie } from "@/lib/server/check-access";
import { getCustomerSession } from "@/lib/server/customer-auth";
import { createPriceCheck } from "@/lib/server/price-checks";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { NextRequest } from "next/server";

export async function POST(request: Request) {
  try {
    const rateLimit = consumeRateLimit(request, "price-check-create", 20);
    if (!rateLimit.allowed) return apiError(429, "RATE_LIMITED", "Too many Price Check requests. Please try again shortly.", { headers: { "retry-after": String(rateLimit.retryAfterSeconds) } });
    const sessionRequest = request instanceof NextRequest ? request : new NextRequest(request.url, { headers: request.headers });
    const customerSession = await getCustomerSession(sessionRequest);
    const result = await createPriceCheck(await request.json(), { customerUserId: customerSession?.customerUserId });
    if (!result.accepted) return apiError(503, result.reason, "New Price Checks are temporarily paused.");
    const response = apiSuccess(
      {
        checkId: result.check.id,
        status: result.check.status,
        nextAction: result.nextAction,
      },
      { status: result.reused ? 200 : 201 },
      { reused: result.reused },
    );
    setCheckAccessCookie(response, result.check.id, result.accessKey);
    return response;
  } catch (error) {
    return apiException(error);
  }
}
