import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { hasCheckAccess } from "@/lib/server/check-access";
import { confirmListing } from "@/lib/server/price-checks";

const schema = z.object({ listingUrl: z.string().trim().url().max(2_000) });

export async function POST(request: NextRequest, { params }: { params: { checkId: string } }) {
  try {
    if (!(await hasCheckAccess(request, params.checkId))) return apiError(403, "FORBIDDEN", "This Price Check is not available in this session.");
    return apiSuccess(await confirmListing(params.checkId, schema.parse(await request.json()).listingUrl));
  } catch (error) {
    return apiException(error);
  }
}
