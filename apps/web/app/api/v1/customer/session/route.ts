import { NextRequest, NextResponse } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import {
  clearCustomerSessionCookie,
  CustomerAuthenticationError,
  isCustomerSameOrigin,
  requireCustomerSession,
  revokeCustomerSession,
} from "@/lib/server/customer-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await requireCustomerSession(request);
    return apiSuccess({
      authenticated: true,
      customerUserId: session.customerUserId,
      locale: session.customerUser.locale,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "UNAUTHENTICATED", error.message);
    return apiException(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isCustomerSameOrigin(request)) return apiError(403, "FORBIDDEN", "The request origin is not allowed.");
  try {
    const input = await request.json().catch(() => ({})) as { allSessions?: unknown };
    const result = await revokeCustomerSession(request, input.allSessions === true);
    const response = NextResponse.json({ data: result });
    clearCustomerSessionCookie(response);
    return response;
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) {
      const response = NextResponse.json({ error: { code: "UNAUTHENTICATED", message: error.message } }, { status: 401 });
      clearCustomerSessionCookie(response);
      return response;
    }
    return apiException(error);
  }
}
