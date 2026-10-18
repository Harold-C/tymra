import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { bookingReferencePackages, SAMPLE_QUOTE_PACKAGE_VERSION, addNzCalendarDays, samplePackageScopeSchema, samplePackageTaskSchema } from "@tymra/domain";
import { verifiedObservationWire } from "@tymra/domain/observation-wire";
import { prisma } from "./index";

/** Append a durable derived receipt; never edits a completed run, raw evidence, schedule, or formal price. */
export async function retainSampleReferencePackages(runId: string, sourceUrl: string, nights: 1 | 2, database = prisma) {
  const run = await database.collectionRun.findUniqueOrThrow({ where: { id: runId }, include: { job: true, dataSource: true } });
  const parsed = samplePackageScopeSchema.safeParse(run.scope);
  if (!parsed.success || run.dataSource.key !== "booking" || !run.job || run.job.queueName !== "christchurch-selected-samples") return null;
  const scope = parsed.data, task = samplePackageTaskSchema.parse(run.job.payload);
  if (task.memberId !== scope.memberId || task.manifestHash !== scope.manifestHash) throw Error("REFERENCE_PACKAGE_SCOPE_MISMATCH");
  const refs = scope.evaluated.flatMap(e => e.referencePrice?.kind === "MEMBER_ONLY" ? [e.referencePrice] : []);
  if (!refs.length) return null;
  const executions = await database.argusExecution.findMany({ where: { collectionRunId: run.id, parentJobId: run.job.id,
    argusJobId: scope.verifiedWire.argusJobId, deliveryVerifiedAt: { not: null } }, take: 2 });
  if (executions.length !== 1) throw Error("REFERENCE_PACKAGE_EXECUTION_NOT_UNIQUE");
  const wire = verifiedObservationWire(executions[0].result as unknown as { job_id: string; result_sha256: string }, scope.verifiedWire) as unknown as {
    items: { result?: { evidence?: { kind: string; storageRef: string; sha256: string }[] } }[] };
  const pointers = wire.items.flatMap(item => item.result?.evidence ?? []).filter(p => p.kind === "html");
  if (pointers.length !== 1) return null;
  const pointer = pointers[0], artifacts = await database.rawArtifact.findMany({ where: { collectionRunId: run.id, artifactType: "HTML",
    payload: { path: ["pointer", "storageRef"], equals: pointer.storageRef }, contentHash: pointer.sha256,
    deletedAt: null, containsSensitiveData: false }, take: 2 });
  if (artifacts.length !== 1 || !artifacts[0].storageRef.startsWith("tymra-evidence:")) return null;
  const artifact = artifacts[0], root = await realpath(process.env.ARGUS_EVIDENCE_ROOT ?? "/argus-evidence");
  const file = await realpath(path.resolve(root, artifact.storageRef.slice("tymra-evidence:".length)));
  if (!file.startsWith(root + path.sep)) throw Error("REFERENCE_PACKAGE_EVIDENCE_OUTSIDE_ROOT");
  const info = await stat(file); if (!info.isFile() || info.size > 8 * 1024 * 1024) return null;
  const bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.contentHash) throw Error("REFERENCE_PACKAGE_EVIDENCE_HASH_MISMATCH");
  const packages = bookingReferencePackages(bytes.toString("utf8"), { sourceUrl, unitExternalId: task.unitExternalId,
    checkIn: task.checkIn, checkOut: addNzCalendarDays(task.checkIn, nights), adults: 2, children: 0, units: 1, currency: "NZD" })
    .filter(p => refs.some(r => r.amountMinor === p.amountMinor && r.ratePlanExternalId === p.ratePlanExternalId));
  if (!packages.length) return null;
  const id = `sample-reference-packages:${run.id}:${artifact.contentHash}`;
  return database.transformationRun.upsert({ where: { id }, update: {}, create: { id, dataSourceId: run.dataSourceId, collectionRunId: run.id,
    transformationType: "SAMPLE_REFERENCE_PACKAGES", transformationVersion: SAMPLE_QUOTE_PACKAGE_VERSION,
    parserVersion: SAMPLE_QUOTE_PACKAGE_VERSION, status: "COMPLETED", completedAt: new Date(), inputCount: 1, outputCount: packages.length,
    metadata: { memberId: scope.memberId, manifestHash: scope.manifestHash, unitExternalId: task.unitExternalId, checkIn: task.checkIn,
      artifactId: artifact.id, artifactHash: artifact.contentHash, resultSha256: scope.verifiedWire.resultSha256, packages },
    lineageEdges: { create: { inputType: "RAW_ARTIFACT", inputId: artifact.id, outputType: "NORMALIZED_FACT", outputId: id,
      evidenceRef: artifact.id, evidenceHash: artifact.contentHash } } } });
}
