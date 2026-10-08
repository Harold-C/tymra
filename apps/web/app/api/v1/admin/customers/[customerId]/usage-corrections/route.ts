import { NextRequest } from "next/server";
import { z } from "zod";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { correctDuplicateUsage } from "@/lib/server/usage-correction";
import { ServiceRecoveryError } from "@/lib/server/service-recovery";
const schema = z.object({ usageId: z.string().min(1), originalUsageId: z.string().min(1), reason: z.string().trim().min(3).max(1000), evidenceReference: z.string().trim().min(3).max(500) }).strict();
export async function POST(request: NextRequest, { params }: { params: { customerId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin || !isSameOrigin(request)) return apiError(403, "FORBIDDEN", "Administrator access and same origin required.");
    const input = schema.parse(await request.json());
    return apiSuccess(await correctDuplicateUsage(params.customerId, input.usageId, input.originalUsageId, admin.id, input.reason, input.evidenceReference));
  } catch(error) { if (error instanceof ServiceRecoveryError) return apiError(error.statusCode, error.code, error.message); return apiException(error); }
}
