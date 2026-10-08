import { NextRequest } from "next/server";
import { z } from "zod";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { BillingError, reconcileBillingEvent } from "@/lib/server/membership/stripe-billing";
const schema = z.object({ action: z.literal("RECONCILE"), reason: z.string().trim().min(3).max(1000) }).strict();
export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin || !isSameOrigin(request)) return apiError(403, "FORBIDDEN", "Administrator access and same origin are required.");
    const input = schema.parse(await request.json());
    return apiSuccess(await reconcileBillingEvent(params.eventId, admin.id, input.reason));
  } catch(error) { if (error instanceof BillingError) return apiError(409, error.code, error.message); return apiException(error); }
}
