import { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { listCustomerChecks } from "@/lib/server/membership/customer-checks";

export async function GET(request: NextRequest) {
  try {
    const session = await requireCustomerSession(request);
    return apiSuccess(await listCustomerChecks(session.customerUserId));
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}
