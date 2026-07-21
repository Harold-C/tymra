import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { hasCheckAccess } from "@/lib/server/check-access";
import { confirmUnit } from "@/lib/server/price-checks";

const schema = z.object({ unitId: z.string().min(1) });

export async function POST(request: NextRequest, { params }: { params: { checkId: string } }) {
  try {
    if (!(await hasCheckAccess(request, params.checkId))) return apiError(403, "FORBIDDEN", "This Price Check is not available in this session.");
    const input = schema.parse(await request.json());
    const check = await confirmUnit(params.checkId, input.unitId);
    return apiSuccess({ checkId: check.id, status: check.status });
  } catch (error) {
    return apiException(error);
  }
}
