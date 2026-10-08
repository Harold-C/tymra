import { NextRequest } from "next/server";
import { z } from "zod";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { revokeScheduleWaiver } from "@/lib/server/service-waivers";
const schema = z.object({ action: z.literal("REVOKE"), reason: z.string().trim().min(3).max(1000) }).strict();
export async function POST(request: NextRequest, { params }: { params: { waiverId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin || !isSameOrigin(request)) return apiError(403, "FORBIDDEN", "Administrator access and same origin required.");
    const input = schema.parse(await request.json());
    return apiSuccess(await revokeScheduleWaiver(params.waiverId, admin.id, input.reason));
  } catch(error) { return apiException(error); }
}
