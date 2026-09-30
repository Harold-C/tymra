import { randomUUID } from "node:crypto";
import { prisma } from "@tymra/db";
import { afterAll, expect, it } from "vitest";
import { enqueueProductionOtaTrialTransaction, prepareProductionOtaTransaction, isProductionOtaSchedule } from "../src/operations/production-ota";
afterAll(() => prisma.$disconnect());
it("prepares and queues one isolated public OTA without disabling existing public schedules", async () => {
  await expect(prisma.$transaction(async (tx) => {
    const marker = randomUUID();
    const previous = await tx.dataSource.findUnique({ where: { key: "booking" } });
    if (previous) await tx.dataSource.update({ where: { id: previous.id }, data: { key: `test-preserved-booking-${marker}` } });
    await tx.scheduleDefinition.create({ data: { key: `test-public-${marker}`, enabled: true, jobType: "PUBLIC_DATA_COLLECTION", queueName: "public", cronExpression: "daily", payload: { sourceId: "fx_rates" } } });
    const original = await tx.scheduleDefinition.findMany({ where: { enabled: true } });
    await prepareProductionOtaTransaction(tx, "booking", "production");
    const source = await tx.dataSource.findUniqueOrThrow({ where: { key: "booking" }, include: { capabilities: true } });
    expect(source).toMatchObject({ enabled: false, operationalStatus: "DEGRADED", providerType: "OTA", dailyBudget: 6, concurrencyLimit: 1 });
    expect(source.capabilities).toHaveLength(4);
    const schedule = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: "pilot-ota-booking-daily" } });
    expect(schedule.enabled).toBe(false); expect(isProductionOtaSchedule(schedule)).toBe(true);
    await expect(prepareProductionOtaTransaction(tx, "booking", "production")).rejects.toThrow("never overwrites");
    await tx.job.updateMany({ where: { sourceId: { in: ["booking", "airbnb", "expedia", "bookabach", "agoda", "trip"] }, status: { in: ["PENDING", "RUNNING"] } }, data: { status: "CANCELLED" } });
    const trial = await enqueueProductionOtaTrialTransaction(tx, "booking", "production");
    expect(await tx.job.findUniqueOrThrow({ where: { id: trial.jobId } })).toMatchObject({ sourceId: "booking", queueName: "ota-production", status: "PENDING", maxAttempts: 1, attemptCount: 0 });
    await expect(enqueueProductionOtaTrialTransaction(tx, "booking", "production")).rejects.toThrow("one source at a time");
    expect(await tx.scheduleDefinition.findMany({ where: { id: { in: original.map((s) => s.id) } }, orderBy: { id: "asc" } })).toEqual(original.sort((a, b) => a.id.localeCompare(b.id)));
    throw new Error("ROLLBACK_OTA_TEST");
  }, { timeout: 20_000 })).rejects.toThrow("ROLLBACK_OTA_TEST");
});
