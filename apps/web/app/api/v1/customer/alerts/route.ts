import { NextRequest } from "next/server";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { getMemberAlerts, MemberFeatureError, updateMemberAlert } from "@/lib/server/membership/member-portfolio";

async function handle(request: NextRequest, write: boolean) {
  try {
    if (write && !isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const session = await requireCustomerSession(request);
    return apiSuccess(write ? await updateMemberAlert(session.customerUserId, await request.json()) : await getMemberAlerts(session.customerUserId));
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    if (error instanceof MemberFeatureError) return apiError(error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 403, error.code, error.message);
    return apiException(error);
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const PATCH = (request: NextRequest) => handle(request, true);
