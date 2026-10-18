import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { prisma as adminPrisma, PrismaClient } from "@tymra/db";
import { spawnSync } from "node:child_process";
import { assertIsolatedTestEnvironment } from "../../../../../../../test/isolation";
import { seedSampleQuoteTrendFixture } from "../../../../../../../test/sample-quote-trend-fixtures";
import { observationCanonicalHash } from "@tymra/domain/observation-wire";
import { createHash } from "node:crypto";
import { Prisma } from "@tymra/db";

const isolated = assertIsolatedTestEnvironment(), databaseName = `${isolated.databaseName}_sampletrends${process.pid}`;
const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${databaseName}`;
const prisma = new PrismaClient({ datasourceUrl: url.toString() });
vi.doMock("@tymra/db", async () => ({ ...(await vi.importActual<typeof import("@tymra/db")>("@tymra/db")), prisma }));
const { readSampleQuoteTrends } = await import("@/lib/server/sample-quote-trends");
const { parseSampleTrendFilter } = await import("@/lib/sample-trend-filter");
const now = new Date("2026-10-30T02:00:00Z");
let range: Awaited<ReturnType<typeof seedSampleQuoteTrendFixture>>;
beforeAll(async () => {
  await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  const root = process.cwd();
  const migrated = spawnSync(process.execPath, [root + "/node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", root + "/packages/db/prisma/schema.prisma"], {
    cwd: root, env: { ...process.env, DATABASE_URL: url.toString(), TYMRA_TEST_DATABASE_NAME: databaseName }, encoding: "utf8" });
  if (migrated.status !== 0) throw Error("Could not initialize the disposable sample-trend database");
  range = await seedSampleQuoteTrendFixture(prisma, now);
}, 30000);
afterAll(async () => { await prisma.$disconnect(); await adminPrisma.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`); await adminPrisma.$disconnect(); });

describe("sample quote read chain", () => {
  it("reads retained verified wire with a narrow projection, separates member/two-night series and writes nothing", async () => {
    const before = await Promise.all([prisma.job.findMany(), prisma.collectionRun.findMany(), prisma.argusExecution.findMany(), prisma.scheduleDefinition.findMany(), prisma.dataSource.findMany()]);
    const filter = parseSampleTrendFilter({ from: range.from, to: range.to, basis: "ALL" }, now); if (!filter.success) throw Error("Invalid test filter");
    const result = await readSampleQuoteTrends(filter.data);
    expect(result).toMatchObject({ configuredMembers: 2, observedMembers: 2, includedMembers: 2, complete: true });
    expect(result!.series).toHaveLength(2);
    expect(result!.series.find(s => s.basis === "PUBLIC_TOTAL")).toMatchObject({ nights: 1 });
    expect(result!.series.find(s => s.basis === "MEMBER_REFERENCE")).toMatchObject({ nights: 2 });
    expect(result!.series.every(s => Math.abs(s.points[1].changePct! - 10) < 0.00001)).toBe(true);
    expect(result!.recentQuotes.every(q => !JSON.stringify(q).includes("wireJson"))).toBe(true);
    const after = await Promise.all([prisma.job.findMany(), prisma.collectionRun.findMany(), prisma.argusExecution.findMany(), prisma.scheduleDefinition.findMany(), prisma.dataSource.findMany()]);
    expect(after).toEqual(before);
  });
  it("validates filters and never treats a basis selection as permission to combine the two groups", async () => {
    const filter = parseSampleTrendFilter({ from: range.from, to: range.to, basis: "MEMBER_REFERENCE", nights: "2" }, now);
    if (!filter.success) throw Error("Invalid test filter");
    const result = await readSampleQuoteTrends(filter.data);
    expect(result!.series).toHaveLength(1); expect(result!.series[0].basis).toBe("MEMBER_REFERENCE");
    expect(result!.series[0].nights).toBe(2);
  });
  it("replays legacy receipts only for their verified execution and rejects a tampered persisted quote", async () => {
    const run = await prisma.collectionRun.findFirstOrThrow({ where: { scope: { path: ["memberId"], equals: "trend-fixture-1" } }, orderBy: { finishedAt: "asc" } });
    const scope = run.scope as { verifiedWire: { wireJson: string } } & Record<string, unknown>;
    const originalJob = await prisma.job.findUniqueOrThrow({ where: { id: run.jobId! } });
    const filter = parseSampleTrendFilter({ from: range.from, to: range.to, basis: "PUBLIC_TOTAL" }, now); if (!filter.success) throw Error("Invalid test filter");
    // Completed receipts remain immutable even in fixtures; create later observations instead of editing them.
    async function observation(index: number, tampered = false, delivered = true) {
      const at = new Date(run.finishedAt!.getTime() + index * 1000), argusId = `synthetic-legacy-${index}`;
      const payload = { job_id: argusId, ...JSON.parse(scope.verifiedWire.wireJson) };
      const wire = { ...payload, result_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
      const proof = { argusJobId: wire.job_id, resultSha256: wire.result_sha256, canonicalSha256: observationCanonicalHash(wire) };
      const copied = JSON.parse(JSON.stringify(scope)); copied.verifiedWire = proof;
      for (const e of copied.evaluated) e.raw.observedAt = at.toISOString();
      const job = await prisma.job.create({ data: { type: originalJob.type, queueName: originalJob.queueName, status: "SUCCEEDED", maxAttempts: 1,
        idempotencyKey: argusId, payload: originalJob.payload as Prisma.InputJsonValue } });
      const created = await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: run.dataSourceId, mode: run.mode, status: "SUCCEEDED", isDemo: false,
        startedAt: at, finishedAt: at, scope: copied } });
      if (tampered) wire.items[0].result.data.rates[0].totalPriceMinor++;
      await prisma.argusExecution.create({ data: { orchestrationKey: argusId, parentJobId: job.id, collectionRunId: created.id, dataSourceId: run.dataSourceId,
        argusJobId: argusId, traceId: argusId, connectorId: "booking-public", workflowId: "collect_rates", requestedUrl: "https://www.booking.com/hotel/nz/synthetic.html",
        status: "COMPLETED", deadlineAt: at, deliveryVerifiedAt: delivered ? at : null, result: wire } });
    }
    await observation(1);
    const result = await readSampleQuoteTrends(filter.data);
    expect(result!.series[0].points[1].changePct).toBeCloseTo(10);
    expect(result!.series[0].feeGroup).toBe("INCLUSIVE");
    await observation(2, true);
    const rejected = await readSampleQuoteTrends(filter.data);
    expect(rejected!.series[0].points).toHaveLength(1);
    expect(rejected!.failedWindows).toBe(1);
    expect(rejected!.gaps[0].reasons).toContain("DELIVERY_OR_CAPTURE_FAILED");
    await observation(3, false, false);
    expect((await readSampleQuoteTrends(filter.data))!.failedWindows).toBe(1);
  });
});
