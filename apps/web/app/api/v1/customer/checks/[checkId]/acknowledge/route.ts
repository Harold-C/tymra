import { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, requireCustomerSession } from "@/lib/server/customer-auth";
import { acknowledgeCustomerCheck } from "@/lib/server/customer-checks";

export async function POST(request: NextRequest, { params }: { params: { checkId: string } }) {
  try {
    const session = await requireCustomerSession(request);
    const result = await acknowledgeCustomerCheck(session.customerUserId, params.checkId);
    return result ? apiSuccess(result) : apiError(404, "CUSTOMER_CHECK_NOT_FOUND", "The Price Check was not found.");
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}
