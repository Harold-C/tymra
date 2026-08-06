import { randomUUID } from "node:crypto";

import { getEnvironment, type Environment } from "@tymra/config";
import { enqueueJob, prisma } from "@tymra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CollectionControlError, runCollectionControlAction } from "@/lib/server/collection-control";

const suffix = randomUUID();
const sourceKey = `collection-control-test-${suffix}`;
const scheduleKey = `${sourceKey}-daily`;
const jobIds: string[] = [];
let adminId = "";
let sourceId = "";

const environment = {
  ...getEnvironment(),
  NODE_ENV: "test",
  SCHEDULER_ENABLED: false,
  HIGH_FREQUENCY_SCHEDULER_ENABLED: false,
} as Environment;

describe("admin collection control persistence", () => {
  beforeAll(async () => {
    adminId = (await prisma.adminUser.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id;
    const source = await prisma.dataSource.create({
      data: {
        key: sourceKey,
        name: "Collection Control Integration Source",
        providerType: "PUBLIC",
        sourceType: "PUBLIC_DATA",
        acquisitionMethod: "integration-test",
        enabled: true,
        operationalStatus: "HEALTHY",
        environments: ["DEVELOPMENT"],
      },
    });
    sourceId = source.id;
    await prisma.scheduleDefinition.create({
      data: {
        key: scheduleKey,
        jobType: "PUBLIC_DATA_COLLECTION",
        queueName: "integration-collection-control",
        cronExpression: "daily",
        enabled: true,
        nextRunAt: new Date("2100-01-01T00:00:00.000Z"),
        payload: { sourceId: sourceKey, marketScope: "new-zealand" },
      },
    });
  });

  afterAll(async () => {
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.scheduleDefinition.deleteMany({ where: { key: scheduleKey } });
    await prisma.dataSource.deleteMany({ where: { key: sourceKey } });
    await prisma.$disconnect();
  });

  it("pauses a source, disables its schedule and cancels pending collection jobs", async () => {
    const pending = await enqueueJob({
      type: "PUBLIC_DATA_COLLECTION",
      queueName: "integration-collection-control",
      payload: { sourceId: sourceKey },
      sourceId: sourceKey,
      runAt: new Date("2100-01-01T00:00:00.000Z"),
      idempotencyKey: `integration-collection-control:${suffix}:pause`,
    });
    jobIds.push(pending.id);

    const result = await runCollectionControlAction(adminId, { action: "set_source_enabled", sourceKey, enabled: false }, environment);
    expect(result).toMatchObject({ sourceKey, enabled: false, cancelledJobs: 1 });
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceKey } })).toMatchObject({ enabled: false });
    expect(await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: scheduleKey } })).toMatchObject({ enabled: false, nextRunAt: null });
    expect(await prisma.job.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: "CANCELLED", lastErrorCode: "SOURCE_PAUSED" });
  });

  it("resumes a source without changing operational configuration and refuses schedule activation while runtime scheduling is off", async () => {
    const before = await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
    await runCollectionControlAction(adminId, { action: "set_source_enabled", sourceKey, enabled: true }, environment);
    const after = await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
    expect(after.enabled).toBe(true);
    expect(after.operationalStatus).toBe(before.operationalStatus);
    expect(after.lifecycle).toBe(before.lifecycle);

    await expect(runCollectionControlAction(adminId, { action: "set_schedule_enabled", scheduleKey, enabled: true }, environment))
      .rejects.toMatchObject({ code: "SCHEDULER_RUNTIME_DISABLED" } satisfies Partial<CollectionControlError>);
    expect((await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: scheduleKey } })).enabled).toBe(false);
  });

  it("cancels an individual pending job and records administrator audit events", async () => {
    const pending = await enqueueJob({
      type: "PUBLIC_DATA_COLLECTION",
      queueName: "integration-collection-control",
      payload: { sourceId: sourceKey },
      sourceId: sourceKey,
      runAt: new Date("2100-01-01T00:00:00.000Z"),
      idempotencyKey: `integration-collection-control:${suffix}:cancel`,
    });
    jobIds.push(pending.id);
    await runCollectionControlAction(adminId, { action: "cancel_job", jobId: pending.id }, environment);
    expect(await prisma.job.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: "CANCELLED", lastErrorCode: "ADMIN_CANCELLED" });
    expect(await prisma.auditEvent.count({ where: { actorAdminId: adminId, eventType: { startsWith: "collection_" }, OR: [{ entityId: sourceId }, { entityId: pending.id }] } })).toBeGreaterThanOrEqual(3);
  });
});
