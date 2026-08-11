import { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { getCustomerCheck } from "@/lib/server/membership/customer-checks";

export async function GET(request: NextRequest, { params }: { params: { checkId: string } }) {
  try {
    const session = await requireCustomerSession(request);
    const check = await getCustomerCheck(session.customerUserId, params.checkId);
    return check ? apiSuccess(check) : apiError(404, "CUSTOMER_CHECK_NOT_FOUND", "The Price Check was not found.");
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}
