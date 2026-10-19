import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma, Prisma, hashOpaqueToken, type RawArtifact } from "@tymra/db";
import type { Environment } from "@tymra/config";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedStateSchema } from "./selected-panel-plan";

const EVENT = "selected_evidence_retention_executed";
const HOUR = 3_600_000;
const RESERVE_BYTES = 2 * 1024 ** 3;

// Filter protected rows before LIMIT so old diagnostics cannot starve normal expiry.
async function eligible(tx: Prisma.TransactionClient, now: Date, id?: string) {
  return tx.$queryRaw<RawArtifact[]>(Prisma.sql`
    SELECT a.* FROM "RawArtifact" a JOIN "CollectionRun" r ON r.id = a."collectionRunId"
      JOIN "Job" j ON j.id = r."jobId"
    WHERE j."queueName" = ${SELECTED_PANEL_QUEUE} AND r.scope->>'selectedPanel' = ${SELECTED_PANEL_KEY}
      AND r.status IN ('SUCCEEDED', 'FAILED') AND r."finishedAt" IS NOT NULL AND j.status NOT IN ('PENDING', 'RUNNING')
      AND r."priceCheckId" IS NULL AND r."analysisRequestId" IS NULL
      AND a."deletedAt" IS NULL AND a."expiresAt" <= ${now} AND NOT a."containsSensitiveData"
      AND a."artifactType" IN ('HTML', 'SCREENSHOT') AND a."storageRef" LIKE 'tymra-evidence:%'
      AND GREATEST(a."createdAt", r."finishedAt") <= ${now} -
        CASE WHEN r.status = 'SUCCEEDED' AND NOT a."parserFailure" THEN interval '72 hours' ELSE interval '168 hours' END
      AND EXISTS (SELECT 1 FROM "ArgusExecution" e WHERE e."collectionRunId" = r.id
        AND e."parentJobId" = j.id AND e."deliveryVerifiedAt" IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM "ArgusExecution" e WHERE e."collectionRunId" = r.id
        AND (e."deliveryVerifiedAt" IS NULL OR e.status IN ('SUBMITTED','RUNNING','WAITING_FOR_MANUAL','CANCEL_REQUESTED')))
      AND NOT EXISTS (SELECT 1 FROM "CollectionIncident" i WHERE i."collectionRunId" = r.id AND i.status IN ('OPEN','IN_PROGRESS'))
      AND NOT EXISTS (SELECT 1 FROM "ServiceBackfill" b WHERE b."collectionRunId" = r.id AND b.status IN ('QUEUED','RUNNING','FAILED'))
      AND NOT EXISTS (SELECT 1 FROM "ServiceDataRepair" repair JOIN "ExceptionCase" c
        ON c.evidence->>'serviceDataRepairId' = repair.id WHERE repair."evidenceArtifactId" = a.id AND c.status IN ('OPEN','IN_PROGRESS'))
      AND NOT EXISTS (SELECT 1 FROM "RawArtifact" other WHERE other.id <> a.id
        AND other."storageRef" = a."storageRef" AND other."deletedAt" IS NULL)
      ${id ? Prisma.sql`AND a.id = ${id}` : Prisma.empty}
    ORDER BY a."expiresAt", a.id LIMIT 100 FOR UPDATE OF a SKIP LOCKED`);
}

/** Only this plan's expired HTML/PNG. No membership cleanup, new schedule or source call. */
export async function maintainSelectedEvidence(now: Date, environment: Environment, force = false) {
  if (environment.NODE_ENV !== "production") return { ready: true, reason: "NOT_PRODUCTION" };
  if (new URL(environment.ARGUS_API_BASE_URL).hostname !== "api.argus.nz") throw Error("PRODUCTION_TARGET_REQUIRED");
  return prisma.$transaction(async tx => {
    const lock = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('selected-evidence-retention')) AS locked`;
    if (!lock[0]?.locked) return { ready: false, reason: "MAINTENANCE_ACTIVE" };
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUnique({ where: { key: SELECTED_PANEL_KEY } });
    if (!control?.enabled) return { ready: false, reason: "PLAN_DISABLED" };
    const state = selectedStateSchema.parse(control.payload);
    if (!force && state.cadence?.version !== "dual-window-daily-v1") return { ready: true, reason: "WEEKLY_UNCHANGED" };
    const previous = await tx.auditEvent.findFirst({ where: { eventType: EVENT, entityId: control.id }, orderBy: { createdAt: "desc" } });
    // Integrity/storage failures require an explicit operator repair, never an automatic retry.
    if (previous && (previous.payload as { ready?: boolean }).ready === false) return { ready: false, reason: "MANUAL_STORAGE_REVIEW_REQUIRED" };
    if (!force && previous && now.getTime() - previous.createdAt.getTime() < HOUR) return { ready: true, reason: "RECENT_SWEEP" };
    if (await tx.job.count({ where: { OR: [{ status: "RUNNING" }, { status: "PENDING", runAt: { lte: now } }] } })) {
      return { ready: false, reason: "EXISTING_WORK_PRIORITY" };
    }
    const root = await fs.realpath(environment.ARGUS_EVIDENCE_ROOT);
    const removed: { artifactId: string; hash: string; bytes: number }[] = [], failures: { artifactId: string; reason: string }[] = [];
    const candidates = await eligible(tx, now);
    for (const artifact of candidates) {
      // Recheck delivery/diagnostic/reference protections immediately before file access.
      if (!(await eligible(tx, now, artifact.id)).length) continue;
      try {
        const relative = artifact.storageRef.slice("tymra-evidence:".length), target = path.resolve(root, relative);
        if (!relative || path.isAbsolute(relative) || !target.startsWith(root + path.sep)) throw Error("INVALID_RETENTION_REFERENCE");
        const actual = await fs.realpath(target), info = await fs.lstat(target);
        if (!actual.startsWith(root + path.sep) || !info.isFile() || info.isSymbolicLink() || info.size > 10_000_000) throw Error("INVALID_RETENTION_FILE");
        const bytes = await fs.readFile(target);
        if (createHash("sha256").update(bytes).digest("hex") !== artifact.contentHash) throw Error("RETENTION_HASH_MISMATCH");
        await fs.unlink(target);
        await tx.rawArtifact.update({ where: { id: artifact.id }, data: { deletedAt: now, payload: Prisma.JsonNull } });
        removed.push({ artifactId: artifact.id, hash: artifact.contentHash, bytes: info.size });
      } catch (error) {
        failures.push({ artifactId: artifact.id, reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "EVIDENCE_MISSING" : "EVIDENCE_INTEGRITY_FAILURE" });
        break;
      }
    }
    const disk = await fs.statfs(root), freeBytes = disk.bavail * disk.bsize;
    const outcome = { ready: failures.length === 0 && freeBytes >= RESERVE_BYTES, scope: SELECTED_PANEL_KEY,
      reason: failures.length ? "EVIDENCE_INTEGRITY_FAILURE" : freeBytes < RESERVE_BYTES ? "STORAGE_RESERVE_LOW" : "PASSED",
      checkedAt: now.toISOString(), boundedRows: candidates.length, removed, failures, freeBytes, reserveBytes: RESERVE_BYTES,
      rawArtifactsDeleted: removed.length, physicalFilesDeleted: removed.length, sourceCaptures: 0 };
    await tx.auditEvent.create({ data: { eventType: EVENT, entityType: "ScheduleDefinition", entityId: control.id, createdAt: now,
      payload: outcome, eventHash: hashOpaqueToken(JSON.stringify(outcome), environment.ACCESS_KEY_SECRET) } });
    return outcome;
  }, { timeout: 120_000 });
}
