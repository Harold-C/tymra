import type { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { hasCheckAccess } from "@/lib/server/check-access";
import { confirmQuery } from "@/lib/server/price-checks";

export async function POST(request: NextRequest, { params }: { params: { checkId: string } }) {
  try {
    if (!(await hasCheckAccess(request, params.checkId))) return apiError(403, "FORBIDDEN", "This Price Check is not available in this session.");
    const check = await confirmQuery(params.checkId, await request.json());
    return apiSuccess({ checkId: check.id, status: check.status });
  } catch (error) {
    return apiException(error);
  }
}
