import type { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { hasCheckAccess } from "@/lib/server/check-access";
import { getPublicCheck } from "@/lib/server/price-checks";

export async function GET(request: NextRequest, { params }: { params: { checkId: string } }) {
  try {
    if (!(await hasCheckAccess(request, params.checkId))) return apiError(403, "FORBIDDEN", "This Price Check is not available in this session.");
    const check = await getPublicCheck(params.checkId);
    return check ? apiSuccess(check) : apiError(404, "NOT_FOUND", "Price Check not found.");
  } catch (error) {
    return apiException(error);
  }
}
