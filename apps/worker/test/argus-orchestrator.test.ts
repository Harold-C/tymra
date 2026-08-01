import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";
import type { Environment } from "@tymra/config";

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  executionFind: vi.fn(),
  executionFindMany: vi.fn(),
  executionUpsert: vi.fn(),
  executionUpdate: vi.fn(),
  parentFind: vi.fn(),
  parentUpdateMany: vi.fn(),
  collectionRunUpdateMany: vi.fn(),
  submit: vi.fn(),
  getJob: vi.fn(),
  getResult: vi.fn(),
  cancel: vi.fn(),
  acknowledge: vi.fn(),
}));

vi.mock("@tymra/db", () => ({
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
      updateMany: mocks.parentUpdateMany,
    },
    collectionRun: {
      updateMany: mocks.collectionRunUpdateMany,
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
  };
});

import { DeferredJobError } from "../src/jobs/deferred-job";
import {
  acknowledgePersistedArgusResults,
  captureBrowserTaskWithDurableArgus,
  durableArgusTraceId,
  pollArgusExecution,
} from "../src/services/argus-orchestrator";

const environment = {
  ARGUS_API_BASE_URL: "https://api.argus.test",
  ARGUS_API_TOKEN: "a".repeat(32),
  ARGUS_TIMEOUT_MS: 60_000,
  ARGUS_JOB_POLL_TIMEOUT_MS: 180_000,
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

  it("returns a persisted completed result without resubmitting", async () => {
    mocks.executionFind.mockResolvedValue({
      status: "COMPLETED",
      result: completedJob(),
    });

    const response = await captureBrowserTaskWithDurableArgus(environment, input, context);

    assert.equal(response.ok, true);
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
      result: completedJob(),
    }]);
    mocks.acknowledge.mockResolvedValue({ ok: true });

    await acknowledgePersistedArgusResults(environment, "parent-1");

    assert.deepEqual(mocks.executionFindMany.mock.calls[0]?.[0], {
      where: { parentJobId: "parent-1", status: "COMPLETED" },
      select: { argusJobId: true, result: true },
    });
    assert.deepEqual(mocks.acknowledge.mock.calls[0], [environment, "argus-1", "b".repeat(64)]);
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
        data: { rates: [] },
        evidence: [],
        challenge: null,
        error: null,
      },
    }],
    error: null,
  };
}
