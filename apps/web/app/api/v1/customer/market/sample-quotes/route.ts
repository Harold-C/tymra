import { NextRequest } from "next/server";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { parseSampleTrendFilter } from "@/lib/sample-trend-filter";
import { readSampleQuoteTrends } from "@/lib/server/sample-quote-trends";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireCustomerSession(request);
    const params: Record<string, string | string[]> = {};
    request.nextUrl.searchParams.forEach((value, key) => { params[key] = params[key] === undefined ? value : [...(Array.isArray(params[key]) ? params[key] : [params[key]]), value]; });
    const filter = parseSampleTrendFilter(params);
    if (!filter.success) return apiError(400, "INVALID_SAMPLE_QUOTE_FILTER", "Use valid dates within 90 NZ dates and supported filters.");
    const result = apiSuccess(await readSampleQuoteTrends(filter.data));
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}
