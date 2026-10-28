import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "@tymra/config";

const mocks = vi.hoisted(() => ({
  executions: vi.fn(), artifacts: vi.fn(), execution: vi.fn(), run: vi.fn(), upsert: vi.fn(), update: vi.fn(), transaction: vi.fn(), result: vi.fn(),
}));
vi.mock("@tymra/db", () => ({ Prisma: { DbNull: "DbNull" }, prisma: {
  argusExecution: { findMany: mocks.executions }, rawArtifact: { findMany: mocks.artifacts }, $transaction: mocks.transaction,
} }));
vi.mock("../src/clients/argus-client", () => ({ getArgusJobResult: mocks.result }));
import { persistFailedArgusEvidence } from "../src/services/failed-argus-evidence";
import { verifiedObservationWire } from "@tymra/domain/observation-wire";

const environment = { NODE_ENV: "production" } as Environment;
function fixture() {
  const evidence = ["html", "screenshot"].map(kind => ({ kind, traceId: "mot-failed", storageRef: `argus-evidence:results/argus/mot-failed/${kind === "html" ? "page.html" : "screenshot.png"}`,
    sha256: createHash("sha256").update(kind).digest("hex"), containsSensitiveData: false, sizeBytes: kind.length }));
  const payload = { job_id: "argus-job-1", status: "FAILED", items: [{ trace_id: "mot-failed", result: {
    trace_id: "mot-failed", readonly_only: true, external_side_effects_performed: false, evidence,
  } }] };
  const wire = { ...payload, result_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  const execution = { id: "execution-1", argusJobId: wire.job_id, parentJobId: "parent-1", collectionRunId: "run-1", dataSourceId: "source-1",
    status: "FAILED", traceId: "mot-failed", deliveryVerifiedAt: null, result: structuredClone(wire) };
  return { wire, execution, evidence };
}
function sign(wire: ReturnType<typeof fixture>["wire"]) {
  const { result_sha256: _hash, ...payload } = wire;
  wire.result_sha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
beforeEach(() => {
  vi.resetAllMocks();
  const { wire, execution } = fixture();
  mocks.executions.mockResolvedValue([execution]); mocks.execution.mockResolvedValue(execution);
  mocks.artifacts.mockResolvedValue([]); mocks.result.mockResolvedValue({ ok: true, job: wire });
  mocks.run.mockResolvedValue({ id: "run-1", jobId: "parent-1", dataSourceId: "source-1", status: "FAILED", scope: { originalFailure: "TIMEOUT" } });
  mocks.transaction.mockImplementation(async fn => fn({ argusExecution: { findUniqueOrThrow: mocks.execution },
    collectionRun: { findUniqueOrThrow: mocks.run, update: mocks.update }, rawArtifact: { upsert: mocks.upsert } }));
});

describe("failed Argus diagnostic evidence registration", () => {
  it("registers both timeout artifacts with original hashes and a verifiable wire receipt, preserving the failed run", async () => {
    await persistFailedArgusEvidence(environment, "parent-1");
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    for (const [input] of mocks.upsert.mock.calls) {
      expect(input.update).toEqual({});
      expect(input.create).toMatchObject({ collectionRunId: "run-1", dataSourceId: "source-1", parserFailure: true, containsSensitiveData: false });
      expect(input.create.expiresAt.getTime()).toBeGreaterThan(Date.now() + 167 * 3600_000);
    }
    const update = mocks.update.mock.calls[0]![0].data;
    expect(update).not.toHaveProperty("status");
    expect(update.scope.originalFailure).toBe("TIMEOUT");
    expect(verifiedObservationWire(fixture().wire, update.scope.failedArgusWireProofs["execution-1"])).toEqual(fixture().wire);
    expect(mocks.result.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[0]!);
  });
  it("does not refetch evidence already registered for this exact trace and hash", async () => {
    mocks.artifacts.mockResolvedValue(fixture().evidence.map(p => ({ storageRef: p.storageRef, contentHash: p.sha256 })));
    await persistFailedArgusEvidence(environment, "parent-1");
    expect(mocks.result).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each(["unavailable", "changed", "invalid-wire-hash", "wrong-trace", "sensitive", "artifact-hash", "run-scope", "execution-race"])("refuses %s before writing any artifact", async phase => {
    const { wire, execution } = fixture();
    if (phase === "unavailable") mocks.result.mockResolvedValue({ ok: false, httpStatus: 410 });
    if (phase === "changed") { wire.items[0]!.result.evidence[0]!.sizeBytes++; sign(wire); mocks.result.mockResolvedValue({ ok: true, job: wire }); }
    if (["invalid-wire-hash", "wrong-trace", "sensitive"].includes(phase)) {
      if (phase === "wrong-trace") wire.items[0]!.trace_id = "wrong-trace";
      if (phase === "sensitive") wire.items[0]!.result.evidence[0]!.containsSensitiveData = true;
      sign(wire);
      if (phase === "invalid-wire-hash") wire.result_sha256 = "f".repeat(64);
      execution.result = structuredClone(wire); mocks.executions.mockResolvedValue([execution]); mocks.result.mockResolvedValue({ ok: true, job: wire });
    }
    if (phase === "artifact-hash") mocks.artifacts.mockResolvedValue([{ storageRef: wire.items[0]!.result.evidence[0]!.storageRef, contentHash: "f".repeat(64) }]);
    if (phase === "run-scope") mocks.run.mockResolvedValue({ id: "run-1", jobId: "another-parent", dataSourceId: "source-1", status: "FAILED", scope: {} });
    if (phase === "execution-race") mocks.execution.mockResolvedValue({ ...execution, status: "COMPLETED" });
    const expected: Record<string, RegExp> = {
      unavailable: /FAILED_ARGUS_WIRE_UNAVAILABLE/, changed: /FAILED_ARGUS_WIRE_CHANGED/,
      "invalid-wire-hash": /RESULT_IDENTITY_OR_HASH_MISMATCH/, "wrong-trace": /FAILED_ARGUS_IDENTITY_MISMATCH/,
      sensitive: /UNSAFE_FAILED_ARGUS_EVIDENCE/, "artifact-hash": /FAILED_ARGUS_ARTIFACT_HASH_CHANGED/,
      "run-scope": /FAILED_ARGUS_RETENTION_SCOPE_CHANGED/, "execution-race": /FAILED_ARGUS_RETENTION_SCOPE_CHANGED/,
    };
    await expect(persistFailedArgusEvidence(environment, "parent-1")).rejects.toThrow(expected[phase]);
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
});
