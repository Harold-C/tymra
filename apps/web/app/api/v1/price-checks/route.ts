import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { setCheckAccessCookie } from "@/lib/server/check-access";
import { createPriceCheck } from "@/lib/server/price-checks";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  try {
    const rateLimit = consumeRateLimit(request, "price-check-create", 20);
    if (!rateLimit.allowed) return apiError(429, "RATE_LIMITED", "Too many Price Check requests. Please try again shortly.", { headers: { "retry-after": String(rateLimit.retryAfterSeconds) } });
    const result = await createPriceCheck(await request.json());
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
