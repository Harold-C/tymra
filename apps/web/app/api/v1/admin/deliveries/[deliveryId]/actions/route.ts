import type { NextRequest } from "next/server";
import { z } from "zod";

import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { recoverEmailDelivery, ServiceRecoveryError } from "@/lib/server/service-recovery";

export async function POST(request: NextRequest, { params }: { params: { deliveryId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const input = z.object({ action: z.literal("RETRY"), reason: z.string().trim().min(3).max(1_000) }).strict().parse(await request.json());
    const job = await recoverEmailDelivery(params.deliveryId, admin.id, input.reason);
    return apiSuccess({ jobId: job.id, status: job.status });
  } catch (error) {
    if (error instanceof ServiceRecoveryError) return apiError(error.statusCode, error.code, "The notification cannot be recovered in its current state.");
    return apiException(error);
  }
}
