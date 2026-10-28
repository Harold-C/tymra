import { createHash } from "node:crypto";
import type { Environment } from "@tymra/config";
import { prisma, Prisma } from "@tymra/db";
import { observationCanonicalHash, observationWireProof, verifiedObservationWire } from "@tymra/domain/observation-wire";
import { getArgusJobResult, type ArgusJobResult } from "../clients/argus-client";

/** Register failure diagnostics before the normal retain/hash/fsync/ACK path. */
export async function persistFailedArgusEvidence(environment: Environment, parentJobId: string) {
  const executions = await prisma.argusExecution.findMany({ where: {
    parentJobId, status: "FAILED", deliveryVerifiedAt: null, result: { not: Prisma.DbNull },
  } });
  for (const execution of executions) {
    const persisted = execution.result as unknown as ArgusJobResult;
    const declared = persisted.items?.flatMap(item => item.result?.evidence ?? []) ?? [];
    if (!declared.length) continue;
    const existing = await prisma.rawArtifact.findMany({ where: { collectionRunId: execution.collectionRunId, deletedAt: null } });
    const matched = (pointer: typeof declared[number]) => {
      const relative = pointer.kind === "download" ? `downloads/${pointer.filename}` : pointer.kind === "html" ? "page.html" : "screenshot.png";
      const local = `tymra-evidence:${pointer.traceId}/${relative}`;
      return existing.some(a => (a.storageRef === pointer.storageRef || a.storageRef === local) && a.contentHash === pointer.sha256);
    };
    if (declared.every(matched)) continue;

    // JSONB cannot preserve original byte order: refetch and verify the exact
    // result, then compare its canonical contents to the already persisted wire.
    const response = await getArgusJobResult(environment, execution.argusJobId);
    if (!response.ok) throw Error("FAILED_ARGUS_WIRE_UNAVAILABLE");
    const proof = observationWireProof(response.job, persisted);
    if (observationCanonicalHash(response.job) !== observationCanonicalHash(persisted)) throw Error("FAILED_ARGUS_WIRE_CHANGED");
    const wire = verifiedObservationWire(persisted, proof);
    if (wire.job_id !== execution.argusJobId || wire.status !== "FAILED" || wire.items.length !== 1
      || wire.items[0]?.trace_id !== execution.traceId) throw Error("FAILED_ARGUS_IDENTITY_MISMATCH");
    const result = wire.items[0].result;
    if (!result || result.trace_id !== execution.traceId || result.readonly_only !== true
      || result.external_side_effects_performed !== false) throw Error("UNSAFE_FAILED_ARGUS_CAPTURE");
    for (const pointer of result.evidence) {
      if (pointer.traceId !== execution.traceId || pointer.containsSensitiveData !== false) throw Error("UNSAFE_FAILED_ARGUS_EVIDENCE");
      if (existing.some(a => a.storageRef === pointer.storageRef && a.contentHash !== pointer.sha256)) throw Error("FAILED_ARGUS_ARTIFACT_HASH_CHANGED");
    }
    await prisma.$transaction(async tx => {
      const current = await tx.argusExecution.findUniqueOrThrow({ where: { id: execution.id } });
      const run = await tx.collectionRun.findUniqueOrThrow({ where: { id: execution.collectionRunId } });
      if (current.status !== "FAILED" || current.parentJobId !== parentJobId || current.deliveryVerifiedAt
        || observationCanonicalHash(current.result) !== observationCanonicalHash(persisted)
        || run.status !== "FAILED" || run.jobId !== parentJobId || run.dataSourceId !== execution.dataSourceId) throw Error("FAILED_ARGUS_RETENTION_SCOPE_CHANGED");
      for (const pointer of result.evidence.filter(p => !matched(p))) {
        const id = `failed-argus-${createHash("sha256").update(`${execution.id}\0${pointer.storageRef}`).digest("hex").slice(0, 32)}`;
        await tx.rawArtifact.upsert({ where: { id }, update: {}, create: {
          id, collectionRunId: run.id, dataSourceId: execution.dataSourceId, artifactType: pointer.kind.toUpperCase(),
          storageRef: pointer.storageRef, contentHash: pointer.sha256, parserFailure: true, containsSensitiveData: false,
          payload: { pointer, failedArgusExecutionId: execution.id, verifiedWire: proof } as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + 168 * 3600_000),
        } });
      }
      // Terminal CollectionRun rows are immutable. Keep the receipt with the new
      // diagnostic artifacts instead of rewriting the original failed history.
    });
  }
}
