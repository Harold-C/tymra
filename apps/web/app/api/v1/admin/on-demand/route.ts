import type { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { createInternalOnDemandRequest, InternalOnDemandError } from "@/lib/server/internal-on-demand";

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    return apiSuccess(await createInternalOnDemandRequest(admin, await request.json()));
  } catch (error) {
    if (error instanceof InternalOnDemandError) return apiError(error.statusCode, error.code, error.message);
    return apiException(error);
  }
}
