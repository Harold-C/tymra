import { beforeEach, afterEach, afterAll, describe, it, expect } from "vitest";
import { prisma } from "@tymra/db";
import { selectedFixture } from "./selected-panel-fixtures";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedStateSchema, selectedJobSchema, selectedTaskKey } from "../src/operations/selected-panel-plan";
import { enqueueSelectedPanel, selectedCapturePermission, selectedInput } from "../src/operations/selected-panel-production";
const now = new Date("2026-10-16T06:00:00Z");
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
afterAll(async () => { await prisma.$disconnect(); });
describe("selected collection isolated persistence", () => {
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
});
