import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { ArgusManualActionError, issueArgusManualHandoff, listArgusManualActions } from "@/lib/server/argus-manual-actions";

export async function GET(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) return apiError(403, "FORBIDDEN", "Administrator access is required.");
  return apiSuccess(await listArgusManualActions());
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const { executionId } = z.object({ executionId: z.string().min(1).max(100) }).parse(await request.json());
    return apiSuccess(await issueArgusManualHandoff(executionId, admin.id));
  } catch (error) {
    if (error instanceof ArgusManualActionError) {
      const status = error.code === "MANUAL_ACTION_NOT_FOUND" ? 404 : error.code === "MANUAL_ACTION_EXPIRED" ? 410 : 502;
      return apiError(status, error.code, error.message);
    }
    return apiException(error);
  }
}
