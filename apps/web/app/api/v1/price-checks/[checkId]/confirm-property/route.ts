import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { hasCheckAccess } from "@/lib/server/check-access";
import { confirmProperty } from "@/lib/server/price-checks";

const schema = z.union([
  z.object({ propertyId: z.string().min(1), addressExternalId: z.never().optional() }),
  z.object({ addressExternalId: z.string().min(1), propertyId: z.never().optional() }),
]);

export async function POST(request: NextRequest, { params }: { params: { checkId: string } }) {
  try {
    if (!(await hasCheckAccess(request, params.checkId))) return apiError(403, "FORBIDDEN", "This Price Check is not available in this session.");
    const input = schema.parse(await request.json());
    const result = await confirmProperty(params.checkId, input);
    return apiSuccess({ checkId: result.check.id, status: result.check.status, requiresListingConfirmation: result.requiresListingConfirmation, requiresUnitConfirmation: result.requiresUnitConfirmation });
  } catch (error) {
    return apiException(error);
  }
}
