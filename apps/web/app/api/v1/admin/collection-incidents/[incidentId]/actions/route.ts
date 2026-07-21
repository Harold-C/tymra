import type { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { CollectionControlError } from "@/lib/server/collection-control";
import { CollectionIncidentActionError, runCollectionIncidentAction } from "@/lib/server/collection-incident-actions";

const incidentMessages: Record<string, [number, string]> = {
  INCIDENT_NOT_FOUND: [404, "The collection incident was not found."],
  INCIDENT_CLOSED: [409, "This collection incident is already closed."],
  RETRY_ALREADY_QUEUED: [409, "This incident already has a retry job."],
  RETRY_WORKFLOW_NOT_FOUND: [409, "No safe collection workflow matches this run."],
  RETRY_ENQUEUE_FAILED: [409, "The retry job could not be created."],
};

const controlMessages: Record<string, [number, string]> = {
  SOURCE_PAUSED: [409, "Resume the source before retrying collection."],
  SOURCE_GOVERNANCE_BLOCKED: [409, "The source is not approved for this environment and collection mode."],
  COLLECTION_ALREADY_ACTIVE: [409, "This collection workflow already has a pending or running job."],
  COLLECTION_COOLDOWN: [429, "This workflow is still in its manual cooldown period."],
};

export async function POST(request: NextRequest, { params }: { params: { incidentId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const result = await runCollectionIncidentAction(params.incidentId, admin.id, await request.json());
    return apiSuccess({ incidentId: result.id, status: result.status, resolutionAction: result.resolutionAction, retryJobId: result.retryJobId });
  } catch (error) {
    if (error instanceof CollectionIncidentActionError) {
      const [status, message] = incidentMessages[error.code] ?? [409, "The incident action was rejected."];
      return apiError(status, error.code, message);
    }
    if (error instanceof CollectionControlError) {
      const [status, message] = controlMessages[error.code] ?? [409, "The collection control action was rejected."];
      return apiError(status, error.code, message);
    }
    return apiException(error);
  }
}
