import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import type { Environment } from "@tymra/config";

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  executionFind: vi.fn(),
  executionFindMany: vi.fn(),
  executionUpsert: vi.fn(),
  executionUpdate: vi.fn(),
  parentFind: vi.fn(),
  parentFindMany: vi.fn(),
  parentUpdateMany: vi.fn(),
  collectionRunFindMany: vi.fn(),
  collectionRunUpdateMany: vi.fn(),
  rawArtifactFindMany: vi.fn(),
  rawArtifactCount: vi.fn(),
  rawArtifactUpdateMany: vi.fn(),
  submit: vi.fn(),
  getJob: vi.fn(),
  getResult: vi.fn(),
  cancel: vi.fn(),
  acknowledge: vi.fn(),
  downloadEvidence: vi.fn(),
}));

vi.mock("@tymra/db", () => ({
  Prisma: { DbNull: "DbNull" },
  enqueueJob: mocks.enqueueJob,
  prisma: {
    argusExecution: {
      findUnique: mocks.executionFind,
      findUniqueOrThrow: mocks.executionFind,
      findMany: mocks.executionFindMany,
      upsert: mocks.executionUpsert,
      update: mocks.executionUpdate,
    },
    job: {
      findUnique: mocks.parentFind,
      findMany: mocks.parentFindMany,
      updateMany: mocks.parentUpdateMany,
    },
    collectionRun: {
      findMany: mocks.collectionRunFindMany,
      updateMany: mocks.collectionRunUpdateMany,
    },
    rawArtifact: {
      findMany: mocks.rawArtifactFindMany,
      count: mocks.rawArtifactCount,
      updateMany: mocks.rawArtifactUpdateMany,
    },
  },
}));

vi.mock("../src/clients/argus-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/clients/argus-client")>();
  return {
    ...original,
    submitArgusCapture: mocks.submit,
    getArgusJob: mocks.getJob,
    getArgusJobResult: mocks.getResult,
    cancelArgusJob: mocks.cancel,
    acknowledgeArgusJobResult: mocks.acknowledge,
    downloadArgusEvidence: mocks.downloadEvidence,
  };
});

import { DeferredJobError } from "../src/jobs/deferred-job";
import {
  acknowledgePersistedArgusResults,
  captureBrowserTaskWithDurableArgus,
  durableArgusTraceId,
  finalizeDirectArgusDelivery,
  pollArgusExecution,
} from "../src/services/argus-orchestrator";

const environment = {
  ARGUS_API_BASE_URL: "https://api.argus.test",
  ARGUS_API_TOKEN: "a".repeat(32),
  ARGUS_TIMEOUT_MS: 60_000,
  ARGUS_JOB_POLL_TIMEOUT_MS: 180_000,
  ARGUS_EVIDENCE_ROOT: "/tmp/tymra-argus-evidence-test",
} as Environment;
const context = { parentJobId: "parent-1", collectionRunId: "run-1", dataSourceId: "source-1" };
const input = {
  traceId: "rbnz-fx-collect_exchange_rates-stable",
  connectorId: "rbnz-fx" as const,
  workflowId: "collect_exchange_rates" as const,
  url: "https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rawArtifactFindMany.mockResolvedValue([]);
  mocks.rawArtifactCount.mockResolvedValue(0);
  mocks.collectionRunFindMany.mockResolvedValue([]);
});

afterEach(async () => {
  await rm(environment.ARGUS_EVIDENCE_ROOT, { recursive: true, force: true });
});

