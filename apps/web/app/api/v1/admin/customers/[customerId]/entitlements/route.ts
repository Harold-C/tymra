import { NextRequest } from "next/server";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { administerMembershipGrant, AdminGrantError } from "@/lib/server/membership/admin-grants";

export async function POST(request: NextRequest, { params }: { params: { customerId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
    return apiSuccess(await administerMembershipGrant(params.customerId, admin.id, await request.json()));
  } catch (error) {
    if (error instanceof AdminGrantError) return apiError(error.statusCode, error.code, error.message);
    return apiException(error);
  }
}
