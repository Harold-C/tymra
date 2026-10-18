import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { prisma as adminPrisma, PrismaClient } from "@tymra/db";
import { spawnSync } from "node:child_process";
import { assertIsolatedTestEnvironment } from "../../../../../../../test/isolation";
import { seedSampleQuoteTrendFixture } from "../../../../../../../test/sample-quote-trend-fixtures";

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
});
