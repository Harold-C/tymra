import { NextRequest } from "next/server";
import { z } from "zod";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { waiveSchedule } from "@/lib/server/service-waivers";
import { ServiceRecoveryError } from "@/lib/server/service-recovery";
const schema = z.object({ scheduleKey: z.string().trim().min(1).max(120), reason: z.string().trim().min(3).max(1000), expiresAt: z.string().datetime() }).strict();
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin || !isSameOrigin(request)) return apiError(403, "FORBIDDEN", "Administrator access and same origin required.");
    const input = schema.parse(await request.json());
    return apiSuccess(await waiveSchedule(input.scheduleKey, admin.id, input.reason, new Date(input.expiresAt)));
  } catch(error) { if (error instanceof ServiceRecoveryError) return apiError(error.statusCode, error.code, error.message); return apiException(error); }
}
