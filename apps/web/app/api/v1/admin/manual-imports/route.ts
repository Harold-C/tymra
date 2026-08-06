import { z } from "zod";
import type { NextRequest } from "next/server";
import { RedisLockUnavailableError } from "@tymra/queue";

import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { importManualRates, previewImport } from "@/lib/server/manual-imports";

const requestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  format: z.enum(["csv", "json"]),
  content: z.string().min(1).max(2_000_000),
  mode: z.enum(["preview", "import"]),
  localAcceptance: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "INVALID_ORIGIN", "The request origin is not allowed.");

    const input = requestSchema.parse(await request.json());
    let preview;
    try {
      preview = previewImport(input);
    } catch (error) {
      if (error instanceof Error && error.message === "LOCAL_ACCEPTANCE_FILE_TOO_LARGE") throw error;
      return apiError(422, "IMPORT_PARSE_ERROR", `The ${input.format.toUpperCase()} file could not be parsed.`);
    }

    if (input.mode === "preview") {
      return apiSuccess({
        totalRows: preview.totalRows,
        validRowCount: preview.rows.length,
        errors: preview.errors,
        rows: preview.rows.slice(0, 100),
      });
    }

    const result = await importManualRates(input, admin.id, preview);
    return apiSuccess(result, { status: 201 });
  } catch (error) {
    if (error instanceof RedisLockUnavailableError) return apiError(409, "SOURCE_BUSY", "Another Manual Import operation is already running.");
    if (error instanceof Error) {
      if (error.message === "MANUAL_SOURCE_UNAVAILABLE") return apiError(409, "MANUAL_SOURCE_UNAVAILABLE", "The Manual Import Provider is not enabled and available.");
      if (error.message === "LOCAL_ACCEPTANCE_UNAVAILABLE") return apiError(409, "LOCAL_ACCEPTANCE_UNAVAILABLE", "Local acceptance requires development mode and a DEVELOPMENT-enabled source.");
      if (error.message === "LOCAL_ACCEPTANCE_FILE_TOO_LARGE") return apiError(413, "LOCAL_ACCEPTANCE_FILE_TOO_LARGE", "Local acceptance files are limited to 256 KB.");
    }
    return apiException(error);
  }
}
