import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getEnvironment, type Environment } from "@tymra/config";
import { hashOpaqueToken, prisma, Prisma } from "@tymra/db";

export async function cleanupExpiredEvidence(now: Date, environment: Environment = getEnvironment()) {
  const candidates = await prisma.rawArtifact.findMany({ where: { expiresAt: { lte: now }, deletedAt: null }, orderBy: { expiresAt: "asc" }, take: 500 });
  let deleted = 0, filesDeleted = 0, protectedCount = 0, failures = 0;
  for (const artifact of candidates) {
    const [run, executionPending, repair] = await Promise.all([
      prisma.collectionRun.findUnique({ where: { id: artifact.collectionRunId }, include: { incident: true } }),
      prisma.argusExecution.count({ where: { collectionRunId: artifact.collectionRunId, OR: [{ status: { in: ["SUBMITTED", "RUNNING", "WAITING_FOR_MANUAL", "CANCEL_REQUESTED"] } }, { status: "COMPLETED", deliveryVerifiedAt: null }] } }),
      prisma.serviceDataRepair.findFirst({ where: { evidenceArtifactId: artifact.id }, select: { id: true } }),
    ]);
    const openRepair = repair ? await prisma.exceptionCase.count({ where: { evidence: { path: ["serviceDataRepairId"], equals: repair.id }, status: { in: ["OPEN", "IN_PROGRESS"] } } }) : 0;
    const backfill = await prisma.serviceBackfill.count({ where: { collectionRunId: artifact.collectionRunId, status: { in: ["QUEUED", "RUNNING", "FAILED"] } } });
    if (!run || ["PENDING", "RUNNING"].includes(run.status) || (run.incident && ["OPEN", "IN_PROGRESS"].includes(run.incident.status)) || executionPending || openRepair || backfill) { protectedCount += 1; continue; }
    try {
      const sameFile = await prisma.rawArtifact.count({ where: { storageRef: artifact.storageRef, id: { not: artifact.id }, deletedAt: null } });
      let removedFile = false;
      if (artifact.storageRef.startsWith("tymra-evidence:") && !sameFile) {
        const relative = artifact.storageRef.slice("tymra-evidence:".length);
        if (!relative || path.isAbsolute(relative)) throw new Error("INVALID_RETENTION_REFERENCE");
        const root = await fs.realpath(environment.ARGUS_EVIDENCE_ROOT);
        const target = path.resolve(root, relative);
        if (!target.startsWith(`${root}${path.sep}`)) throw new Error("INVALID_RETENTION_REFERENCE");
        try {
          const actual = await fs.realpath(target); if (!actual.startsWith(`${root}${path.sep}`)) throw new Error("INVALID_RETENTION_REFERENCE");
          const stat = await fs.lstat(actual); if (!stat.isFile() || stat.size > 10000000) throw new Error("INVALID_RETENTION_FILE");
          const content = await fs.readFile(actual); if (createHash("sha256").update(content).digest("hex") !== artifact.contentHash) throw new Error("RETENTION_HASH_MISMATCH");
          await fs.unlink(actual); removedFile = true;
        } catch(error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      } else if (!artifact.storageRef.startsWith("postgres:RawArtifact:") && !artifact.storageRef.startsWith("tymra-evidence:")) throw new Error("UNSUPPORTED_RETENTION_REFERENCE");
      await prisma.rawArtifact.update({ where: { id: artifact.id }, data: { deletedAt: now, payload: Prisma.JsonNull } });
      deleted += 1; if (removedFile) filesDeleted += 1;
    } catch { failures += 1; }
  }
  const outcome = { rawArtifactsDeleted: deleted, physicalFilesDeleted: filesDeleted, protectedArtifacts: protectedCount, failures, checkedAt: now.toISOString(), boundedRows: candidates.length };
  await prisma.auditEvent.create({ data: { eventType: "evidence_retention_executed", entityType: "CollectionRuntime", entityId: environment.NODE_ENV, payload: outcome, eventHash: hashOpaqueToken(`retention:${now.toISOString()}:${JSON.stringify(outcome)}`, environment.ACCESS_KEY_SECRET) } });
  return outcome;
}
