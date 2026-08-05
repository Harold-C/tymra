import { randomUUID } from "node:crypto";

import { prisma } from "@tymra/db";
import { describe, expect, it } from "vitest";

import { executeQueueHistoryActionTransaction, executeReleaseRollbackTransaction } from "../src/operations/guarded-operations";

describe("isolated release rollback rehearsal", () => {
  it("disables schedules, cancels pending collection work and audits inside a rolled-back transaction", async () => {
    const token = randomUUID();
    await expect(prisma.$transaction(async (transaction) => {
      const schedule = await transaction.scheduleDefinition.create({ data: { key: `rollback-rehearsal-${token}`, jobType: "EVENT_COLLECTION", queueName: "rehearsal", cronExpression: "0 0 * * *", enabled: true } });
      const job = await transaction.job.create({ data: { type: "EVENT_COLLECTION", payload: {}, idempotencyKey: `rollback-rehearsal-${token}` } });
      const result = await executeReleaseRollbackTransaction(transaction, "s".repeat(32));
      expect(result.schedulesDisabled).toBeGreaterThanOrEqual(1);
      expect(result.pendingJobsCancelled).toBeGreaterThanOrEqual(1);
      expect(await transaction.scheduleDefinition.findUniqueOrThrow({ where: { id: schedule.id } })).toMatchObject({ enabled: false });
      expect(await transaction.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "CANCELLED", lastErrorCode: "RELEASE_ROLLBACK" });
      expect(await transaction.auditEvent.count({ where: { eventType: "release_collection_rollback" } })).toBeGreaterThanOrEqual(1);
      throw new Error("ROLLBACK_REHEARSAL_COMPLETE");
    })).rejects.toThrow("ROLLBACK_REHEARSAL_COMPLETE");
    expect(await prisma.scheduleDefinition.count({ where: { key: `rollback-rehearsal-${token}` } })).toBe(0);
    expect(await prisma.job.count({ where: { idempotencyKey: `rollback-rehearsal-${token}` } })).toBe(0);
  });

  it("retries or archives queue history only with a reason and immutable audit", async () => {
    const token = randomUUID();
    await expect(prisma.$transaction(async (transaction) => {
      const job = await transaction.job.create({ data: { type: "EVENT_COLLECTION", status: "FAILED", payload: {}, idempotencyKey: `queue-rehearsal-${token}`, completedAt: new Date(), lastErrorCode: "NETWORK_TIMEOUT" } });
      const result = await executeQueueHistoryActionTransaction(transaction, "s".repeat(32), job, { jobId: job.id, action: "retry", reason: "Dependency recovered" });
      expect(result).toMatchObject({ previousStatus: "FAILED", status: "PENDING", action: "retry" });
      expect(await transaction.auditEvent.count({ where: { entityType: "Job", entityId: job.id, eventType: "queue_history_retry" } })).toBe(1);
      throw new Error("QUEUE_REHEARSAL_COMPLETE");
    })).rejects.toThrow("QUEUE_REHEARSAL_COMPLETE");
    expect(await prisma.job.count({ where: { idempotencyKey: `queue-rehearsal-${token}` } })).toBe(0);
  });
});
