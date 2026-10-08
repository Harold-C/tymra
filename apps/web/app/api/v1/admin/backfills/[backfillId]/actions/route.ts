import { NextRequest } from "next/server";
import { z } from "zod";
import { BackfillError, retryHistoricalBackfill, cancelHistoricalBackfill } from "@tymra/db";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
const schema = z.object({ action: z.enum(["RETRY", "CANCEL"]), reason: z.string().trim().min(3).max(1000) }).strict();
export async function POST(request: NextRequest, { params }: { params: { backfillId: string } }) {
  try {
    const admin = await getAdminFromRequest(request); if (!admin || !isSameOrigin(request)) return apiError(403, "FORBIDDEN", "Administrator access and same origin required.");
    const input = schema.parse(await request.json()); return apiSuccess(await (input.action === "CANCEL" ? cancelHistoricalBackfill : retryHistoricalBackfill)(params.backfillId, admin.id, input.reason));
  } catch(error) { if (error instanceof BackfillError) return apiError(error.statusCode, error.code, error.message); return apiException(error); }
}