describe("durable Argus orchestration", () => {
  it("submits once, persists the remote ID, enqueues a poller and releases the parent", async () => {
    mocks.executionFind.mockResolvedValue(null);
    mocks.submit.mockResolvedValue({ ok: true, job: { job_id: "argus-1", status: "QUEUED" } });
    mocks.executionUpsert.mockImplementation(async ({ create }) => ({ id: "execution-1", ...create }));

    await assert.rejects(
      captureBrowserTaskWithDurableArgus(environment, input, context),
      (error: unknown) => error instanceof DeferredJobError && error.resumeAt instanceof Date,
    );

    assert.equal(mocks.submit.mock.calls.length, 1);
    assert.equal(mocks.executionUpsert.mock.calls[0]?.[0].create.argusJobId, "argus-1");
    assert.deepEqual(mocks.enqueueJob.mock.calls[0]?.[0], {
      type: "ARGUS_JOB_POLL",
      queueName: "argus-job-poll",
      payload: { executionId: "execution-1" },
      idempotencyKey: "argus-poll:execution-1",
      correlationId: "parent-1",
      collectionRunId: "run-1",
      maxAttempts: 3,
    });
  });

  it("does not submit another member capture when the plan noVNC capacity is occupied", async () => {
    mocks.executionFind.mockResolvedValue(null);
    mocks.parentFind.mockResolvedValue({
      status: "PENDING",
      priceCheck: { customerUserId: "customer-1", customerUser: { membership: { plan: "FREE" } } },
    });
    mocks.parentFindMany.mockResolvedValue([{ id: "parent-1" }]);
    mocks.executionFindMany.mockResolvedValue([{
      result: {
        challenge: {
          manual_session: { expires_at: new Date(Date.now() + 60_000).toISOString() },
        },
      },
    }]);

    const response = await captureBrowserTaskWithDurableArgus(environment, input, context);

    assert.deepEqual(response, {
      ok: false,
      httpStatus: 429,
      message: "The membership already has the maximum number of active manual browser sessions",
    });
    assert.equal(mocks.submit.mock.calls.length, 0);
  });

  it("returns a persisted completed result without resubmitting", async () => {
    mocks.executionFind.mockResolvedValue({
      status: "COMPLETED",
      result: completedJob(),
    });

    const response = await captureBrowserTaskWithDurableArgus(environment, input, context);

    assert.equal(response.ok, true);
    assert.equal(mocks.submit.mock.calls.length, 0);
  });

  it("returns a persisted failed challenge result so evidence and cooldown handling can complete", async () => {
    const result = completedJob();
    result.status = "FAILED";
    result.items[0]!.status = "FAILED";
    result.items[0]!.result.ok = false;
    result.items[0]!.result.status = "challenge";
    result.items[0]!.result.data = null;
    result.items[0]!.result.challenge = { kind: "access_challenge_detected" };
    mocks.executionFind.mockResolvedValue({ status: "FAILED", result });

    const response = await captureBrowserTaskWithDurableArgus(environment, input, context);

    assert.equal(response.ok, true);
    assert.equal(response.ok && response.payload.status, "manual_required");
    assert.equal(mocks.submit.mock.calls.length, 0);
  });

  it("preserves parent cancellation when the remote result completed concurrently", async () => {
    const cancelledAt = new Date();
    mocks.executionFind.mockResolvedValue({
      status: "COMPLETED",
      result: completedJob(),
    });
    mocks.parentFind.mockResolvedValue({ status: "CANCELLED", completedAt: cancelledAt });

    await assert.rejects(
      captureBrowserTaskWithDurableArgus(environment, input, context),
      (error: unknown) => error instanceof DeferredJobError && error.message.includes("was cancelled"),
    );

    assert.equal(mocks.submit.mock.calls.length, 0);
    assert.equal(mocks.collectionRunUpdateMany.mock.calls[0]?.[0].where.status.not, "CANCELLED");
    assert.deepEqual(mocks.collectionRunUpdateMany.mock.calls[0]?.[0].where.OR, [
      { status: { in: ["PENDING", "RUNNING"] } },
      { finishedAt: { gte: cancelledAt } },
    ]);
  });

  it("polls once and defers itself while Argus is still running", async () => {
    mocks.executionFind.mockResolvedValue(activeExecution());
    mocks.parentFind.mockResolvedValue({ status: "PENDING" });
    mocks.getJob.mockResolvedValue({ ok: true, job: { job_id: "argus-1", status: "RUNNING" } });

    await assert.rejects(
      pollArgusExecution(environment, "execution-1"),
      (error: unknown) => error instanceof DeferredJobError,
    );

    assert.equal(mocks.getJob.mock.calls.length, 1);
    assert.equal(mocks.getResult.mock.calls.length, 0);
    assert.equal(mocks.executionUpdate.mock.calls[0]?.[0].data.status, "RUNNING");
  });

  it("stores the terminal result and wakes the parked parent", async () => {
    mocks.executionFind.mockResolvedValue(activeExecution());
    mocks.parentFind.mockResolvedValue({ status: "PENDING" });
    mocks.getJob.mockResolvedValue({ ok: true, job: { job_id: "argus-1", status: "COMPLETED" } });
    mocks.getResult.mockResolvedValue({ ok: true, job: completedJob() });

    await pollArgusExecution(environment, "execution-1");

    assert.equal(mocks.executionUpdate.mock.calls[0]?.[0].data.status, "COMPLETED");
    assert.deepEqual(mocks.parentUpdateMany.mock.calls[0]?.[0].where, {
      id: "parent-1",
      status: "PENDING",
      lastErrorCode: "WAITING_EXTERNAL",
    });
  });

  it("acknowledges completed results only after their hash is persisted locally", async () => {
    mocks.executionFindMany.mockResolvedValue([{
      argusJobId: "argus-1",
      collectionRunId: "run-1",
      result: completedJob(),
    }]);
    mocks.acknowledge.mockResolvedValue({ ok: true });

    await acknowledgePersistedArgusResults(environment, "parent-1");

    assert.deepEqual(mocks.executionFindMany.mock.calls[0]?.[0], {
      where: { parentJobId: "parent-1", status: { in: ["COMPLETED", "FAILED"] }, result: { not: "DbNull" } },
      select: { argusJobId: true, collectionRunId: true, result: true },
    });
    assert.deepEqual(mocks.acknowledge.mock.calls[0], [environment, "argus-1", "b".repeat(64)]);
  });

  it("verifies direct delivery purge after acknowledgement", async () => {
    const job = completedJob();
    mocks.acknowledge.mockResolvedValue({ ok: true });
    mocks.getResult.mockResolvedValue({ ok: false, httpStatus: 410, message: "purged" });

    await finalizeDirectArgusDelivery(environment, "run-1", {
      jobId: job.job_id,
      resultSha256: job.result_sha256,
      job,
    }, true);

    assert.deepEqual(mocks.acknowledge.mock.calls[0], [environment, "argus-1", "b".repeat(64)]);
    assert.deepEqual(mocks.getResult.mock.calls[0], [environment, "argus-1"]);
  });

  it("downloads and verifies retained evidence before acknowledging Argus", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tymra-argus-evidence-"));
    const content = Buffer.from("verified evidence", "utf8");
    const sha256 = "d".repeat(64);
    const pointer = {
      kind: "download" as const,
      evidenceId: "report",
      filename: "airport-monthly.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sourceUrl: "https://example.test/airport-monthly.xlsx",
      traceId: input.traceId,
      relativePath: `results/argus/${input.traceId}/airport-monthly.xlsx`,
      storageRef: `argus-evidence:results/argus/${input.traceId}/airport-monthly.xlsx`,
      sha256,
      sizeBytes: content.byteLength,
      containsSensitiveData: false,
      createdAt: "2026-08-02T00:00:00.000Z",
    };
    const result = completedJob();
    result.items[0]!.result.evidence = [pointer];
    mocks.executionFindMany.mockResolvedValue([{ argusJobId: "argus-1", collectionRunId: "run-1", result }]);
    mocks.rawArtifactFindMany.mockResolvedValue([{ id: "artifact-1", storageRef: pointer.storageRef, contentHash: sha256 }]);
    mocks.downloadEvidence.mockResolvedValue(content);
    mocks.rawArtifactUpdateMany.mockResolvedValue({ count: 1 });
    mocks.acknowledge.mockResolvedValue({ ok: true });

    await acknowledgePersistedArgusResults({ ...environment, ARGUS_EVIDENCE_ROOT: root }, "parent-1");

    assert.deepEqual(await readFile(path.join(root, input.traceId, "downloads", "airport-monthly.xlsx")), content);
    assert.equal(mocks.rawArtifactUpdateMany.mock.calls[0]?.[0].data.storageRef, `tymra-evidence:${input.traceId}/downloads/airport-monthly.xlsx`);
    assert.ok(mocks.rawArtifactUpdateMany.mock.invocationCallOrder[0]! < mocks.acknowledge.mock.invocationCallOrder[0]!);
    await rm(root, { recursive: true, force: true });
  });

  it("resumes evidence acknowledgement across retry collection runs", async () => {
    const pointer = {
      kind: "html" as const,
      traceId: input.traceId,
      relativePath: `results/argus/${input.traceId}/page.html`,
      storageRef: `argus-evidence:results/argus/${input.traceId}/page.html`,
      sha256: "e".repeat(64),
      sizeBytes: 8,
      containsSensitiveData: false,
      createdAt: "2026-08-02T00:00:00.000Z",
    };
    const result = completedJob();
    result.items[0]!.result.evidence = [pointer];
    const localStorageRef = `tymra-evidence:${input.traceId}/page.html`;
    mocks.executionFindMany.mockResolvedValue([{ argusJobId: "argus-1", collectionRunId: "run-1", result }]);
    mocks.collectionRunFindMany.mockResolvedValue([{ id: "run-1" }, { id: "run-2" }]);
    mocks.rawArtifactFindMany.mockResolvedValue([
      { id: "artifact-1", storageRef: localStorageRef, contentHash: pointer.sha256 },
      { id: "artifact-2", storageRef: pointer.storageRef, contentHash: pointer.sha256 },
    ]);
    mocks.downloadEvidence.mockResolvedValue(Buffer.from("evidence"));
    mocks.rawArtifactUpdateMany.mockResolvedValue({ count: 1 });
    mocks.acknowledge.mockResolvedValue({ ok: true });

    await acknowledgePersistedArgusResults(environment, "parent-1");

    assert.equal(mocks.downloadEvidence.mock.calls.length, 0);
    assert.deepEqual(mocks.rawArtifactUpdateMany.mock.calls[0]?.[0].where.id.in, ["artifact-2"]);
    assert.deepEqual(mocks.acknowledge.mock.calls[0], [environment, "argus-1", "b".repeat(64)]);
  });

  it("retains each execution's evidence independently before acknowledging a multi-capture run", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tymra-argus-evidence-multi-"));
    const listing = completedJob();
    const detail = completedJob();
    const listingPointer = {
      kind: "html",
      traceId: "listing-trace",
      relativePath: "listing-trace/page.html",
      storageRef: "argus-evidence:listing-trace/page.html",
      sha256: "1".repeat(64),
      sizeBytes: 7,
      containsSensitiveData: false,
      createdAt: "2026-08-02T00:00:00.000Z",
    };
    const detailPointer = {
      ...listingPointer,
      traceId: "detail-trace",
      relativePath: "detail-trace/page.html",
      storageRef: "argus-evidence:detail-trace/page.html",
      sha256: "2".repeat(64),
    };
    listing.items[0]!.result.evidence = [listingPointer];
    detail.items[0]!.result.evidence = [detailPointer];
    mocks.executionFindMany.mockResolvedValue([
      { argusJobId: "argus-listing", collectionRunId: "run-1", result: listing },
      { argusJobId: "argus-detail", collectionRunId: "run-1", result: detail },
    ]);
    mocks.rawArtifactFindMany
      .mockResolvedValueOnce([{ id: "listing-artifact", storageRef: listingPointer.storageRef, contentHash: listingPointer.sha256 }])
      .mockResolvedValueOnce([{ id: "detail-artifact", storageRef: detailPointer.storageRef, contentHash: detailPointer.sha256 }]);
    mocks.downloadEvidence
      .mockResolvedValueOnce(Buffer.from("listing"))
      .mockResolvedValueOnce(Buffer.from("detail!"));
    mocks.rawArtifactUpdateMany.mockResolvedValue({ count: 1 });
    mocks.acknowledge.mockResolvedValue({ ok: true });

    await acknowledgePersistedArgusResults({ ...environment, ARGUS_EVIDENCE_ROOT: root }, "parent-1");

    assert.deepEqual(
      mocks.rawArtifactFindMany.mock.calls.map(([query]) => query.where.storageRef.in),
      [
        [listingPointer.storageRef, "tymra-evidence:listing-trace/page.html"],
        [detailPointer.storageRef, "tymra-evidence:detail-trace/page.html"],
      ],
    );
    assert.deepEqual(mocks.acknowledge.mock.calls.map((call) => call[1]), ["argus-listing", "argus-detail"]);
    assert.ok(mocks.rawArtifactUpdateMany.mock.invocationCallOrder.at(-1)! < mocks.acknowledge.mock.invocationCallOrder[0]!);
    await rm(root, { recursive: true, force: true });
  });

  it("does not acknowledge when a persisted evidence pointer is missing from the Argus result", async () => {
    mocks.executionFindMany.mockResolvedValue([{ argusJobId: "argus-1", collectionRunId: "run-1", result: completedJob() }]);
    mocks.rawArtifactFindMany.mockResolvedValue([{ id: "artifact-1", storageRef: "argus-evidence:missing/page.html", contentHash: "e".repeat(64) }]);
    mocks.rawArtifactCount.mockResolvedValue(1);

    await assert.rejects(
      acknowledgePersistedArgusResults(environment, "parent-1"),
      /1 Argus evidence artifacts remain remote before ACK/u,
    );

    assert.equal(mocks.acknowledge.mock.calls.length, 0);
  });

  it("propagates parent cancellation to Argus", async () => {
    mocks.executionFind.mockResolvedValue(activeExecution());
    mocks.parentFind.mockResolvedValue({ status: "CANCELLED", completedAt: new Date() });
    mocks.getJob.mockResolvedValue({ ok: true, job: { job_id: "argus-1", status: "CANCELLED" } });
    mocks.getResult.mockResolvedValue({
      ok: true,
      job: { job_id: "argus-1", status: "CANCELLED", items: [], error: null },
    });

    await pollArgusExecution(environment, "execution-1");

    assert.deepEqual(mocks.cancel.mock.calls[0], [environment, "argus-1"]);
    assert.equal(mocks.executionUpdate.mock.calls.at(-1)?.[0].data.status, "CANCELLED");
    assert.equal(mocks.collectionRunUpdateMany.mock.calls[0]?.[0].where.jobId, "parent-1");
    assert.equal(mocks.collectionRunUpdateMany.mock.calls[0]?.[0].where.status.not, "CANCELLED");
    assert.equal(mocks.collectionRunUpdateMany.mock.calls[0]?.[0].data.status, "CANCELLED");
  });

  it("uses a stable trace ID for the same parent capture", () => {
    const first = durableArgusTraceId("parent-1", input.connectorId, input.workflowId, input.url);
    const second = durableArgusTraceId("parent-1", input.connectorId, input.workflowId, input.url);
    assert.equal(first, second);
    assert.notEqual(first, durableArgusTraceId("parent-2", input.connectorId, input.workflowId, input.url));
  });
});

function activeExecution() {
  return {
    id: "execution-1",
    parentJobId: "parent-1",
    argusJobId: "argus-1",
    status: "RUNNING",
    deadlineAt: new Date(Date.now() + 60_000),
  };
}

function completedJob() {
  return {
    job_id: "argus-1",
    status: "COMPLETED",
    result_sha256: "b".repeat(64),
    items: [{
      trace_id: input.traceId,
      status: "COMPLETED",
      error_category: null,
      result: {
        contract_version: "1.0",
        ok: true,
        status: "success",
        trace_id: input.traceId,
        connector_id: input.connectorId,
        workflow_id: input.workflowId,
        readonly_only: true,
        external_side_effects_performed: false,
        page: null,
        data: {
          data_schema: "rbnz-fx.collect_exchange_rates",
          schema_version: "1.0.0",
          rates: [],
        },
        evidence: [],
        challenge: null,
        error: null,
      },
    }],
    error: null,
  };
}
