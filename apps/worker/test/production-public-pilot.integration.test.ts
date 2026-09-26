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
