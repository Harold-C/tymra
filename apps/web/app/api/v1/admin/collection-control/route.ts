import type { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { CollectionControlError, runCollectionControlAction } from "@/lib/server/collection-control";

const messages: Record<string, [number, string]> = {
  WORKFLOW_NOT_FOUND: [404, "The collection workflow was not found."],
  WORKFLOW_HAS_NO_SOURCE: [409, "This workflow is not attached to a data source."],
  SOURCE_NOT_CONTROLLABLE: [404, "The source is not an eligible non-OTA collection source."],
  SOURCE_PAUSED: [409, "Resume the source before starting collection."],
  SOURCE_GOVERNANCE_BLOCKED: [409, "The source is not approved for this environment and collection mode."],
  COLLECTION_ALREADY_ACTIVE: [409, "This collection workflow already has a pending or running job."],
  COLLECTION_COOLDOWN: [429, "This workflow was run recently. Wait for its manual cooldown before trying again."],
  SCHEDULER_RUNTIME_DISABLED: [409, "The global scheduler is disabled by the runtime environment."],
  JOB_NOT_FOUND: [404, "The collection job was not found."],
  JOB_NOT_CANCELLABLE: [409, "Only pending collection jobs can be cancelled."],
};

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    return apiSuccess(await runCollectionControlAction(admin.id, await request.json()));
  } catch (error) {
    if (error instanceof CollectionControlError) {
      const [status, message] = messages[error.code] ?? [409, "The collection control action was rejected."];
      const retryAfter = error.detail.cooldownMinutes ? String(error.detail.cooldownMinutes * 60) : undefined;
      return apiError(status, error.code, message, retryAfter ? { headers: { "Retry-After": retryAfter } } : undefined);
    }
    return apiException(error);
  }
}
