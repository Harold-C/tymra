import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  claimNextJob,
  enqueueJob,
  markJobFailed,
  markJobSucceeded,
  prisma,
  recoverExpiredJobs,
} from "../src";

const prefix = `integration:${randomUUID()}`;

describe("persistent job queue", () => {
  beforeEach(async () => {
    await prisma.job.deleteMany({ where: { idempotencyKey: { startsWith: prefix } } });
  });

  afterAll(async () => {
    await prisma.job.deleteMany({ where: { idempotencyKey: { startsWith: prefix } } });
    await prisma.$disconnect();
  });

  it("enqueues idempotently and gives one worker an exclusive lease", async () => {
    const key = `${prefix}:exclusive`;
    const queueName = `${prefix}:exclusive-queue`;
    const claimAt = new Date("2099-01-01T00:00:01.000Z");
    const runAt = new Date("2099-01-01T00:00:00.000Z");
    const first = await enqueueJob({ type: "SOURCE_HEALTH_CHECK", payload: { source: "demo" }, idempotencyKey: key, queueName, runAt });
    const duplicate = await enqueueJob({ type: "SOURCE_HEALTH_CHECK", payload: { source: "demo" }, idempotencyKey: key, queueName, runAt });
    expect(duplicate.id).toBe(first.id);
    expect(await prisma.job.count({ where: { idempotencyKey: key } })).toBe(1);

    const claimed = await claimNextJob("worker-a", 30, claimAt, [queueName]);
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.attemptCount).toBe(1);
    expect(await claimNextJob("worker-b", 30, claimAt, [queueName])).toBeNull();

    const completed = await markJobSucceeded(first.id, "worker-a");
    expect(completed.status).toBe("SUCCEEDED");
  });

  it("recovers a job abandoned by a crashed worker and applies the documented retry schedule", async () => {
    const key = `${prefix}:retry`;
    const queueName = `${prefix}:retry-queue`;
    const oldNow = new Date("2026-01-01T00:00:00.000Z");
    const queued = await prisma.job.create({
      data: {
        type: "RATE_COLLECTION",
        status: "RUNNING",
        payload: {},
        idempotencyKey: key,
        queueName,
        runAt: oldNow,
        lockedAt: oldNow,
        lockedBy: "worker-a",
        leaseExpiresAt: new Date("2026-01-01T00:00:10.000Z"),
        attemptCount: 1,
      },
    });

    // A crashed worker leaves the row RUNNING. Recovery must only occur after
    // its durable lease expires, after which another worker can claim it.
    expect(await recoverExpiredJobs(new Date("2026-01-01T00:00:09.000Z"))).toBe(0);

    expect(await recoverExpiredJobs(new Date("2026-01-01T00:00:11.000Z"))).toBe(1);
    const reclaimed = await claimNextJob("worker-b", 30, new Date("2026-01-01T00:00:12.000Z"), [queueName]);
    expect(reclaimed?.id).toBe(queued.id);
    expect(reclaimed?.attemptCount).toBe(2);

    const failed = await markJobFailed(
      reclaimed!,
      "worker-b",
      "TIMEOUT",
      "Provider timed out",
      true,
      new Date("2026-01-01T00:00:12.000Z"),
    );
    expect(failed.status).toBe("PENDING");
    expect(failed.runAt.toISOString()).toBe("2026-01-01T00:05:12.000Z");
  });

  it("moves an exhausted retryable job to the dead-letter state", async () => {
    const key = `${prefix}:dead-letter`;
    const queueName = `${prefix}:dead-letter-queue`;
    const runAt = new Date("2099-01-01T00:00:00.000Z");
    const queued = await enqueueJob({ type: "SOURCE_HEALTH_CHECK", payload: {}, idempotencyKey: key, queueName, maxAttempts: 1, runAt });
    const claimed = await claimNextJob("worker-dead-letter", 30, new Date("2099-01-01T00:00:01.000Z"), [queueName]);
    expect(claimed?.id).toBe(queued.id);
    const failed = await markJobFailed(claimed!, "worker-dead-letter", "SOURCE_DOWN", "Source remained unavailable", true);
    expect(failed.status).toBe("DEAD_LETTER");
  });
});
