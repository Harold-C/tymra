import type { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { runExceptionAction } from "@/lib/server/admin-operations";
import { ServiceRecoveryError } from "@/lib/server/service-recovery";

export async function POST(request: NextRequest, { params }: { params: { exceptionId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const result = await runExceptionAction(params.exceptionId, admin.id, await request.json());
    return apiSuccess({ exceptionId: result.id, status: result.status, resolutionAction: result.resolutionAction });
  } catch (error) {
    if (error instanceof ServiceRecoveryError) return apiError(error.statusCode, error.code, "The service action could not be applied. Review the current state and recovery evidence.");
    return apiException(error);
  }
}
