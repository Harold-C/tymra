import { prisma } from "@tymra/db";
import type { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { getAdminFromRequest } from "@/lib/server/admin-auth";

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminFromRequest(request))) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    const items = await prisma.dataSource.findMany({ orderBy: { name: "asc" }, select: { id: true, key: true, name: true, providerType: true, status: true, healthStatus: true, enabled: true, rightsAllowStorage: true, rightsAllowDerivedAnalysis: true, rightsAllowDisplay: true, retentionDays: true, lastSuccessAt: true, errorRate: true, isDemo: true } });
    return apiSuccess(items);
  } catch (error) { return apiException(error); }
}
