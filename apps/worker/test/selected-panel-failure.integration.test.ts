import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { prisma as adminPrisma, PrismaClient } from "@tymra/db";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertIsolatedTestEnvironment } from "../../../test/isolation";
import { getEnvironment } from "@tymra/config";
import { selectedFixture } from "./selected-panel-fixtures";
import { nextSelectedTasks, selectedHash, selectedTaskKey, selectedStateSchema, SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE } from "../src/operations/selected-panel-plan";

const isolated = assertIsolatedTestEnvironment();
const databaseName = `${isolated.databaseName}_failure${process.pid}`;
const databaseUrl = new URL(process.env.DATABASE_URL!);databaseUrl.pathname = `/${databaseName}`;
const prisma = new PrismaClient({ datasourceUrl: databaseUrl.toString() });
const capture = vi.hoisted(() => vi.fn());
const acknowledge = vi.hoisted(() => vi.fn());
vi.mock("../src/services/argus-orchestrator", () => ({ captureBrowserTaskWithDurableArgus: capture, acknowledgePersistedArgusResults: acknowledge }));
vi.mock("../src/operations/observation-production", async importOriginal => ({ ...(await importOriginal<typeof import("../src/operations/observation-production")>()), persistObservationEvidence: vi.fn() }));
vi.doMock("@tymra/db", async () => ({ ...(await vi.importActual<typeof import("@tymra/db")>("@tymra/db")), prisma, retainSampleReferencePackages: vi.fn() }));
const { handleSelectedPanelJob } = await import("../src/operations/selected-panel-production");
beforeAll(async () => {
  if (!/^tymra_test_[a-z0-9_]+$/.test(databaseName)) throw Error("Unsafe test database");
  await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const result = spawnSync(process.execPath, [root + "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", root + "packages/db/prisma/schema.prisma"],
    { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl.toString(), TYMRA_TEST_DATABASE_NAME: databaseName }, encoding: "utf8" });
  if (result.status !== 0) throw Error("Isolated failure-test migrations failed");
}, 30000);
afterAll(async () => {
  await prisma.$disconnect();await adminPrisma.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);await adminPrisma.$disconnect();
});
it("persists real failed runs while applying only the bounded window/member/source impact", async () => {
  capture.mockRejectedValue(Error("isolated capture failure"));
  const source = await prisma.dataSource.create({ data: { key: "booking", name: "Booking fixture", providerType: "OTA", sourceType: "OTA", acquisitionMethod: "ISOLATED_FIXTURE",
    enabled: false, lifecycle: "SUSPENDED", operationalStatus: "DEGRADED", dailyBudget: 6, concurrencyLimit: 1, environments: ["PRODUCTION"] } });
  const state = selectedFixture();state.held.push({ memberId: "sample2", reason: "EXISTING_IDENTITY_HOLD" });
  const control = await prisma.scheduleDefinition.create({ data: { key: SELECTED_PANEL_KEY, jobType: "RATE_COLLECTION", queueName: SELECTED_PANEL_QUEUE, cronExpression: "daily", enabled: true, payload: state } });
  const at = new Date("2026-10-20T06:00:00Z");
  const task = nextSelectedTasks(state, [{ memberId: "sample0", identityAt: at, unitExternalId: "unit0", lastQuoteAt: null }], new Set(), at).find(t => t.memberId === "sample0" && t.phase === "quote")!;
  const cases = [
    ["NAVIGATION_ERROR", true, false, false], ["TIMEOUT", true, false, false],
    ["NAVIGATION_ERROR", false, true, false], ["PARSING_ERROR", false, true, false],
    ["UNIT_IDENTITY_AMBIGUOUS", false, true, false], ["ACCESS_CHALLENGE", true, true, true],
  ] as const;
  for (const [index, [reason, retryable, held, stopped]] of cases.entries()) {
    await prisma.scheduleDefinition.update({ where: { id: control.id }, data: { payload: state } });
    const job = await prisma.job.create({ data: { type: "RATE_COLLECTION", status: "RUNNING", queueName: SELECTED_PANEL_QUEUE, sourceId: source.key, payload: task, maxAttempts: 1, idempotencyKey: `isolated-failure-${index}` } });
    const run = await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "RUNNING", scope: { selectedPanel: SELECTED_PANEL_KEY, phase: "quote", task } } });
    await prisma.argusExecution.create({ data: { parentJobId: job.id, collectionRunId: run.id, dataSourceId: source.id, orchestrationKey: `failure-${index}`, argusJobId: `failure-${index}`,
      traceId: `failure-${index}`, connectorId: "booking-public", workflowId: "collect_rates", requestedUrl: state.manifest.members[0]!.sourceUrl, status: "FAILED", deadlineAt: at, errorCategory: reason, retryable } });
    await expect(handleSelectedPanelJob(job, { ...getEnvironment(), NODE_ENV: "production", ARGUS_API_BASE_URL: "https://api.argus.nz" })).rejects.toThrow("isolated capture failure");
    expect(await prisma.collectionRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: "FAILED", errorCode: reason, failureCount: 1 });
    const after = selectedStateSchema.parse((await prisma.scheduleDefinition.findUniqueOrThrow({ where: { id: control.id } })).payload);
    expect(after.held).toEqual([...state.held, ...(held ? [{ memberId: "sample0", reason }] : [])]);
    expect(after.stoppedSources).toEqual(stopped ? ["booking"] : []);
    expect(after.manifest).toEqual(state.manifest);
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } })).toEqual(source);
    expect(await prisma.job.count()).toBe(index + 1);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).maxAttempts).toBe(1);
  }
  expect(capture).toHaveBeenCalledTimes(cases.length);
});
it("persists a normal no-availability observation without a member hold, retry or public price", async () => {
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
  const state = selectedFixture();state.held.push({ memberId: "sample2", reason: "EXISTING_IDENTITY_HOLD" });
  await prisma.scheduleDefinition.update({ where: { key: SELECTED_PANEL_KEY }, data: { payload: state } });
  const at = new Date("2026-10-20T06:00:00Z");
  const task = nextSelectedTasks(state, [{ memberId: "sample0", identityAt: at, unitExternalId: "unit0", lastQuoteAt: null }], new Set(), at).find(t => t.memberId === "sample0" && t.phase === "quote")!;
  const rate = { sourceListingId: "selected-0", unitExternalId: "unit0", checkIn: task.checkIn, checkOut: "2026-12-02", currency: "NZD", adults: 2, children: 0, units: 1,
    basePriceMinor: null, mandatoryFeesMinor: null, taxesMinor: null, optionalFeesMinor: null, totalPriceMinor: null, referencePrices: [], availabilityStatus: "UNAVAILABLE", minimumStay: null,
    restrictionReason: "Property-wide no availability for the exact requested stay", mealPlan: "UNKNOWN", cancellationPolicy: "UNKNOWN", paymentTerms: "UNKNOWN", rateFence: "PUBLIC",
    sourceUrl: state.manifest.members[0]!.sourceUrl, collectedAt: at.toISOString(), qualityFlags: ["PROPERTY_LEVEL_UNAVAILABILITY", "UNIT_IDENTITY_NOT_REVERIFIED"], fieldSources: {} };
  capture.mockResolvedValueOnce({ ok: true, payload: { ok: true, extracted: { data_schema: "ota-public.collect_rates", schema_version: "1.0.0", provider: "booking",
    sourceListingId: "selected-0", rates: [rate], observedAt: at.toISOString(), warnings: ["NO_PRICE_FOR_REQUESTED_CONTEXT"], quality: "partial" } } });
  const job = await prisma.job.create({ data: { type: "RATE_COLLECTION", status: "RUNNING", queueName: SELECTED_PANEL_QUEUE, sourceId: source.key, payload: task, maxAttempts: 1, idempotencyKey: "isolated-normal-unavailable" } });
  await expect(handleSelectedPanelJob(job, { ...getEnvironment(), NODE_ENV: "production", ARGUS_API_BASE_URL: "https://api.argus.nz" })).resolves.toBeUndefined();
  const run = await prisma.collectionRun.findFirstOrThrow({ where: { jobId: job.id } });
  expect(run).toMatchObject({ status: "SUCCEEDED", successCount: 1, failureCount: 0 });
  expect(run.scope).toMatchObject({ evaluated: [{ status: "RAW_ONLY", totalMinor: null, comparisonKey: null, raw: { outcome: "UNAVAILABLE", totalMinor: null } }] });
  expect(selectedStateSchema.parse((await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } })).payload)).toEqual(state);
  expect(await prisma.rateObservation.count()).toBe(0);
  expect(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } })).toEqual(source);
  expect(acknowledge).toHaveBeenCalledWith(expect.anything(), job.id);
});

