import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect, vi } from "vitest";
import { prisma as adminPrisma, PrismaClient } from "@tymra/db";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertIsolatedTestEnvironment } from "../../../test/isolation";
import { selectedFixture, selectedMember } from "./selected-panel-fixtures";
import { acquireSelectedActivationLock } from "../src/operations/selected-panel-lock";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedStateSchema, selectedJobSchema, selectedTaskKey, selectedHash } from "../src/operations/selected-panel-plan";
import { legacyOtaDailyWhere } from "../src/operations/selected-panel-budget";
const now = new Date("2026-10-16T06:00:00Z");
const isolated = assertIsolatedTestEnvironment();
const databaseName = `${isolated.databaseName}_selected${process.pid}`;
const databaseUrl = new URL(process.env.DATABASE_URL!); databaseUrl.pathname = `/${databaseName}`;
const prisma = new PrismaClient({ datasourceUrl: databaseUrl.toString() });
vi.doMock("@tymra/db", async () => ({ ...(await vi.importActual<typeof import("@tymra/db")>("@tymra/db")), prisma }));
const { enqueueSelectedPanel, selectedCapturePermission, selectedInput } = await import("../src/operations/selected-panel-production");
const { authorizeSelectedManualReview, closeSelectedManualReview } = await import("../src/operations/selected-panel-review");
const { applySelectedReplacement, rollbackSelectedReplacement } = await import("../src/operations/selected-panel-replacement-production");
const { observationWireProof, verifiedObservationWire } = await import("../src/operations/observation-wire");
async function createIsolatedDatabase() {
  if (!/^tymra_(test|e2e)(_[a-z0-9]+)*$/.test(databaseName)) throw Error("Unsafe test database");
  await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const migration = spawnSync(process.execPath, [root + "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", root + "packages/db/prisma/schema.prisma"], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl.toString(), TYMRA_TEST_DATABASE_NAME: databaseName }, encoding: "utf8" });
  if (migration.status !== 0) throw Error("Isolated selected-panel test schema setup failed");
}
beforeAll(createIsolatedDatabase, 30000);
let historicalId: string | null = null;
let sourceBefore: Awaited<ReturnType<typeof prisma.dataSource.findMany>> = [];
beforeEach(async () => {
  sourceBefore = await prisma.dataSource.findMany({ where: { key: { in: ["booking", "expedia"] } } });
  for (const key of ["booking", "expedia"]) await prisma.dataSource.upsert({ where: { key }, update: { enabled: false, lifecycle: "SUSPENDED", operationalStatus: "DEGRADED", dailyBudget: 6, concurrencyLimit: 1, environments: ["PRODUCTION"], isDemo: false },
    create: { key, name: key, providerType: "OTA", sourceType: "OTA", acquisitionMethod: "PUBLIC_WEB_ARGUS_READ_ONLY", enabled: false, lifecycle: "SUSPENDED", operationalStatus: "DEGRADED", dailyBudget: 6, concurrencyLimit: 1, environments: ["PRODUCTION"], isDemo: false } });
  await prisma.scheduleDefinition.create({ data: { key: SELECTED_PANEL_KEY, enabled: true, queueName: SELECTED_PANEL_QUEUE, jobType: "RATE_COLLECTION", cronExpression: "daily", payload: selectedFixture() } });
});
afterEach(async () => {
  // Preserve immutable histories until this explicitly disposable suite database
  // is replaced; never disable the production CollectionRun history trigger.
  await prisma.$disconnect();
  await adminPrisma.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);
  await createIsolatedDatabase();
  historicalId = null;
});
afterAll(async () => {
  await prisma.$disconnect();
  await adminPrisma.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);
  await adminPrisma.$disconnect();
});
describe("selected collection isolated persistence", () => {
  it("replaces a held seat transactionally without repeating other completed windows, and restores controls before an image rollback", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("ACCESS_KEY_SECRET", "isolated-selected-review-signing-secret");
    vi.stubEnv("ARGUS_API_BASE_URL", "https://api.argus.nz");
    try {
      const state = selectedFixture(); state.held = [{ memberId: "sample0", reason: "MISSING_UNIT" }, { memberId: "sample2", reason: "UNRELATED_HOLD" }];
      await prisma.scheduleDefinition.update({ where: { key: SELECTED_PANEL_KEY }, data: { payload: state } });
      const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
      for (const i of [1, 2]) for (const [phase, checkIn] of [["identity", "2026-12-01"], ["quote", "2026-12-01"], ["quote", "2026-12-05"]] as const) {
        const task = selectedJobSchema.parse({ selectedPanel: SELECTED_PANEL_KEY, manifestHash: state.manifestHash,
          memberId: `sample${i}`, sourceId: "booking", phase, unitExternalId: phase === "identity" ? null : `unit${i}`,
          checkIn, round: phase === "identity" ? "2026-10-16" : "2026-10-12" });
        const job = await prisma.job.create({ data: { type: "RATE_COLLECTION", queueName: SELECTED_PANEL_QUEUE, sourceId: "booking",
          status: "SUCCEEDED", maxAttempts: 1, createdAt: now, payload: task, idempotencyKey: selectedTaskKey(task) } });
        await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", finishedAt: now,
          scope: { selectedPanel: SELECTED_PANEL_KEY, manifestHash: state.manifestHash, memberId: `sample${i}`, phase, task, evaluated: { externalId: `unit${i}` } } } });
      }
      const jobs = await prisma.job.findMany({ orderBy: { id: "asc" } }), runs = await prisma.collectionRun.findMany({ orderBy: { id: "asc" } });
      const result = await applySelectedReplacement({ expectedStateHash: selectedHash(state), changes: [{ oldMemberId: "sample0",
        replacement: { ...selectedMember(99), id: "new-home", nights: 2, accommodationType: "HOLIDAY_HOME" }, reason: "Reviewed replacement", evidenceRefs: ["reviewed-source"] }] });
      expect(result.unchangedMembers).toBe(2);
      expect(await enqueueSelectedPanel(now)).toBeNull();
      expect(await prisma.job.findMany({ orderBy: { id: "asc" } })).toEqual(jobs);
      expect(await prisma.collectionRun.findMany({ orderBy: { id: "asc" } })).toEqual(runs);
      const updated = selectedStateSchema.parse((await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } })).payload);
      const grant = await authorizeSelectedManualReview({ batch: "replacement-lineage-test", memberId: "sample2", phase: "identity", checkIn: "2026-12-01",
        unitExternalId: null, manifestHash: updated.manifestHash, expiresAt: new Date(now.getTime() + 3600_000).toISOString() }, now);
      expect(grant.status).toBe("queued");
      const manualJob = await prisma.job.findUniqueOrThrow({ where: { id: "jobId" in grant ? grant.jobId : "" } });
      const manualTask = selectedJobSchema.parse(manualJob.payload);
      expect(manualTask.manifestHash).toBe(state.manifestHash);
      await expect(selectedCapturePermission(manualJob, selectedInput(updated.manifest.members[2], manualTask, manualJob.id), source.id, now)).resolves.toBeUndefined();
      const finishedManual = await prisma.job.update({ where: { id: manualJob.id }, data: { status: "DEAD_LETTER" } });
      await expect(applySelectedReplacement({ expectedStateHash: selectedHash(state), changes: [] })).rejects.toThrow();
      await expect(rollbackSelectedReplacement(result.auditId, selectedHash(updated))).resolves.toMatchObject({ status: "passed", manifestHash: state.manifestHash, sourceCaptures: 0 });
      expect(selectedStateSchema.parse((await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } })).payload)).toEqual(state);
      expect(await prisma.job.findMany({ where: { id: { in: jobs.map(j => j.id) } }, orderBy: { id: "asc" } })).toEqual(jobs);
      expect(await prisma.job.findUniqueOrThrow({ where: { id: manualJob.id } })).toEqual(finishedManual);
      expect(await prisma.job.count()).toBe(jobs.length + 1);
      expect(await prisma.collectionRun.findMany({ orderBy: { id: "asc" } })).toEqual(runs);
      expect(await prisma.auditEvent.count({ where: { eventType: { in: ["selected_members_replaced", "selected_members_replacement_rolled_back"] } } })).toBe(2);
    } finally { vi.unstubAllEnvs(); }
  });
  it("round-trips original long coordinates through the actual Prisma transport without weakening either hash", async () => {
    const { createHash } = await import("node:crypto");
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
    const payload = { contract_version: "1.0", job_id: "isolated-wire", status: "COMPLETED", items: [{ trace_id: "trace", result: { data: { longitude: 172.60966256260872 }, evidence: [] } }] };
    const wire = { ...payload, result_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
    const execution = await prisma.argusExecution.create({ data: { orchestrationKey: "selected-test:precision", parentJobId: "precision", collectionRunId: "precision", dataSourceId: source.id,
      argusJobId: "isolated-wire", traceId: "trace", connectorId: "booking-public", workflowId: "resolve_listing", requestedUrl: "https://www.booking.com/hotel/nz/fixture.html", status: "COMPLETED", deadlineAt: now, result: wire } });
    const proof = observationWireProof(wire as never, execution.result);
    const roundtrip = await prisma.$queryRaw<Array<{ value: typeof proof }>>`SELECT ${JSON.stringify(proof)}::jsonb AS value`;
    expect(verifiedObservationWire(execution.result as never, roundtrip[0].value)).toEqual(wire);
    const tampered = JSON.parse(JSON.stringify(execution.result)); tampered.items[0].result.data.longitude = 1;
    expect(() => verifiedObservationWire(tampered, roundtrip[0].value)).toThrow("RESULT_IDENTITY_OR_HASH_MISMATCH");
  });
  it("releases only the reviewed member after identity and both exact-window deliveries, while normal members remain schedulable", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("ACCESS_KEY_SECRET", "isolated-selected-review-signing-secret");
    try {
      const state = selectedFixture(); state.held = [{ memberId: "sample0", reason: "PARSING_ERROR" }, { memberId: "sample1", reason: "OTHER_HOLD" }];
      await prisma.scheduleDefinition.update({ where: { key: SELECTED_PANEL_KEY }, data: { payload: state } });
      const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
      const common = { batch: "held-review-complete", memberId: "sample0", manifestHash: state.manifestHash, expiresAt: new Date(now.getTime() + 3600_000).toISOString() };
      for (const [phase, checkIn] of [["identity", "2026-12-01"], ["quote", "2026-12-01"], ["quote", "2026-12-05"]] as const) {
        const q = await authorizeSelectedManualReview({ ...common, phase, checkIn, unitExternalId: phase === "identity" ? null : "unit0" }, now);
        expect(q.status).toBe("queued");
        const job = await prisma.job.findUniqueOrThrow({ where: { id: "jobId" in q ? q.jobId : "" } });
        const task = selectedJobSchema.parse(job.payload);
        await expect(selectedCapturePermission(job, selectedInput(state.manifest.members[0], task, job.id), source.id, now)).resolves.toBeUndefined();
        const run = await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", finishedAt: now,
          scope: { selectedPanel: SELECTED_PANEL_KEY, manifestHash: state.manifestHash, memberId: "sample0", phase, task, evaluated: { externalId: "unit0" } } } });
        await prisma.argusExecution.create({ data: { orchestrationKey: "selected-test:" + job.id, parentJobId: job.id, collectionRunId: run.id, dataSourceId: source.id,
          argusJobId: job.id, traceId: job.id, connectorId: "booking-public", workflowId: phase === "identity" ? "resolve_listing" : "collect_rates",
          requestedUrl: state.manifest.members[0].sourceUrl, status: "COMPLETED", deadlineAt: now, deliveryVerifiedAt: now } });
        await prisma.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED" } });
        if (phase === "identity") await expect(closeSelectedManualReview(common.batch, "sample0", "b".repeat(64))).rejects.toThrow("MANUAL_REVIEW_INCOMPLETE_KEEP_HELD");
      }
      const normal = await enqueueSelectedPanel(now); expect((normal!.payload as { memberId: string }).memberId).toBe("sample2");
      expect(await closeSelectedManualReview(common.batch, "sample0", "b".repeat(64))).toEqual({ released: true });
      expect(selectedStateSchema.parse((await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } })).payload).held).toEqual([{ memberId: "sample1", reason: "OTHER_HOLD" }]);
    } finally { vi.unstubAllEnvs(); }
  });
  it("requires a signed exact-task operator grant, keeps the held roster isolated and never repeats a failed review", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCESS_KEY_SECRET", "isolated-selected-review-signing-secret");
    try {
      const state = selectedFixture();
      state.held = [{ memberId: "sample0", reason: "PARSING_ERROR" }];
      await prisma.scheduleDefinition.update({ where: { key: SELECTED_PANEL_KEY }, data: { payload: state } });
      const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
      const input = { batch: "held-review-test", memberId: "sample0", phase: "identity" as const, checkIn: "2026-12-01",
        unitExternalId: null, manifestHash: state.manifestHash, expiresAt: new Date(now.getTime() + 3600_000).toISOString() };
      const queued = await authorizeSelectedManualReview(input, now);
      expect(queued.status).toBe("queued");
      const job = await prisma.job.findUniqueOrThrow({ where: { id: "jobId" in queued ? queued.jobId : "" } });
      const task = selectedJobSchema.parse(job.payload);
      expect(job.idempotencyKey).toBe(selectedTaskKey(task) + ":manual-review:" + input.batch);
      expect(Reflect.has(task, "manualReview")).toBe(false);
      await expect(selectedCapturePermission(job, selectedInput(state.manifest.members[0], task, job.id), source.id, now)).resolves.toBeUndefined();
      expect((await authorizeSelectedManualReview(input, now)).status).toBe("existing");
      expect(await prisma.job.count({ where: { queueName: SELECTED_PANEL_QUEUE } })).toBe(1);
      await expect(selectedCapturePermission({ ...job, idempotencyKey: selectedTaskKey(task) + ":manual-review:no-receipt" },
        selectedInput(state.manifest.members[0], task, job.id), source.id, now)).rejects.toThrow("MANUAL_REVIEW_PERMISSION_CLOSED");
      await expect(selectedCapturePermission(job, selectedInput(state.manifest.members[0], task, job.id), source.id,
        new Date(now.getTime() + 3601_000))).rejects.toThrow("MANUAL_REVIEW_PERMISSION_CLOSED");
      await prisma.job.update({ where: { id: job.id }, data: { status: "DEAD_LETTER" } });
      await expect(authorizeSelectedManualReview({ ...input, checkIn: "2026-12-05" }, now)).rejects.toThrow("MANUAL_REVIEW_FAILED_NO_RETRY");
      const after = selectedStateSchema.parse((await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } })).payload);
      expect(after.held).toEqual(state.held);
      expect(after.manifestHash).toBe(state.manifestHash);
      expect(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } })).toEqual(source);
      await expect(closeSelectedManualReview(input.batch, "sample0", "a".repeat(64))).rejects.toThrow("MANUAL_REVIEW_INCOMPLETE_KEEP_HELD");
    } finally { vi.unstubAllEnvs(); }
  });
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
  it("continues after 24 dedicated captures without spending another plan's allowance or weakening serialization", async () => {
    await upgrade();
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
    for (let i = 0; i < 24; i++) {
      const task = selectedJobSchema.parse({ selectedPanel: SELECTED_PANEL_KEY, manifestHash: selectedFixture().manifestHash, memberId: "sample0", sourceId: "booking", phase: "identity", checkIn: "2026-12-01", unitExternalId: null, round: `capacity${i}` });
      const job = await prisma.job.create({ data: { type: "RATE_COLLECTION", status: "SUCCEEDED", queueName: SELECTED_PANEL_QUEUE, sourceId: "booking", payload: task, maxAttempts: 1, createdAt: i === 0 ? new Date(now.getTime() - 86400000) : now, idempotencyKey: selectedTaskKey(task) } });
      await prisma.argusExecution.create({ data: { orchestrationKey: `selected-test:dedicated${i}`, parentJobId: job.id, collectionRunId: `dedicated${i}`, dataSourceId: source.id,
        argusJobId: `dedicated${i}`, traceId: `dedicated${i}`, connectorId: "booking-public", workflowId: "resolve_listing", requestedUrl: "https://www.booking.com/", status: "COMPLETED", submittedAt: now, deadlineAt: now } });
    }
    const job = (await enqueueSelectedPanel(now))!;
    expect(job).not.toBeNull();
    await expect(selectedCapturePermission(job, selectedInput(selectedFixture().manifest.members[0], selectedJobSchema.parse(job.payload), job.id), source.id, now)).resolves.toBeUndefined();
    expect(await enqueueSelectedPanel(now)).toBeNull(); // the pending job still serializes dispatch
    const where = await legacyOtaDailyWhere(source.id, source.key, now, prisma);
    expect(await prisma.argusExecution.count({ where })).toBe(0);
    expect(await prisma.dataSource.findUnique({ where: { id: source.id } })).toEqual(source);
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
  it("isolates Expedia roster traffic while retaining two legacy executions and their unchanged source settings", async () => {
    const state = selectedFixture();
    for (const member of state.manifest.members) {
      member.source = "expedia";
      member.sourceUrl = `https://www.expedia.co.nz/Christchurch-Hotels-Selected.h${member.sourceListingId}.Hotel-Information`;
    }
    state.manifestHash = selectedHash(state.manifest);
    await prisma.scheduleDefinition.update({ where: { key: SELECTED_PANEL_KEY }, data: { payload: state } });
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "expedia" } });
    for (let i = 0; i < 8; i++) {
      const task = selectedJobSchema.parse({ selectedPanel: SELECTED_PANEL_KEY, manifestHash: state.manifestHash, memberId: "sample0", sourceId: "expedia", phase: "identity", checkIn: "2026-12-01", unitExternalId: null, round: `expedia-history${i}` });
      const job = i < 6 ? await prisma.job.create({ data: { type: "RATE_COLLECTION", queueName: SELECTED_PANEL_QUEUE, sourceId: "expedia", status: "SUCCEEDED", payload: task, maxAttempts: 1, idempotencyKey: selectedTaskKey(task), createdAt: now } }) : null;
      await prisma.argusExecution.create({ data: { orchestrationKey: `selected-test:expedia${i}`, parentJobId: job?.id ?? `legacy-expedia${i}`, collectionRunId: `expedia${i}`, dataSourceId: source.id,
        argusJobId: `expedia${i}`, traceId: `expedia${i}`, connectorId: "expedia-public", workflowId: "resolve_listing", requestedUrl: "https://www.expedia.co.nz/", status: "COMPLETED", submittedAt: now, deadlineAt: now } });
    }
    expect(await prisma.argusExecution.count({ where: await legacyOtaDailyWhere(source.id, source.key, now, prisma) })).toBe(2);
    const job = (await enqueueSelectedPanel(now))!;
    expect(job).not.toBeNull();
    await expect(selectedCapturePermission(job, selectedInput(state.manifest.members[0], selectedJobSchema.parse(job.payload), job.id), source.id, now)).resolves.toBeUndefined();
    expect(await prisma.dataSource.findUnique({ where: { id: source.id } })).toEqual(source);
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
  it("continues selected collection after six legacy captures while preserving their count and source settings", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
    for (let i = 0; i < 6; i++) await prisma.argusExecution.create({ data: { orchestrationKey: `selected-test:other${i}`, parentJobId: `other${i}`, collectionRunId: `other${i}`, dataSourceId: source.id,
      argusJobId: `other${i}`, traceId: `other${i}`, connectorId: "booking-public", workflowId: "collect_rates", requestedUrl: "https://www.booking.com/", status: "COMPLETED", submittedAt: now, deadlineAt: now } });
    const job = (await enqueueSelectedPanel(now))!;
    expect(job).not.toBeNull();
    await expect(selectedCapturePermission(job, selectedInput(selectedFixture().manifest.members[0], selectedJobSchema.parse(job.payload), job.id), source.id, now)).resolves.toBeUndefined();
    expect(await prisma.argusExecution.count({ where: await legacyOtaDailyWhere(source.id, source.key, now, prisma) })).toBe(6);
    expect(await prisma.dataSource.findUnique({ where: { id: source.id } })).toEqual(source);
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
