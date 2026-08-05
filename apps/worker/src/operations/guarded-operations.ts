import { randomUUID } from "node:crypto";

import { hashPersonalIdentifier, type Prisma, type PrismaClient } from "@tymra/db";

const collectionTypes = ["PUBLIC_DATA_COLLECTION", "EVENT_COLLECTION", "WEATHER_COLLECTION", "TRANSPORT_COLLECTION"] as const;

export async function executeReleaseRollback(database: PrismaClient, secret: string) {
  return database.$transaction((transaction) => executeReleaseRollbackTransaction(transaction, secret));
}

export async function executeReleaseRollbackTransaction(transaction: Prisma.TransactionClient, secret: string) {
    const schedules = await transaction.scheduleDefinition.updateMany({ where: { enabled: true }, data: { enabled: false } });
    const jobs = await transaction.job.updateMany({
      where: { type: { in: [...collectionTypes] }, status: "PENDING" },
      data: { status: "CANCELLED", completedAt: new Date(), lastErrorCode: "RELEASE_ROLLBACK", lastErrorMessage: "Cancelled by guarded release rollback" },
    });
    await transaction.auditEvent.create({ data: {
      eventType: "release_collection_rollback",
      entityType: "CollectionRuntime",
      entityId: "global",
      payload: { schedulesDisabled: schedules.count, pendingJobsCancelled: jobs.count },
      eventHash: hashPersonalIdentifier(`release-rollback:${randomUUID()}`, secret),
    } });
    return { schedulesDisabled: schedules.count, pendingJobsCancelled: jobs.count };
}

export type QueueHistoryAction = "retry" | "archive" | "ignore";

export async function executeQueueHistoryAction(database: PrismaClient, secret: string, input: {
  jobId: string;
  action: QueueHistoryAction;
  reason: string;
}) {
  const job = await database.job.findUniqueOrThrow({ where: { id: input.jobId } });
  return database.$transaction((transaction) => executeQueueHistoryActionTransaction(transaction, secret, job, input));
}

export async function executeQueueHistoryActionTransaction(transaction: Prisma.TransactionClient, secret: string, job: {
  id: string;
  status: string;
}, input: {
  jobId: string;
  action: QueueHistoryAction;
  reason: string;
}) {
  if (!["FAILED", "DEAD_LETTER"].includes(job.status)) throw new Error("Only failed or dead-letter jobs can be changed");
  if (input.reason.trim().length < 8) throw new Error("A reason of at least 8 characters is required");
  const retry = input.action === "retry";
    const updated = await transaction.job.update({ where: { id: job.id }, data: retry ? {
      status: "PENDING", runAt: new Date(), completedAt: null, lockedAt: null, lockedBy: null, leaseExpiresAt: null,
      lastErrorCode: null, lastErrorMessage: null,
    } : {
      status: "CANCELLED", completedAt: new Date(), lockedAt: null, lockedBy: null, leaseExpiresAt: null,
      lastErrorCode: input.action === "archive" ? "HISTORY_ARCHIVED" : "HISTORY_IGNORED",
      lastErrorMessage: input.reason.trim(),
    } });
    await transaction.auditEvent.create({ data: {
      eventType: `queue_history_${input.action}`,
      entityType: "Job",
      entityId: job.id,
      payload: { previousStatus: job.status, action: input.action, reason: input.reason.trim() },
      eventHash: hashPersonalIdentifier(`queue-history:${job.id}:${input.action}:${randomUUID()}`, secret),
    } });
    return { jobId: updated.id, previousStatus: job.status, status: updated.status, action: input.action };
}
