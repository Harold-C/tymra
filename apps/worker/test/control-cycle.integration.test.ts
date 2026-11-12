import { beforeAll, afterAll, expect, it } from "vitest";
import { prisma as adminPrisma, PrismaClient } from "@tymra/db";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertIsolatedTestEnvironment } from "../../../test/isolation";
import { runControlCycle } from "../src/operations/control-cycle";

const isolated = assertIsolatedTestEnvironment();
const databaseName = `${isolated.databaseName}_cycle${process.pid}`;
const databaseUrl = new URL(process.env.DATABASE_URL!); databaseUrl.pathname = `/${databaseName}`;
const prisma = new PrismaClient({ datasourceUrl: databaseUrl.toString() });
beforeAll(async () => {
  if (!/^tymra_test_[a-z0-9_]+$/.test(databaseName)) throw Error("Unsafe test database");
  await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const p = spawnSync(process.execPath, [root + "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", root + "packages/db/prisma/schema.prisma"],
    { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl.toString(), TYMRA_TEST_DATABASE_NAME: databaseName }, encoding: "utf8" });
  if (p.status !== 0) throw Error("Isolated control-cycle schema setup failed");
}, 30000);
afterAll(async () => {
  await prisma.$disconnect(); await adminPrisma.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`); await adminPrisma.$disconnect();
});

it("rolls back an expired scheduling transaction and permits one later dispatch without orphaned or duplicate jobs", async () => {
  let writtenBeforeExpiry = false, calls = 0;
  const data = { type: "RATE_COLLECTION" as const, queueName: "isolated-control", payload: {}, maxAttempts: 1, idempotencyKey: "isolated-expired-control" };
  const expired = await runControlCycle("scheduler", () => prisma.$transaction(async tx => {
    calls++;
    await tx.job.create({ data }); writtenBeforeExpiry = true;
    await tx.$queryRaw`SELECT 1 FROM pg_sleep(0.4)`;
    await tx.job.count();
  }, { timeout: 250 }));
  expect(expired).toBe(false); expect(writtenBeforeExpiry).toBe(true); expect(calls).toBe(1);
  expect(await prisma.job.count()).toBe(0);
  expect(await runControlCycle("scheduler", () => prisma.$transaction(tx => tx.job.create({ data })))).toBe(true);
  expect(await prisma.job.findMany()).toMatchObject([{ idempotencyKey: data.idempotencyKey, maxAttempts: 1, attemptCount: 0, status: "PENDING" }]);
  expect(await prisma.job.count()).toBe(1);
});