it("keeps classified DNS and Booking/Trip readiness failures within the consumed daily window", async () => {
  for (const [sourceKey, url, category, date] of [
    ["airbnb", "https://www.airbnb.com/rooms/123", "NAVIGATION_ERROR", "2026-10-21"],
    ["expedia", "https://www.expedia.co.nz/Fixture.h123.Hotel-Information", "NAVIGATION_ERROR", "2026-10-21"],
    ["booking", "https://www.booking.com/hotel/nz/fixture.html", "NAVIGATION_ERROR", "2026-10-21"],
    ["booking", "https://www.booking.com/hotel/nz/fixture.html", "TIMEOUT", "2026-10-22"],
    ["trip", "https://nz.trip.com/hotels/christchurch-hotel-detail-123/fixture/", "TIMEOUT", "2026-10-22"],
  ] as const) {
    const source = await prisma.dataSource.upsert({ where: { key: sourceKey }, update: {}, create: {
      key: sourceKey, name: sourceKey, providerType: "OTA", sourceType: "OTA", acquisitionMethod: "ISOLATED_FIXTURE",
      enabled: false, lifecycle: "SUSPENDED", operationalStatus: "DEGRADED", dailyBudget: 6, concurrencyLimit: 1, environments: ["PRODUCTION"],
    } });
    const fixture = selectedFixture();
    fixture.manifest.members[0]!.source = sourceKey;fixture.manifest.members[0]!.sourceUrl = url;
    fixture.manifestHash = selectedHash(fixture.manifest);
    const state = selectedStateSchema.parse({ ...fixture, cadence: { version: "dual-window-daily-v1", startsOn: "2026-10-16", dailyStartsOn: "2026-10-19", bookingBootstrapDaily: 24, bookingSteadyDaily: 20 },
      held: [{ memberId: "sample2", reason: "EXISTING_IDENTITY_HOLD" }] });
    await prisma.scheduleDefinition.update({ where: { key: SELECTED_PANEL_KEY }, data: { payload: state } });
    const at = new Date(`${date}T06:00:00Z`), progress = [{ memberId: "sample0", identityAt: at, unitExternalId: "unit0", lastQuoteAt: null, windows: [] }];
    const task = nextSelectedTasks(state, progress, new Set(), at).find(t => t.memberId === "sample0" && t.phase === "quote")!;
    const beforeJobs = await prisma.job.count();
    const job = await prisma.job.create({ data: { type: "RATE_COLLECTION", status: "RUNNING", queueName: SELECTED_PANEL_QUEUE, sourceId: source.key, payload: task, maxAttempts: 1, idempotencyKey: selectedTaskKey(task) } });
    const run = await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "RUNNING", scope: { selectedPanel: SELECTED_PANEL_KEY, phase: "quote", task } } });
    await prisma.argusExecution.create({ data: { parentJobId: job.id, collectionRunId: run.id, dataSourceId: source.id, orchestrationKey: `${category}-${sourceKey}`, argusJobId: `${category}-${sourceKey}`,
      traceId: `${category}-${sourceKey}`, connectorId: `${sourceKey}-public`, workflowId: "collect_rates", requestedUrl: url, status: "FAILED", deadlineAt: at, errorCategory: category, retryable: true } });
    capture.mockRejectedValueOnce(Error("classified technical capture failure"));
    await expect(handleSelectedPanelJob(job, { ...getEnvironment(), NODE_ENV: "production", ARGUS_API_BASE_URL: "https://api.argus.nz" })).rejects.toThrow("classified technical capture failure");
    expect(await prisma.collectionRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: "FAILED", errorCode: category });
    const after = selectedStateSchema.parse((await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } })).payload);
    expect(after).toEqual(state);
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } })).toEqual(source);
    expect(await prisma.job.count()).toBe(beforeJobs + 1);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).maxAttempts).toBe(1);
    const used = new Set([selectedTaskKey(task)]), rest = nextSelectedTasks(after, progress, used, at);
    expect(rest.some(t => selectedTaskKey(t) === selectedTaskKey(task))).toBe(false);
    expect(rest.some(t => t.memberId === task.memberId && t.checkIn !== task.checkIn)).toBe(true);
    expect(nextSelectedTasks(after, progress, used, new Date(at.getTime() + 86_400_000)).filter(t => t.memberId === task.memberId && t.phase === "quote")).toHaveLength(2);
  }
});
