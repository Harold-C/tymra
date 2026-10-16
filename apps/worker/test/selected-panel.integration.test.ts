import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect, vi } from "vitest";
import { prisma as adminPrisma, PrismaClient } from "@tymra/db";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertIsolatedTestEnvironment } from "../../../test/isolation";
import { selectedFixture } from "./selected-panel-fixtures";
import { acquireSelectedActivationLock } from "../src/operations/selected-panel-lock";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedStateSchema, selectedJobSchema, selectedTaskKey } from "../src/operations/selected-panel-plan";
import { legacyOtaDailyWhere } from "../src/operations/selected-panel-budget";
const now = new Date("2026-10-16T06:00:00Z");
const isolated = assertIsolatedTestEnvironment();
const databaseName = `${isolated.databaseName}_selected${process.pid}`;
const databaseUrl = new URL(process.env.DATABASE_URL!); databaseUrl.pathname = `/${databaseName}`;
const prisma = new PrismaClient({ datasourceUrl: databaseUrl.toString() });
vi.doMock("@tymra/db", async () => ({ ...(await vi.importActual<typeof import("@tymra/db")>("@tymra/db")), prisma }));
const { enqueueSelectedPanel, selectedCapturePermission, selectedInput } = await import("../src/operations/selected-panel-production");
beforeAll(async () => {
  if (!/^tymra_(test|e2e)(_[a-z0-9]+)*$/.test(databaseName)) throw Error("Unsafe test database");
  await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const migration = spawnSync(process.execPath, [root + "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", root + "packages/db/prisma/schema.prisma"], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl.toString(), TYMRA_TEST_DATABASE_NAME: databaseName }, encoding: "utf8" });
  if (migration.status !== 0) throw Error("Isolated selected-panel test schema setup failed");
}, 30000);
let historicalId: string | null = null;
let sourceBefore: Awaited<ReturnType<typeof prisma.dataSource.findMany>> = [];
beforeEach(async () => {
  sourceBefore = await prisma.dataSource.findMany({ where: { key: { in: ["booking", "expedia"] } } });
  for (const key of ["booking", "expedia"]) await prisma.dataSource.upsert({ where: { key }, update: { enabled: false, lifecycle: "SUSPENDED", operationalStatus: "DEGRADED", dailyBudget: 6, concurrencyLimit: 1, environments: ["PRODUCTION"], isDemo: false },
    create: { key, name: key, providerType: "OTA", sourceType: "OTA", acquisitionMethod: "PUBLIC_WEB_ARGUS_READ_ONLY", enabled: false, lifecycle: "SUSPENDED", operationalStatus: "DEGRADED", dailyBudget: 6, concurrencyLimit: 1, environments: ["PRODUCTION"], isDemo: false } });
  await prisma.scheduleDefinition.create({ data: { key: SELECTED_PANEL_KEY, enabled: true, queueName: SELECTED_PANEL_QUEUE, jobType: "RATE_COLLECTION", cronExpression: "daily", payload: selectedFixture() } });
});
afterEach(async () => {
  const jobs = await prisma.job.findMany({ where: { queueName: SELECTED_PANEL_QUEUE }, select: { id: true } });
  const ids = jobs.map(j => j.id);
  await prisma.argusExecution.deleteMany({ where: { OR: [{ parentJobId: { in: ids } }, { orchestrationKey: { startsWith: "selected-test:" } }] } });
  await prisma.collectionRun.deleteMany({ where: { jobId: { in: ids } } });
  await prisma.job.deleteMany({ where: { OR: [{ queueName: SELECTED_PANEL_QUEUE }, ...(historicalId ? [{ id: historicalId }] : [])] } });
  historicalId = null;
  await prisma.scheduleDefinition.deleteMany({ where: { key: SELECTED_PANEL_KEY } });
  for (const s of sourceBefore) await prisma.dataSource.update({ where: { id: s.id }, data: { enabled: s.enabled, lifecycle: s.lifecycle, operationalStatus: s.operationalStatus, dailyBudget: s.dailyBudget, concurrencyLimit: s.concurrencyLimit, environments: s.environments, isDemo: s.isDemo, updatedAt: s.updatedAt } });
});
afterAll(async () => {
  await prisma.$disconnect();
  await adminPrisma.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);
  await adminPrisma.$disconnect();
});
describe("selected collection isolated persistence", () => {
  async function upgrade() {
    const control = await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
    await prisma.scheduleDefinition.update({ where: { id: control.id }, data: { payload: { ...(control.payload as object),
      cadence: { version: "dual-window-weekly-v2", startsOn: "2026-10-16", bookingBootstrapDaily: 24, bookingSteadyDaily: 20 } } } });
  }
  it("keeps the dedicated Booking allowance independent of six existing other-plan captures", async () => {
    await upgrade();
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
    for (let i = 0; i < 6; i++) await prisma.argusExecution.create({ data: { orchestrationKey: `selected-test:legacy${i}`, parentJobId: `legacy${i}`, collectionRunId: `legacy${i}`, dataSourceId: source.id,
      argusJobId: `legacy${i}`, traceId: `legacy${i}`, connectorId: "booking-public", workflowId: "collect_rates", requestedUrl: "https://www.booking.com/", status: "COMPLETED", submittedAt: now, deadlineAt: now } });
    const job = (await enqueueSelectedPanel(now))!;
    expect(job).not.toBeNull();
    await expect(selectedCapturePermission(job, selectedInput(selectedFixture().manifest.members[0], selectedJobSchema.parse(job.payload), job.id), source.id, now)).resolves.toBeUndefined();
    expect(await prisma.dataSource.findUnique({ where: { id: source.id } })).toEqual(source);
  });
  it("stops at 24 dedicated captures and preserves the other plans' unused allowance", async () => {
    await upgrade();
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
    for (let i = 0; i < 24; i++) {
      const task = selectedJobSchema.parse({ selectedPanel: SELECTED_PANEL_KEY, manifestHash: selectedFixture().manifestHash, memberId: "sample0", sourceId: "booking", phase: "identity", checkIn: "2026-12-01", unitExternalId: null, round: `capacity${i}` });
      const job = await prisma.job.create({ data: { type: "RATE_COLLECTION", status: "SUCCEEDED", queueName: SELECTED_PANEL_QUEUE, sourceId: "booking", payload: task, maxAttempts: 1, createdAt: now, idempotencyKey: selectedTaskKey(task) } });
      await prisma.argusExecution.create({ data: { orchestrationKey: `selected-test:dedicated${i}`, parentJobId: job.id, collectionRunId: `dedicated${i}`, dataSourceId: source.id,
        argusJobId: `dedicated${i}`, traceId: `dedicated${i}`, connectorId: "booking-public", workflowId: "resolve_listing", requestedUrl: "https://www.booking.com/", status: "COMPLETED", submittedAt: now, deadlineAt: now } });
    }
    expect(await enqueueSelectedPanel(now)).toBeNull();
    const where = await legacyOtaDailyWhere(source.id, source.key, now, prisma);
    expect(await prisma.argusExecution.count({ where })).toBe(0);
    expect(await enqueueSelectedPanel(new Date(now.getTime() + 86400000))).not.toBeNull();
  });
  it("holds the activation lock until the transaction ends without decoding void", async () => {
    await prisma.$transaction(async tx => {
      await acquireSelectedActivationLock(tx);
      const competing = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${SELECTED_PANEL_KEY})) AS locked`;
      expect(competing).toEqual([{ locked: false }]);
    });
    const released = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${SELECTED_PANEL_KEY})) AS locked`;
    expect(released).toEqual([{ locked: true }]);
  });
  it("serializes concurrent dispatch and never changes sources or unrelated schedules", async () => {
    const sources = await prisma.dataSource.findMany();
    const jobs = await Promise.all([enqueueSelectedPanel(now), enqueueSelectedPanel(now)]);
    expect(jobs.filter(Boolean)).toHaveLength(1); expect(jobs.find(Boolean)?.maxAttempts).toBe(1);
    expect(await prisma.dataSource.findMany()).toEqual(sources);
  });
  it("does not reuse the 195 total limit", async () => {
    const proto = selectedJobSchema.parse({ selectedPanel: SELECTED_PANEL_KEY, manifestHash: selectedFixture().manifestHash, memberId: "sample0", sourceId: "booking", phase: "identity", checkIn: "2026-12-01", unitExternalId: null, round: "history" });
    await prisma.job.createMany({ data: Array.from({ length: 200 }, (_, i) => ({ type: "RATE_COLLECTION" as const, queueName: SELECTED_PANEL_QUEUE, sourceId: "booking", status: "SUCCEEDED" as const,
      payload: { ...proto, round: `history${i}` }, idempotencyKey: selectedTaskKey({ ...proto, round: `history${i}` }), maxAttempts: 1, createdAt: new Date("2026-10-14T00:00:00Z") })) });
    expect(await enqueueSelectedPanel(now)).not.toBeNull();
  });
  it("respects source daily caps even when global lifetime caps are removed", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
    for (let i = 0; i < 6; i++) await prisma.argusExecution.create({ data: { orchestrationKey: `selected-test:other${i}`, parentJobId: `other${i}`, collectionRunId: `other${i}`, dataSourceId: source.id,
      argusJobId: `other${i}`, traceId: `other${i}`, connectorId: "booking-public", workflowId: "collect_rates", requestedUrl: "https://www.booking.com/", status: "COMPLETED", submittedAt: now, deadlineAt: now } });
    expect(await enqueueSelectedPanel(now)).toBeNull();
  });
  it("yields to shared work without cancelling it or consuming a capture", async () => {
    const shared = await prisma.argusExecution.create({ data: { orchestrationKey: "selected-test:shared", parentJobId: "shared", collectionRunId: "shared", dataSourceId: "other",
      argusJobId: "shared", traceId: "shared", connectorId: "eventfinda-public", workflowId: "collect_events", requestedUrl: "https://www.eventfinda.co.nz/", status: "RUNNING", submittedAt: now, deadlineAt: now } });
    expect(await enqueueSelectedPanel(now)).toBeNull(); expect(await prisma.argusExecution.findUnique({ where: { id: shared.id } })).toEqual(shared);
  });
  it("honours held objects and stopped sources, including after database key reordering", async () => {
    const state = selectedFixture();
    await prisma.scheduleDefinition.update({ where: { key: SELECTED_PANEL_KEY }, data: { payload: { ...state, held: [{ memberId: "sample0", reason: "TIMEOUT" }] } } });
    const job = (await enqueueSelectedPanel(now))!; expect(selectedJobSchema.parse(job.payload).memberId).toBe("sample1");
    await prisma.job.update({ where: { id: job.id }, data: { status: "DEAD_LETTER" } });
    await prisma.scheduleDefinition.update({ where: { key: SELECTED_PANEL_KEY }, data: { payload: { ...state, stoppedSources: ["booking"] } } });
    expect(await enqueueSelectedPanel(now)).toBeNull();
  });
  it("validates exact permissions before submission and immediately revokes disabled control", async () => {
    const job = (await enqueueSelectedPanel(now))!, task = selectedJobSchema.parse(job.payload);
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: task.sourceId } });
    const input = selectedInput(selectedFixture().manifest.members[0], task, job.id);
    await expect(selectedCapturePermission(job, input, source.id, now)).resolves.toBeUndefined();
    await expect(selectedCapturePermission(job, { ...input, maxAttempts: 2 }, source.id, now)).rejects.toThrow("SELECTED_INPUT_CHANGED");
    await prisma.scheduleDefinition.update({ where: { key: SELECTED_PANEL_KEY }, data: { enabled: false } });
    await expect(selectedCapturePermission(job, input, source.id, now)).rejects.toThrow("SELECTED_PANEL_PERMISSION_CLOSED");
  });
  it("persists explicit no-limit/no-retry state without changing historical acceptance jobs", async () => {
    const control = await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
    const state = selectedStateSchema.parse(control.payload); expect(state.manifest.totalExecutionLimit).toBeNull(); expect(state.manifest.automaticRetries).toBe(false);
    const old = await prisma.job.create({ data: { type: "RATE_COLLECTION", queueName: "christchurch-observation", sourceId: "booking", maxAttempts: 1, status: "DEAD_LETTER", payload: { historical: true }, idempotencyKey: "selected-test:preserved-history" } });
    historicalId = old.id;
    await enqueueSelectedPanel(now); expect(await prisma.job.findUnique({ where: { id: old.id } })).toEqual(old);
  });
  it("requires verified identity before any quote and does not accept a fabricated binding", async () => {
    const job = (await enqueueSelectedPanel(now))!, task = selectedJobSchema.parse(job.payload);
    const quote = selectedJobSchema.parse({ ...task, phase: "quote", unitExternalId: "unit0", round: "2026-10-12" });
    await prisma.job.update({ where: { id: job.id }, data: { payload: quote, idempotencyKey: selectedTaskKey(quote) } });
    const parent = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
    await expect(selectedCapturePermission(parent, selectedInput(selectedFixture().manifest.members[0], quote, job.id), source.id, now)).rejects.toThrow("SELECTED_IDENTITY_NOT_VERIFIED");
  });
  it("does not block on unrelated future work or modify it", async () => {
    const future = await prisma.job.create({ data: { type: "RATE_COLLECTION", queueName: "future-unrelated", sourceId: "booking", maxAttempts: 1,
      payload: {}, idempotencyKey: "selected-test:future", runAt: new Date(now.getTime() + 86400000) } });
    historicalId = future.id;
    expect(await enqueueSelectedPanel(now)).not.toBeNull();
    expect(await prisma.job.findUnique({ where: { id: future.id } })).toEqual(future);
  });
});
