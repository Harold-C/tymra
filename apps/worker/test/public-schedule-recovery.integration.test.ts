import { createHash, randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@tymra/db";
import { afterAll, expect, it } from "vitest";
import { PUBLIC_RECOVERY_SOURCES, preparePublicScheduleRecoveryTransaction, enqueuePublicRecoveryTrialTransaction, enableRecoveredPublicScheduleTransaction } from "../src/operations/public-schedule-recovery";
import { progressSchedulePayload } from "../src/operations/production-progress-schedules";
import { publicPilotSchedulePayload, publicPilotRequestLimit } from "../src/operations/production-public-pilot";

afterAll(() => prisma.$disconnect());

it.each(PUBLIC_RECOVERY_SOURCES)("recovers only the existing %s plan after two exact verified trials", async (sourceKey) => {
  await expect(prisma.$transaction(async (tx) => {
    const revision = "a".repeat(40), marker = randomUUID();
    await tx.job.updateMany({ where: { status: { in: ["PENDING", "RUNNING"] } }, data: { status: "CANCELLED" } });
    const source = await tx.dataSource.upsert({ where: { key: sourceKey }, create: { key: sourceKey, name: sourceKey, providerType: "PUBLIC", acquisitionMethod: "TEST", environments: ["PRODUCTION"], enabled: false, lifecycle: "SUSPENDED", operationalStatus: "HEALTHY", metadata: { boundedProductionCanary: true, marker } }, update: { providerType: "PUBLIC", isDemo: false, environments: ["PRODUCTION"], enabled: false, lifecycle: "SUSPENDED", operationalStatus: "HEALTHY", metadata: { boundedProductionCanary: true, marker } } });
    await tx.scheduleDefinition.deleteMany({ where: { payload: { path: ["sourceId"], equals: sourceKey } } });
    const progress = ["eventfinda", "ticketmaster"].includes(sourceKey);
    const payload = progress ? progressSchedulePayload(sourceKey) : publicPilotSchedulePayload(sourceKey);
    const plan = await tx.scheduleDefinition.create({ data: { key: progress ? `progress-${sourceKey}-daily` : `pilot-public-${sourceKey}-weekly`, jobType: progress ? "EVENT_COLLECTION" : "PUBLIC_DATA_COLLECTION", queueName: progress ? "event-collection" : "public-data-collection", cronExpression: progress ? "daily" : "weekly", payload, enabled: false } });
    const oldFailure = await tx.collectionRun.create({ data: { dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "FAILED", failureCount: 1, errorCode: "PARSING_ERROR", scope: {}, createdAt: new Date(Date.now() - 86_400_000), isDemo: false } });
    const otherPlans = await tx.scheduleDefinition.findMany({ where: { id: { not: plan.id } }, orderBy: { id: "asc" } });
    const prepared = await preparePublicScheduleRecoveryTransaction(tx, sourceKey, "production", revision);
    expect((await preparePublicScheduleRecoveryTransaction(tx, sourceKey, "production", revision)).startedAt).toEqual(prepared.startedAt);
    await expect(enableRecoveredPublicScheduleTransaction(tx, sourceKey, "production", revision)).rejects.toThrow("latest two exact recovery trials");
    for (let pass = 1; pass <= 2; pass++) {
      const trial = await enqueuePublicRecoveryTrialTransaction(tx, sourceKey, "production", revision);
      expect(trial.ordinal).toBe(pass);
      await expect(enqueuePublicRecoveryTrialTransaction(tx, sourceKey, "production", revision)).rejects.toThrow("idle Tymra queue");
      await tx.job.update({ where: { id: trial.jobId }, data: { status: "SUCCEEDED", attemptCount: 1, completedAt: new Date() } });
      const scope = sourceKey === "eventfinda" ? { phase: "full", maxPages: 3, maxDetails: 1, maxRecords: 500, requests: 4, failureCount: 0 }
        : sourceKey === "ticketmaster" ? { requestedPhase: "full", phase: "full", limits: { maxPages: 3, maxDetails: 2, maxRecords: 100 }, counters: { requests: 3, failures: 0 } }
          : { productionCanary: true, configurationUnchanged: true, schedulesUnchanged: true, counters: { requests: publicPilotRequestLimit(sourceKey), failures: 0 } };
      const run = await tx.collectionRun.create({ data: { dataSourceId: source.id, jobId: trial.jobId, mode: "MARKET_COVERAGE", status: "SUCCEEDED", successCount: 2, failureCount: 0, scope, isDemo: false, createdAt: new Date(Date.now() + pass), finishedAt: new Date() } });
      const artifact = await tx.rawArtifact.create({ data: { dataSourceId: source.id, collectionRunId: run.id, artifactType: "NETWORK_RESPONSE", storageRef: progress || sourceKey === "school_sport_nz" ? `tymra-evidence:results/${marker}/${pass}.json` : `postgres:RawArtifact:${marker}:${pass}`, payload: { marker }, contentHash: createHash("sha256").update(marker).digest("hex"), expiresAt: new Date(Date.now() + 86_400_000) } });
      if (progress || sourceKey === "school_sport_nz") {
        const execution = await tx.argusExecution.create({ data: { orchestrationKey: marker + pass, parentJobId: trial.jobId, collectionRunId: run.id, dataSourceId: source.id, argusJobId: marker + pass, traceId: marker, connectorId: `${sourceKey}-public`, workflowId: "discover_events", requestedUrl: "https://example.test/", status: "COMPLETED", deadlineAt: new Date() } });
        if (pass === 2) await expect(enableRecoveredPublicScheduleTransaction(tx, sourceKey, "production", revision)).rejects.toThrow("evidence delivery is incomplete");
        await tx.argusExecution.update({ where: { id: execution.id }, data: { deliveryVerifiedAt: new Date() } });
      }
      if (pass === 2) {
        await tx.rawArtifact.update({ where: { id: artifact.id }, data: { parserFailure: true } });
        await expect(enableRecoveredPublicScheduleTransaction(tx, sourceKey, "production", revision)).rejects.toThrow("evidence is incomplete");
        await tx.rawArtifact.update({ where: { id: artifact.id }, data: { parserFailure: false } });
      }
    }
    const accepted = await enableRecoveredPublicScheduleTransaction(tx, sourceKey, "production", revision);
    expect(accepted.enabled).toBe(true); expect(accepted.acceptedRuns).toHaveLength(2);
    expect(accepted.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(await tx.collectionRun.findUnique({ where: { id: oldFailure.id } })).toEqual(oldFailure);
    expect(await tx.scheduleDefinition.findMany({ where: { id: { not: plan.id } }, orderBy: { id: "asc" } })).toEqual(otherPlans);
    expect(await tx.scheduleDefinition.count({ where: { payload: { path: ["sourceId"], equals: sourceKey } } })).toBe(1);
    const after = await tx.dataSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(after.lifecycle).toBe("PRODUCTION");
    expect((after.metadata as Prisma.JsonObject).marker).toBe(marker);
    if (sourceKey === "queenstown_airport_monthly") expect(after.dailyBudget).toBeGreaterThanOrEqual(12);
    throw new Error("ROLLBACK_PUBLIC_RECOVERY_TEST");
  }, { timeout: 20_000 })).rejects.toThrow("ROLLBACK_PUBLIC_RECOVERY_TEST");
});

it("rejects unrelated sources and non-production recovery", async () => {
  await expect(prisma.$transaction((tx) => preparePublicScheduleRecoveryTransaction(tx, "booking", "production", "a".repeat(40)))).rejects.toThrow("approved production source");
  await expect(prisma.$transaction((tx) => preparePublicScheduleRecoveryTransaction(tx, "eventfinda", "development", "a".repeat(40)))).rejects.toThrow("approved production source");
});
