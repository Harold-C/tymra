import { prisma } from "@tymra/db";
import type { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { getAdminFromRequest } from "@/lib/server/admin-auth";

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminFromRequest(request))) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    const items = await prisma.priceCheck.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, rawInput: true, locale: true, marketKey: true, status: true, propertyId: true, unitId: true, createdAt: true, updatedAt: true, isDemo: true } });
    return apiSuccess(items);
  } catch (error) { return apiException(error); }
}
