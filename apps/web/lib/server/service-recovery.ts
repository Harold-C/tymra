import { randomUUID } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import { hashPersonalIdentifier, prisma, type Job, type Prisma } from "@tymra/db";

type Transaction = Prisma.TransactionClient;
const requestJobTypes = new Set(["INPUT_RESOLUTION", "LISTING_RESOLUTION", "PROPERTY_IDENTIFICATION", "UNIT_IDENTIFICATION", "RATE_COLLECTION", "AVAILABILITY_COLLECTION", "POLICY_COLLECTION", "RATE_NORMALIZATION", "COMPETITOR_BUILD", "SNAPSHOT_GENERATION", "PRICE_ANALYSIS", "ANALYSIS", "AUTO_VALIDATION", "RESULT_GENERATION", "RESULT_PUBLICATION"]);

export class ServiceRecoveryError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 409) { super(code); }
}

export async function writeServiceAudit(transaction: Transaction, adminId: string, eventType: string, entityType: string, entityId: string, payload: Prisma.InputJsonObject, isDemo = false) {
  return transaction.auditEvent.create({ data: {
    actorAdminId: adminId, eventType, entityType, entityId, payload, isDemo,
    eventHash: hashPersonalIdentifier(`${eventType}:${entityId}:${randomUUID()}`, getEnvironment().ACCESS_KEY_SECRET),
  } });
}

/** Locks the request before its job; all recovery paths use the same order. */
export async function lockServiceRequest(transaction: Transaction, priceCheckId: string) {
  await transaction.$queryRaw`SELECT id FROM "PriceCheck" WHERE id = ${priceCheckId} FOR UPDATE`;
}

export async function retryRequestJob(transaction: Transaction, original: Job, adminId: string, reason: string, idempotencyKey = `service-retry:${original.id}`, allowReprocess = false) {
  if (!original.priceCheckId || !requestJobTypes.has(original.type)) throw new ServiceRecoveryError("REQUEST_JOB_NOT_RECOVERABLE");
  await lockServiceRequest(transaction, original.priceCheckId);
  const request = await transaction.priceCheck.findUniqueOrThrow({ where: { id: original.priceCheckId } });
  if (request.customerUserId && !(await transaction.customerUser.findFirst({ where: { id: request.customerUserId, status: "ACTIVE" } }))) throw new ServiceRecoveryError("CUSTOMER_NOT_SERVICEABLE");
  if (["CANCELLED", "EXPIRED", "ARCHIVED"].includes(request.status)) throw new ServiceRecoveryError("REQUEST_NOT_RECOVERABLE");
  const previousRetry = await transaction.job.findUnique({ where: { idempotencyKey } });
  if (previousRetry) return previousRetry;
  const current = await transaction.job.findUniqueOrThrow({ where: { id: original.id } });
  if (!["FAILED", "DEAD_LETTER", ...(allowReprocess ? ["SUCCEEDED"] : [])].includes(current.status)) throw new ServiceRecoveryError("JOB_NOT_RECOVERABLE");
  const active = await transaction.job.count({ where: { priceCheckId: current.priceCheckId, type: { in: [...requestJobTypes] as Job["type"][] }, status: { in: ["PENDING", "RUNNING"] } } });
  if (active) throw new ServiceRecoveryError("REQUEST_ALREADY_ACTIVE");
  const retry = await transaction.job.create({ data: {
    type: current.type, payload: current.payload as Prisma.InputJsonValue, idempotencyKey,
    priceCheckId: current.priceCheckId, analysisRequestId: current.analysisRequestId,
    queueName: current.queueName, correlationId: `service-recovery:${current.id}`,
    sourceId: current.sourceId, listingId: current.listingId, sellableUnitId: current.sellableUnitId,
    querySignatureHash: current.querySignatureHash, snapshotId: current.snapshotId, resultVersionId: current.resultVersionId,
    priority: current.priority, maxAttempts: current.maxAttempts,
  } });
  const status = ["ANALYSIS", "PRICE_ANALYSIS", "AUTO_VALIDATION"].includes(current.type) ? "ANALYSING" : "QUEUED";
  const check = await transaction.priceCheck.update({ where: { id: current.priceCheckId! }, data: { status } });
  await writeServiceAudit(transaction, adminId, "service_job_recovery_requested", "Job", retry.id, {
    reason, originalJobId: current.id, recoveryJobId: retry.id, priceCheckId: check.id,
    customerUserId: check.customerUserId, originalInputPreserved: true, originalQueryId: check.stayQueryId,
    before: { status: current.status }, after: { status: retry.status },
  }, check.isDemo);
  return retry;
}

