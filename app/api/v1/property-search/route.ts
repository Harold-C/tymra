import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { searchProperties } from "@/lib/server/price-checks";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  try {
    const rateLimit = consumeRateLimit(request, "property-search", 60);
    if (!rateLimit.allowed) return apiError(429, "RATE_LIMITED", "Too many searches. Please try again shortly.", { headers: { "retry-after": String(rateLimit.retryAfterSeconds) } });
    return apiSuccess(await searchProperties(await request.json()));
  } catch (error) {
    return apiException(error);
  }
}
