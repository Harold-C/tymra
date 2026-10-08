import { NextRequest } from "next/server";
import { z } from "zod";
import { BackfillError, createHistoricalBackfill, previewHistoricalImport } from "@tymra/db";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
const schema = z.object({ action: z.enum(["PREVIEW", "IMPORT"]), input: z.unknown() }).strict();
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin || !isSameOrigin(request)) return apiError(403, "FORBIDDEN", "Administrator access and same origin required.");
    const { action, input } = schema.parse(await request.json());
    if (action === "IMPORT") return apiSuccess(await createHistoricalBackfill(input, admin.id));
    const preview = await previewHistoricalImport(input);
    return apiSuccess({ totalRows: preview.rows.length, validRows: preview.validRows, errors: preview.errors, checksum: preview.checksum, sourceName: preview.source.name, sourceFreshnessUnchanged: true });
  } catch(error) { if (error instanceof BackfillError) return apiError(error.statusCode, error.code, error.message); return apiException(error); }
}
