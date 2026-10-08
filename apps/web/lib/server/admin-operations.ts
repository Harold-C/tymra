import { prisma, type Prisma } from "@tymra/db";
import { allowedServiceExceptionActions, serviceExceptionActionSchema, verifyRequestRecovery } from "@tymra/domain";
import { z } from "zod";

import { lockServiceRequest, retryRequestJob, ServiceRecoveryError, writeServiceAudit } from "./service-recovery";

export const serviceExceptionInputSchema = z.object({
  action: serviceExceptionActionSchema,
  reason: z.string().trim().min(3).max(1_000),
  payload: z.object({}).strict().default({}),
});

export async function runExceptionAction(exceptionId: string, adminId: string, inputValue: unknown) {
  const input = serviceExceptionInputSchema.parse(inputValue);
  return prisma.$transaction(async (transaction) => {
    const initial = await transaction.exceptionCase.findUnique({ where: { id: exceptionId }, select: { priceCheckId: true } });
    if (!initial) throw new ServiceRecoveryError("EXCEPTION_NOT_FOUND", 404);
    await lockServiceRequest(transaction, initial.priceCheckId);
    await transaction.$queryRaw`SELECT id FROM "ExceptionCase" WHERE id = ${exceptionId} FOR UPDATE`;
    const exception = await transaction.exceptionCase.findUniqueOrThrow({
      where: { id: exceptionId },
      include: { priceCheck: { include: { resultVersions: { where: { status: "PUBLISHED" } } } } },
    });
    const check = exception.priceCheck;
    const allowed = allowedServiceExceptionActions({
      ...exception, customerUserId: check.customerUserId, checkStatus: check.status,
      hasPublishedResult: check.resultVersions.length > 0,
    });
    if (!allowed.includes(input.action)) throw new ServiceRecoveryError("SERVICE_ACTION_FORBIDDEN", 403);
    let status: "IN_PROGRESS" | "RESOLVED" | "DISMISSED" = "IN_PROGRESS";
    let proof: Prisma.InputJsonObject = {};

    if (input.action === "RECOLLECT" || input.action === "REANALYSE") {
      const types = input.action === "RECOLLECT" ? ["RATE_COLLECTION" as const] : ["ANALYSIS" as const, "PRICE_ANALYSIS" as const];
      const original = await transaction.job.findFirst({ where: { priceCheckId: check.id, type: { in: types }, status: { in: ["SUCCEEDED", "FAILED", "DEAD_LETTER"] } }, orderBy: { createdAt: "desc" } });
      if (!original) throw new ServiceRecoveryError("ORIGINAL_RECOVERY_JOB_NOT_FOUND");
      const previous = await transaction.actionRecord.findFirst({ where: {
        priceCheckId: check.id, action: input.action,
        payload: { path: ["exceptionId"], equals: exception.id },
      }, orderBy: { createdAt: "desc" } });
      const previousJobId = jsonObject(previous?.payload).recoveryJobId;
      if (typeof previousJobId === "string") {
        const previousJob = await transaction.job.findUnique({ where: { id: previousJobId } });
        if (previousJob && ["PENDING", "RUNNING", "SUCCEEDED"].includes(previousJob.status)) return exception;
      }
      const retry = await retryRequestJob(transaction, original, adminId, input.reason, `service-exception:${exception.id}:${input.action}:${original.id}`, true);
      proof = { originalJobId: original.id, recoveryJobId: retry.id, originalInputPreserved: true };
    } else if (input.action === "REQUEST_USER_CONFIRMATION") {
      const active = await transaction.job.count({ where: { priceCheckId: check.id, type: { notIn: ["EMAIL_DELIVERY", "RESULT_NOTIFICATION"] }, status: { in: ["PENDING", "RUNNING"] } } });
      if (active) throw new ServiceRecoveryError("REQUEST_ALREADY_ACTIVE");
      await transaction.priceCheck.update({ where: { id: check.id }, data: { status: "NEEDS_CONFIRMATION" } });
      const delivery = await transaction.emailDelivery.upsert({
        where: { idempotencyKey: `service-confirmation:${exception.id}` },
        create: { priceCheckId: check.id, type: "CONFIRMATION_REQUIRED", locale: check.locale, recipientHash: check.emailHash, encryptedRecipient: check.encryptedEmail, provider: "pending", idempotencyKey: `service-confirmation:${exception.id}` }, update: {},
      });
      await transaction.job.upsert({ where: { idempotencyKey: `service-confirmation-job:${exception.id}` },
        create: { type: "EMAIL_DELIVERY", queueName: "email-delivery", payload: { deliveryId: delivery.id }, priceCheckId: check.id, idempotencyKey: `service-confirmation-job:${exception.id}` }, update: {},
      });
      proof = { waitingFor: "CUSTOMER", customerUserId: check.customerUserId, deliveryId: delivery.id };
    } else if (input.action === "WITHDRAW_RESULT") {
      const resultIds = check.resultVersions.map((result) => result.id);
      await transaction.resultVersion.updateMany({ where: { id: { in: resultIds }, status: "PUBLISHED" }, data: { status: "WITHDRAWN" } });
      const cancelled = await transaction.emailDelivery.findMany({ where: { resultVersionId: { in: resultIds }, status: { in: ["PENDING", "FAILED"] } }, select: { id: true } });
      await transaction.emailDelivery.updateMany({ where: { id: { in: cancelled.map((item) => item.id) } }, data: { status: "CANCELLED" } });
      await transaction.job.updateMany({ where: { priceCheckId: check.id, type: { in: ["EMAIL_DELIVERY", "RESULT_NOTIFICATION"] }, status: "PENDING" }, data: { status: "CANCELLED", completedAt: new Date(), lastErrorCode: "RESULT_WITHDRAWN" } });
      await transaction.priceCheck.update({ where: { id: check.id }, data: { status: "WITHDRAWN" } });
      proof = { withdrawnResultIds: resultIds, cancelledDeliveryIds: cancelled.map((item) => item.id) };
    } else if (input.action === "VERIFY_RECOVERY") {
      const recovery = await transaction.actionRecord.findFirst({ where: {
        priceCheckId: check.id, action: { in: ["RECOLLECT", "REANALYSE", "REQUEST_USER_CONFIRMATION"] },
        payload: { path: ["exceptionId"], equals: exception.id },
      }, orderBy: { createdAt: "desc" } });
      if (!recovery) throw new ServiceRecoveryError("RECOVERY_EVIDENCE_REQUIRED");
      const recoveryJobId = jsonObject(recovery.payload).recoveryJobId;
      const recoveryJob = typeof recoveryJobId === "string"
        ? await transaction.job.findUnique({ where: { id: recoveryJobId } })
        : await transaction.job.findFirst({ where: { priceCheckId: check.id, status: "SUCCEEDED", type: { notIn: ["EMAIL_DELIVERY", "RESULT_NOTIFICATION"] }, createdAt: { gte: recovery.createdAt } }, orderBy: { createdAt: "desc" } });
      const [activePipelineJobs, blockingExceptions, result] = await Promise.all([
        transaction.job.count({ where: { priceCheckId: check.id, type: { notIn: ["EMAIL_DELIVERY", "RESULT_NOTIFICATION"] }, status: { in: ["PENDING", "RUNNING"] } } }),
        transaction.exceptionCase.count({ where: { priceCheckId: check.id, id: { not: exception.id }, status: { in: ["OPEN", "IN_PROGRESS"] }, OR: [{ blockingUser: true }, { priority: { in: ["P0", "P1"] } }] } }),
        transaction.resultVersion.findFirst({ where: { priceCheckId: check.id, status: "PUBLISHED" }, orderBy: { version: "desc" } }),
      ]);
      const verification = verifyRequestRecovery({ requestedAt: recovery.createdAt, recoveryJobStatus: recoveryJob?.status ?? null, activePipelineJobs, blockingExceptions, checkStatus: check.status, result });
      if (!verification.verified) throw new ServiceRecoveryError(verification.reason);
      status = "RESOLVED";
      proof = { verification: verification.reason, recoveryActionId: recovery.id, recoveryJobId: recoveryJob!.id, resultVersionId: result!.id, verifiedAt: new Date().toISOString() };
    } else if (input.action === "DISMISS") {
      status = "DISMISSED";
      proof = { healthUnchanged: true, historicalEvidenceRetained: true };
    }

    const record = await transaction.actionRecord.create({ data: {
      priceCheckId: check.id, actorType: "ADMIN", actorId: adminId, action: input.action,
      payload: { exceptionId: exception.id, reason: input.reason, ...proof },
    } });
    await writeServiceAudit(transaction, adminId, "service_exception_action", "ExceptionCase", exception.id, {
      action: input.action, reason: input.reason, priceCheckId: check.id, actionRecordId: record.id,
      before: { status: exception.status }, after: { status }, ...proof,
    }, exception.isDemo);
    return transaction.exceptionCase.update({ where: { id: exception.id }, data: {
      status, resolutionAction: input.action, resolutionReason: input.reason,
      resolvedAt: status === "IN_PROGRESS" ? null : new Date(),
    } });
  });
}

function jsonObject(value: Prisma.JsonValue | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}