export async function recoverServiceJob(jobId: string, adminId: string, reason: string) {
  if (reason.trim().length < 3 || reason.length > 1_000) throw new ServiceRecoveryError("REASON_REQUIRED", 422);
  return prisma.$transaction(async (transaction) => {
    const original = await transaction.job.findUnique({ where: { id: jobId } });
    if (!original) throw new ServiceRecoveryError("JOB_NOT_FOUND", 404);
    return retryRequestJob(transaction, original, adminId, reason.trim());
  });
}

export async function cancelPendingServiceJob(jobId: string, adminId: string, reason: string) {
  if (reason.trim().length < 3 || reason.length > 1_000) throw new ServiceRecoveryError("REASON_REQUIRED", 422);
  return prisma.$transaction(async transaction => {
    const original = await transaction.job.findUnique({ where: { id: jobId } });
    if (!original) throw new ServiceRecoveryError("JOB_NOT_FOUND", 404);
    if (!original.priceCheckId && !original.sourceId) throw new ServiceRecoveryError("JOB_NOT_CANCELLABLE");
    if (await transaction.serviceBackfill.count({ where: { jobId } })) throw new ServiceRecoveryError("USE_BACKFILL_CANCELLATION");
    if (original.priceCheckId) {
      await lockServiceRequest(transaction, original.priceCheckId);
      const request = await transaction.priceCheck.findUniqueOrThrow({ where: { id: original.priceCheckId } });
      const jobs = await transaction.job.findMany({ where: { priceCheckId: request.id }, select: { id: true }, orderBy: { id: "asc" } });
      for (const job of jobs) await transaction.$queryRaw`SELECT id FROM "Job" WHERE id = ${job.id} FOR UPDATE`;
      const replay = await transaction.auditEvent.findFirst({ where: { eventType: "service_pending_work_cancelled", entityType: "Job", entityId: jobId } });
      if (replay) return { jobId, status: "CANCELLED", scope: "REQUEST", auditEventId: replay.id };
      const current = await transaction.job.findUniqueOrThrow({ where: { id: jobId } });
      if (current.status !== "PENDING" || !requestJobTypes.has(current.type) || ["PUBLISHED", "CANCELLED", "EXPIRED", "ARCHIVED"].includes(request.status)) throw new ServiceRecoveryError("JOB_NOT_CANCELLABLE");
      const deliveries = await transaction.emailDelivery.findMany({ where: { priceCheckId: request.id }, select: { id: true }, orderBy: { id: "asc" } });
      for (const delivery of deliveries) await transaction.$queryRaw`SELECT id FROM "EmailDelivery" WHERE id = ${delivery.id} FOR UPDATE`;
      if (await transaction.job.count({ where: { priceCheckId: request.id, status: "RUNNING" } }) || await transaction.emailDelivery.count({ where: { priceCheckId: request.id, status: "SENDING" } })) throw new ServiceRecoveryError("REQUEST_ALREADY_ACTIVE");
      if (await transaction.resultVersion.count({ where: { priceCheckId: request.id, status: "PUBLISHED" } })) throw new ServiceRecoveryError("RESULT_ALREADY_PUBLISHED");
      const now = new Date();
      const cancelled = await transaction.job.updateMany({ where: { priceCheckId: request.id, status: "PENDING" }, data: { status: "CANCELLED", completedAt: now, lastErrorCode: "ADMIN_CANCELLED_PENDING_WORK" } });
      await transaction.emailDelivery.updateMany({ where: { priceCheckId: request.id, status: "PENDING" }, data: { status: "CANCELLED" } });
      await transaction.priceCheck.update({ where: { id: request.id }, data: { status: "CANCELLED" } });
      const audit = await writeServiceAudit(transaction, adminId, "service_pending_work_cancelled", "Job", jobId, { reason: reason.trim(), scope: "REQUEST", priceCheckId: request.id, customerUserId: request.customerUserId, cancelledJobs: cancelled.count, originalInputPreserved: true, usageHistoryPreserved: true }, request.isDemo);
      return { jobId, status: "CANCELLED", scope: "REQUEST", cancelledJobs: cancelled.count, auditEventId: audit.id };
    }
    await transaction.$queryRaw`SELECT id FROM "Job" WHERE id = ${jobId} FOR UPDATE`;
    const replay = await transaction.auditEvent.findFirst({ where: { eventType: "service_pending_work_cancelled", entityType: "Job", entityId: jobId } });
    if (replay) return { jobId, status: "CANCELLED", scope: "TASK", auditEventId: replay.id };
    const current = await transaction.job.findUniqueOrThrow({ where: { id: jobId } });
    if (current.status !== "PENDING") throw new ServiceRecoveryError("JOB_NOT_CANCELLABLE");
    await transaction.job.update({ where: { id: jobId }, data: { status: "CANCELLED", completedAt: new Date(), lastErrorCode: "ADMIN_CANCELLED_PENDING_WORK" } });
    const audit = await writeServiceAudit(transaction, adminId, "service_pending_work_cancelled", "Job", jobId, { reason: reason.trim(), scope: "TASK", sourceId: current.sourceId, schedulesPreserved: true, budgetsPreserved: true });
    return { jobId, status: "CANCELLED", scope: "TASK", cancelledJobs: 1, auditEventId: audit.id };
  });
}

