import type { Job, JobStatus, JobType, Prisma } from "@prisma/client";

import { prisma } from "./index";

export type EnqueueJobInput = {
  type: JobType;
  payload: Prisma.InputJsonValue;
  idempotencyKey: string;
  priceCheckId?: string;
  analysisRequestId?: string;
  queueName?: string;
  correlationId?: string;
  collectionRunId?: string;
  sourceId?: string;
  listingId?: string;
  sellableUnitId?: string;
  querySignatureHash?: string;
  snapshotId?: string;
  resultVersionId?: string;
  priority?: number;
  maxAttempts?: number;
  runAt?: Date;
};

export async function enqueueJob(input: EnqueueJobInput): Promise<Job> {
  return prisma.job.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      type: input.type,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      priceCheckId: input.priceCheckId,
      analysisRequestId: input.analysisRequestId,
      queueName: input.queueName ?? queueNameForJobType(input.type),
      correlationId: input.correlationId,
      collectionRunId: input.collectionRunId,
      sourceId: input.sourceId,
      listingId: input.listingId,
      sellableUnitId: input.sellableUnitId,
      querySignatureHash: input.querySignatureHash,
      snapshotId: input.snapshotId,
      resultVersionId: input.resultVersionId,
      priority: input.priority ?? 100,
      maxAttempts: input.maxAttempts ?? 3,
      runAt: input.runAt ?? new Date(),
    },
    update: {},
  });
}

export async function recoverExpiredJobs(now: Date = new Date()): Promise<number> {
  const result = await prisma.job.updateMany({
    where: {
      status: "RUNNING",
      leaseExpiresAt: { lt: now },
    },
    data: {
      status: "PENDING",
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      runAt: now,
      lastErrorCode: "LEASE_EXPIRED",
      lastErrorMessage: "Worker lease expired before completion",
    },
  });
  return result.count;
}

export async function claimNextJob(workerId: string, leaseSeconds: number, now: Date = new Date(), queueNames?: readonly string[]): Promise<Job | null> {
  const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1_000);
  const allowedQueues = queueNames?.length ? [...queueNames] : null;
  const rows = await prisma.$queryRaw<Job[]>`
    WITH candidate AS (
      SELECT id
      FROM "Job"
      WHERE status = 'PENDING'::"JobStatus"
        AND "runAt" <= ${now}
        AND (${allowedQueues}::text[] IS NULL OR "queueName" = ANY(${allowedQueues}::text[]))
      ORDER BY priority ASC, "runAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "Job" AS job
    SET status = 'RUNNING'::"JobStatus",
        "lockedAt" = ${now},
        "lockedBy" = ${workerId},
        "leaseExpiresAt" = ${leaseExpiresAt},
        "attemptCount" = job."attemptCount" + 1,
        "updatedAt" = ${now}
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.*
  `;
  return rows[0] ?? null;
}

export async function markJobSucceeded(jobId: string, workerId: string, now: Date = new Date()): Promise<Job> {
  return updateClaimedJob(jobId, workerId, {
    status: "SUCCEEDED",
    completedAt: now,
    lockedAt: null,
    lockedBy: null,
    leaseExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

export async function renewJobLease(jobId: string, workerId: string, leaseSeconds: number, now: Date = new Date()): Promise<void> {
  const result = await prisma.job.updateMany({
    where: { id: jobId, status: "RUNNING", lockedBy: workerId },
    data: { leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1_000) },
  });
  if (result.count !== 1) throw new Error(`Job ${jobId} is no longer held by worker ${workerId}`);
}

const retryMinutes = [1, 5, 30] as const;

export async function markJobFailed(
  job: Pick<Job, "id" | "attemptCount" | "maxAttempts">,
  workerId: string,
  errorCode: string,
  errorMessage: string,
  retryable: boolean,
  now: Date = new Date(),
): Promise<Job> {
  const shouldRetry = retryable && job.attemptCount < job.maxAttempts;
  const delayMinutes = retryMinutes[Math.min(Math.max(job.attemptCount - 1, 0), retryMinutes.length - 1)];

  return updateClaimedJob(job.id, workerId, {
    status: shouldRetry ? "PENDING" : retryable ? "DEAD_LETTER" : "FAILED",
    runAt: shouldRetry ? new Date(now.getTime() + delayMinutes * 60_000) : now,
    completedAt: shouldRetry ? null : now,
    lockedAt: null,
    lockedBy: null,
    leaseExpiresAt: null,
    lastErrorCode: errorCode,
    lastErrorMessage: errorMessage.slice(0, 1_000),
  });
}

async function updateClaimedJob(jobId: string, workerId: string, data: Prisma.JobUpdateInput): Promise<Job> {
  const current = await prisma.job.findFirst({ where: { id: jobId, status: "RUNNING", lockedBy: workerId } });
  if (!current) throw new Error(`Job ${jobId} is not held by worker ${workerId}`);
  return prisma.job.update({ where: { id: jobId }, data });
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === "SUCCEEDED" || status === "FAILED" || status === "DEAD_LETTER" || status === "CANCELLED";
}

export function queueNameForJobType(type: JobType): string {
  switch (type) {
    case "INPUT_RESOLUTION": return "input-resolution";
    case "LISTING_RESOLUTION":
    case "PROPERTY_IDENTIFICATION":
    case "UNIT_IDENTIFICATION": return "listing-resolution";
    case "CATALOG_DISCOVERY": return "catalog-discovery";
    case "RATE_COLLECTION": return "rate-collection";
    case "AVAILABILITY_COLLECTION": return "availability-collection";
    case "POLICY_COLLECTION": return "policy-collection";
    case "PUBLIC_DATA_COLLECTION": return "public-data-collection";
    case "EVENT_COLLECTION": return "event-collection";
    case "WEATHER_COLLECTION": return "weather-collection";
    case "TRANSPORT_COLLECTION": return "transport-collection";
    case "RATE_NORMALIZATION": return "normalisation";
    case "COMPETITOR_BUILD": return "competitor-generation";
    case "SNAPSHOT_GENERATION": return "snapshot-generation";
    case "PRICE_ANALYSIS":
    case "ANALYSIS":
    case "AUTO_VALIDATION": return "price-analysis";
    case "RESULT_GENERATION":
    case "RESULT_PUBLICATION": return "result-publication";
    case "EMAIL_DELIVERY":
    case "RESULT_NOTIFICATION": return "email-delivery";
    case "SOURCE_HEALTH_CHECK": return "source-health";
    case "RETENTION_CLEANUP":
    case "LINK_EXPIRY": return "retention-cleanup";
    case "MARKET_COVERAGE_COLLECTION":
    case "ANCHOR_PANEL_COLLECTION":
    case "ROTATING_PANEL_COLLECTION": return "market-coverage";
  }
}
