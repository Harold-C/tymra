import { randomUUID } from "node:crypto";

import { prisma } from "@tymra/db";
import { afterAll, expect, it } from "vitest";

import { enableProductionPublicPilotTransaction, isProductionPublicPilotSchedule } from "../src/operations/production-public-pilot";

afterAll(async () => prisma.$disconnect());

it("commits one exact weekly pilot only after two durable bounded passes", async () => {
  const sourceKey = "mbie_ivs";
  const scheduleKey = `pilot-public-${sourceKey}-weekly`;
  const marker = randomUUID();
  await expect(prisma.$transaction(async (transaction) => {
    const source = await transaction.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
    await transaction.dataSource.update({ where: { id: source.id }, data: {
      enabled: true, operationalStatus: "HEALTHY", environments: ["PRODUCTION"], metadata: { boundedProductionCanary: true, testMarker: marker },
    } });
    await expect(enableProductionPublicPilotTransaction(transaction, sourceKey, "production")).rejects.toThrow("Two successful bounded production passes");
    for (let pass = 1; pass <= 2; pass += 1) {
      await transaction.collectionRun.create({ data: {
        dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", successCount: 1,
        scope: { productionCanary: true, configurationUnchanged: true, schedulesUnchanged: true, marker, pass },
        startedAt: new Date(Date.now() + pass), finishedAt: new Date(Date.now() + pass), isDemo: false,
      } });
    }
    const result = await enableProductionPublicPilotTransaction(transaction, sourceKey, "production");
    expect(result.acceptedRuns).toHaveLength(2);
    const schedule = await transaction.scheduleDefinition.findUniqueOrThrow({ where: { key: scheduleKey } });
    expect(schedule.enabled).toBe(true);
    expect(isProductionPublicPilotSchedule(schedule)).toBe(true);
    expect(schedule.nextRunAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    await expect(enableProductionPublicPilotTransaction(transaction, sourceKey, "production")).rejects.toThrow("Pilot schedule already exists");
    throw new Error("ROLLBACK_TEST_TRANSACTION");
  })).rejects.toThrow("ROLLBACK_TEST_TRANSACTION");
  expect(await prisma.scheduleDefinition.findUnique({ where: { key: scheduleKey } })).toBeNull();
  expect(await prisma.collectionRun.count({ where: { scope: { path: ["marker"], equals: marker } } })).toBe(0);
});

it("requires queued Argus delivery and locally retained evidence before scheduling a browser pilot", async () => {
  const sourceKey = "venue_eden_park";
  const marker = randomUUID();
  await expect(prisma.$transaction(async (transaction) => {
    const source = await transaction.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
    await transaction.dataSource.update({ where: { id: source.id }, data: {
      enabled: true, operationalStatus: "HEALTHY", environments: ["PRODUCTION"],
      metadata: { boundedProductionCanary: true, browserPilot: true, marker },
    } });
    const artifacts: string[] = [];
    for (let pass = 1; pass <= 2; pass += 1) {
      const job = await transaction.job.create({ data: {
        type: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", status: "SUCCEEDED",
        attemptCount: 1, maxAttempts: 1, payload: { sourceId: sourceKey, marketScope: "new-zealand", limit: 2, productionCanary: true },
        idempotencyKey: `browser-pilot-test:${marker}:${pass}`, sourceId: sourceKey,
      } });
      const run = await transaction.collectionRun.create({ data: {
        jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", successCount: 1,
        scope: { productionCanary: true, configurationUnchanged: true, schedulesUnchanged: true, marker, pass },
        startedAt: new Date(Date.now() + pass), finishedAt: new Date(Date.now() + pass), isDemo: false,
      } });
      await transaction.argusExecution.create({ data: {
        orchestrationKey: `browser-pilot-test:${marker}:${pass}`, parentJobId: job.id,
        collectionRunId: run.id, dataSourceId: source.id, argusJobId: `argus-test-${marker}-${pass}`,
        traceId: `trace-${marker}-${pass}`, connectorId: "eden-park-public", workflowId: "collect_events",
        requestedUrl: "https://edenpark.co.nz/events/", status: "COMPLETED", result: { result_sha256: marker },
        deadlineAt: new Date(Date.now() + 60_000),
      } });
      const artifact = await transaction.rawArtifact.create({ data: {
        collectionRunId: run.id, dataSourceId: source.id, artifactType: "HTML",
        storageRef: `argus-evidence:trace-${marker}-${pass}/page.html`, contentHash: marker,
        expiresAt: new Date(Date.now() + 60_000),
      } });
      artifacts.push(artifact.id);
    }
    await expect(enableProductionPublicPilotTransaction(transaction, sourceKey, "production")).rejects.toThrow("retained locally");
    for (const artifactId of artifacts) {
      await transaction.rawArtifact.update({ where: { id: artifactId }, data: { storageRef: `tymra-evidence:${artifactId}/page.html` } });
    }
    const enabled = await enableProductionPublicPilotTransaction(transaction, sourceKey, "production");
    expect(enabled.acceptedRuns).toHaveLength(2);
    expect(enabled.schedule.enabled).toBe(true);
    throw new Error("ROLLBACK_TEST_TRANSACTION");
  })).rejects.toThrow("ROLLBACK_TEST_TRANSACTION");
  expect(await prisma.scheduleDefinition.findUnique({ where: { key: `pilot-public-${sourceKey}-weekly` } })).toBeNull();
});
