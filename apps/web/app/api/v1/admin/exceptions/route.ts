import { prisma } from "@tymra/db";
import type { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { getAdminFromRequest } from "@/lib/server/admin-auth";

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminFromRequest(request))) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    const items = await prisma.exceptionCase.findMany({ orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "asc" }], take: 100, select: { id: true, priceCheckId: true, type: true, priority: true, status: true, recommendation: true, blockingUser: true, createdAt: true, isDemo: true } });
    return apiSuccess(items);
  } catch (error) { return apiException(error); }
}