export async function recoverEmailDelivery(deliveryId: string, adminId: string, reason: string) {
  if (reason.trim().length < 3 || reason.length > 1_000) throw new ServiceRecoveryError("REASON_REQUIRED", 422);
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "EmailDelivery" WHERE id = ${deliveryId} FOR UPDATE`;
    const delivery = await transaction.emailDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new ServiceRecoveryError("DELIVERY_NOT_FOUND", 404);
    if (delivery.status === "SENT" || delivery.status === "CANCELLED") throw new ServiceRecoveryError("DELIVERY_NOT_RECOVERABLE");
    const key = `service-email-retry:${delivery.id}:${delivery.attemptCount}`;
    const existing = await transaction.job.findUnique({ where: { idempotencyKey: key } });
    if (existing) return existing;
    if (delivery.status !== "FAILED") throw new ServiceRecoveryError("DELIVERY_ALREADY_ACTIVE");
    if (delivery.resultVersionId) {
      const result = await transaction.resultVersion.findUnique({ where: { id: delivery.resultVersionId } });
      if (!result || result.status !== "PUBLISHED") throw new ServiceRecoveryError("RESULT_NOT_DELIVERABLE");
    }
    const job = await transaction.job.create({ data: {
      type: "EMAIL_DELIVERY", queueName: "email-delivery", payload: { deliveryId }, idempotencyKey: key,
      priceCheckId: delivery.priceCheckId, analysisRequestId: delivery.analysisRequestId,
      resultVersionId: delivery.resultVersionId, correlationId: `service-email-recovery:${delivery.id}`,
    } });
    await transaction.emailDelivery.update({ where: { id: delivery.id }, data: { status: "PENDING", lastError: null } });
    await writeServiceAudit(transaction, adminId, "service_notification_recovery_requested", "EmailDelivery", delivery.id, {
      reason: reason.trim(), priceCheckId: delivery.priceCheckId, recoveryJobId: job.id,
      before: { status: delivery.status, attemptCount: delivery.attemptCount }, after: { status: "PENDING" },
    });
    return job;
  });
}
