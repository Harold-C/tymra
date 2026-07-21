import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma, syncCollectionIncident } from "../src";

const suffix = randomUUID();
let sourceId = "";

describe("collection incident lifecycle", () => {
  beforeAll(async () => {
    const source = await prisma.dataSource.create({
      data: {
        key: `collection-incident-test-${suffix}`,
        name: "Collection Incident Integration Source",
        providerType: "PUBLIC",
        sourceType: "PUBLIC_DATA",
        acquisitionMethod: "integration-test",
        enabled: false,
        isDemo: true,
      },
    });
    sourceId = source.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates an incident, supersedes a repeated failure and closes it after a successful retry", async () => {
    const firstRun = await prisma.collectionRun.create({
      data: {
        dataSourceId: sourceId,
        mode: "MARKET_COVERAGE",
        status: "FAILED",
        scope: { phase: "detail" },
        startedAt: new Date(Date.now() - 2_000),
        finishedAt: new Date(Date.now() - 1_000),
        failureCount: 1,
        errorCode: "PARSING_ERROR",
        errorSummary: "Fixture parser failed",
        isDemo: true,
      },
    });
    const firstIncident = await syncCollectionIncident(firstRun.id);
    expect(firstIncident).toMatchObject({ status: "OPEN", severity: "P1", category: "PARSING_ERROR" });

    const repeatedRun = await prisma.collectionRun.create({
      data: {
        dataSourceId: sourceId,
        mode: "MARKET_COVERAGE",
        status: "FAILED",
        scope: { phase: "detail" },
        startedAt: new Date(),
        finishedAt: new Date(),
        failureCount: 1,
        errorCode: "PARSING_ERROR",
        isDemo: true,
      },
    });
    const repeatedIncident = await syncCollectionIncident(repeatedRun.id);
    expect(repeatedIncident).toMatchObject({ status: "OPEN", category: "PARSING_ERROR" });
    expect(await prisma.collectionIncident.findUniqueOrThrow({ where: { id: firstIncident!.id } })).toMatchObject({ status: "RESOLVED", resolutionAction: "SUPERSEDED_BY_LATER_RUN" });

    const retryJob = await prisma.job.create({
      data: {
        type: "PUBLIC_DATA_COLLECTION",
        status: "SUCCEEDED",
        payload: { sourceId: `collection-incident-test-${suffix}`, phase: "detail" },
        idempotencyKey: `collection-incident-retry-${suffix}`,
        completedAt: new Date(),
      },
    });
    await prisma.collectionIncident.update({ where: { id: repeatedIncident!.id }, data: { retryJobId: retryJob.id, status: "IN_PROGRESS" } });
    const successfulRun = await prisma.collectionRun.create({
      data: {
        jobId: retryJob.id,
        dataSourceId: sourceId,
        mode: "MARKET_COVERAGE",
        status: "SUCCEEDED",
        scope: { phase: "detail" },
        startedAt: new Date(),
        finishedAt: new Date(),
        successCount: 1,
        isDemo: true,
      },
    });

    expect(await syncCollectionIncident(successfulRun.id)).toBeNull();
    expect(await prisma.collectionIncident.findUniqueOrThrow({ where: { id: repeatedIncident!.id } })).toMatchObject({ status: "RESOLVED", resolutionAction: "RETRY_SUCCEEDED" });
  });
});
