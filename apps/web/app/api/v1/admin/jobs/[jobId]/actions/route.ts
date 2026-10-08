import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@tymra/db";

import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { cancelPendingServiceJob, recoverServiceJob, ServiceRecoveryError } from "@/lib/server/service-recovery";

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return apiError(403, "FORBIDDEN", "Administrator access is required.");
    if (!isSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const input = z.object({ action: z.enum(["RETRY", "CANCEL"]), reason: z.string().trim().min(3).max(1_000) }).strict().parse(await request.json());
    if (input.action === "CANCEL") return apiSuccess(await cancelPendingServiceJob(params.jobId, admin.id, input.reason));
    const job = await recoverServiceJob(params.jobId, admin.id, input.reason);
    const audit = await prisma.auditEvent.findFirst({ where: { entityType: "Job", entityId: job.id, eventType: "service_job_recovery_requested" }, select: { id: true } });
    return apiSuccess({ jobId: job.id, status: job.status, auditEventId: audit?.id });
  } catch (error) {
    if (error instanceof ServiceRecoveryError) return apiError(error.statusCode, error.code, "The task cannot be recovered in its current state.");
    return apiException(error);
  }
}
