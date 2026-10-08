import { createHash } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { historicalFactSchema, historicalImportSchema } from "@tymra/domain";
import type { Prisma } from "@prisma/client";
import { prisma } from "./index";
import { recordTransformation } from "./data-assets";
import { hashOpaqueToken } from "./security";

export class BackfillError extends Error { constructor(readonly code: string, readonly statusCode = 409) { super(code); } }
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const safeMetadata = (value: unknown): boolean => !value || typeof value !== "object" || Object.entries(value).every(([key, item]) => !/password|secret|token|credential|cookie|session|encrypted|api.?key|access.?key|private.?key/iu.test(key) && safeMetadata(item));

export async function previewHistoricalImport(value: unknown) {
  if (JSON.stringify(value).length > 5_000_000) throw new BackfillError("IMPORT_TOO_LARGE", 422);
  const input = historicalImportSchema.parse(value);
  const source = await prisma.dataSource.findUnique({ where: { key: input.sourceKey } });
  if (!source || source.isDemo || source.providerType !== "PUBLIC" || source.sourceType !== "PUBLIC_DATA") throw new BackfillError("PUBLIC_SOURCE_REQUIRED", 422);
  const from = new Date(input.rangeFrom), to = new Date(input.rangeTo);
  if (from > to || to > new Date() || to.getTime() - from.getTime() > 10 * 366 * 86400000) throw new BackfillError("INVALID_HISTORICAL_RANGE", 422);
  const domains = Array.isArray(source.supportedDomains) ? source.supportedDomains.filter((v): v is string => typeof v === "string") : [];
  const approvedUrl = (url: string) => { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password && domains.includes(parsed.hostname); };
  if (!approvedUrl(input.evidenceReference)) throw new BackfillError("SOURCE_EVIDENCE_REQUIRED", 422);
  const rows = input.records.map((record, index) => {
    const result = historicalFactSchema.safeParse(record);
    const valid = result.success && safeMetadata(result.data.payload) && approvedUrl(result.data.evidenceRef) && new Date(result.data.startsAt) >= from && new Date(result.data.endsAt) <= to;
    return valid ? { rowNumber: index + 1, payload: result.data, errorCode: null } : { rowNumber: index + 1, payload: { rowNumber: index + 1 }, errorCode: "INVALID_FACT_SCOPE_OR_EVIDENCE" };
  });
  const validRows = rows.filter(row => !row.errorCode).length;
  return { input, source, rows, checksum: digest(input.records), validRows, errors: rows.filter(row => row.errorCode).map(({ rowNumber, errorCode }) => ({ rowNumber, errorCode })) };
}

export async function createHistoricalBackfill(value: unknown, adminId: string) {
  const preview = await previewHistoricalImport(value);
  if (!preview.validRows) throw new BackfillError("NO_VALID_IMPORT_ROWS", 422);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`backfill:${preview.input.commandId}`}))`;
    const previous = await tx.serviceBackfill.findUnique({ where: { commandId: preview.input.commandId } });
    if (previous) {
      if (previous.checksum !== preview.checksum || previous.actorAdminId !== adminId || previous.dataSourceId !== preview.source.id || previous.rangeFrom.getTime() !== new Date(preview.input.rangeFrom).getTime() || previous.rangeTo.getTime() !== new Date(preview.input.rangeTo).getTime()) throw new BackfillError("IMPORT_COMMAND_COLLISION");
      return previous;
    }
    const plan = await tx.serviceBackfill.create({ data: { commandId: preview.input.commandId, actorAdminId: adminId, dataSourceId: preview.source.id, reason: preview.input.reason, evidenceReference: preview.input.evidenceReference, checksum: preview.checksum, rangeFrom: preview.input.rangeFrom, rangeTo: preview.input.rangeTo, totalRows: preview.rows.length, failedRows: preview.errors.length, rows: { create: preview.rows.map(row => ({ rowNumber: row.rowNumber, payload: row.payload as Prisma.InputJsonValue, status: row.errorCode ? "INVALID" : "PENDING", errorCode: row.errorCode })) } } });
    const job = await tx.job.create({ data: { type: "BACKFILL_IMPORT", queueName: "public-data-collection", sourceId: preview.source.key, payload: { backfillId: plan.id }, idempotencyKey: `backfill:${plan.id}:initial`, maxAttempts: 1 } });
    const updated = await tx.serviceBackfill.update({ where: { id: plan.id }, data: { jobId: job.id, status: "QUEUED" } });
    await tx.auditEvent.create({ data: { actorAdminId: adminId, eventType: "historical_backfill_created", entityType: "ServiceBackfill", entityId: plan.id, payload: { checksum: plan.checksum, reason: plan.reason, rangeFrom: preview.input.rangeFrom, rangeTo: preview.input.rangeTo, totalRows: plan.totalRows, validRows: preview.validRows, jobId: job.id, mode: "HISTORICAL_FACTS_ONLY", sourceFreshnessUnchanged: true }, eventHash: hashOpaqueToken(plan.id, getEnvironment().ACCESS_KEY_SECRET) } });
    return updated;
  });
}

export async function processHistoricalBackfill(backfillId: string, jobId: string) {
  const plan = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ServiceBackfill" WHERE id = ${backfillId} FOR UPDATE`;
    const current = await tx.serviceBackfill.findUniqueOrThrow({ where: { id: backfillId } });
    if (["CANCELLED", "COMPLETED", "PARTIAL"].includes(current.status) || current.jobId !== jobId) return null;
    const run = current.collectionRunId ? await tx.collectionRun.findUniqueOrThrow({ where: { id: current.collectionRunId } }) : await tx.collectionRun.create({ data: { jobId, dataSourceId: current.dataSourceId, mode: "ON_DEMAND", status: "RUNNING", startedAt: new Date(), scope: { operation: "HISTORICAL_BACKFILL", backfillId, rangeFrom: current.rangeFrom.toISOString(), rangeTo: current.rangeTo.toISOString(), checksum: current.checksum, sourceFreshnessUnchanged: true } } });
    const artifactId = `historical-input:${run.id}`;
    const reviewedRows = await tx.serviceBackfillRow.findMany({ where: { backfillId }, orderBy: { rowNumber: "asc" }, select: { rowNumber: true, payload: true, errorCode: true } });
    const manifest = { backfillId, checksum: current.checksum, evidenceReference: current.evidenceReference, reviewedRows };
    await tx.rawArtifact.upsert({ where: { id: artifactId }, create: { id: artifactId, dataSourceId: current.dataSourceId, collectionRunId: run.id, artifactType: "HISTORICAL_IMPORT_MANIFEST", storageRef: `postgres:RawArtifact:${artifactId}`, contentHash: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"), payload: manifest as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + getEnvironment().RAW_ARTIFACT_TTL_HOURS * 3600000) }, update: {} });
    return tx.serviceBackfill.update({ where: { id: backfillId }, data: { status: "RUNNING", collectionRunId: run.id } });
  });
  if (!plan) return;
  const rows = await prisma.serviceBackfillRow.findMany({ where: { backfillId, status: { in: ["PENDING", "FAILED"] } }, orderBy: { rowNumber: "asc" } });
  for (const row of rows) {
    try {
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "ServiceBackfillRow" WHERE id = ${row.id} FOR UPDATE`;
        const current = await tx.serviceBackfillRow.findUniqueOrThrow({ where: { id: row.id } });
        if (!["PENDING", "FAILED"].includes(current.status)) return;
        const fact = historicalFactSchema.parse(current.payload);
        const contentHash = digest(fact);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`historical-fact:${plan.dataSourceId}:${contentHash}`}))`;
        const existing = await tx.publicFactVersion.findFirst({ where: { dataSourceId: plan.dataSourceId, factKind: fact.factKind, externalId: fact.externalId, contentHash, observedAt: new Date(fact.observedAt) } });
        const saved = existing ?? await tx.publicFactVersion.upsert({ where: { idempotencyKey: `backfill-fact:${plan.dataSourceId}:${digest({ externalId: fact.externalId, observedAt: fact.observedAt, contentHash })}` }, create: { dataSourceId: plan.dataSourceId, collectionRunId: plan.collectionRunId!, factKind: fact.factKind, externalId: fact.externalId, observedAt: fact.observedAt, startsAt: fact.startsAt, endsAt: fact.endsAt, contentHash, payload: { ...fact.payload, evidenceRef: fact.evidenceRef, historicalImportId: plan.id, origin: "OPERATOR_ATTESTED_PUBLIC_HISTORY" } as Prisma.InputJsonValue, idempotencyKey: `backfill-fact:${plan.dataSourceId}:${digest({ externalId: fact.externalId, observedAt: fact.observedAt, contentHash })}` }, update: {} });
        await recordTransformation({ dataSourceId: plan.dataSourceId, collectionRunId: plan.collectionRunId!, transformationType: "HISTORICAL_FACT_IMPORT", transformationVersion: "historical-facts-v1", inputs: [{ type: "RAW_ARTIFACT", id: `historical-input:${plan.collectionRunId}` }, { type: "MANUAL_DECISION", id: plan.id }], outputs: [{ type: "NORMALIZED_FACT", id: saved.id, evidenceRef: fact.evidenceRef, evidenceHash: contentHash }], metadata: { rowNumber: row.rowNumber, originalObservedAt: fact.observedAt, duplicate: Boolean(existing) } }, tx);
        await tx.serviceBackfillRow.update({ where: { id: row.id }, data: { status: existing ? "DUPLICATE" : "SAVED", factVersionId: saved.id, errorCode: null, attemptCount: { increment: 1 } } });
      });
    } catch {
      await prisma.serviceBackfillRow.update({ where: { id: row.id }, data: { status: "FAILED", errorCode: "FACT_PERSISTENCE_FAILED", attemptCount: { increment: 1 } } });
    }
  }
  const counts = await prisma.serviceBackfillRow.groupBy({ by: ["status"], where: { backfillId }, _count: { _all: true } });
  const count = (status: string) => counts.find(row => row.status === status)?._count._all ?? 0;
  const failures = count("FAILED"), invalid = count("INVALID");
  await prisma.$transaction(async tx => {
    await tx.serviceBackfill.update({ where: { id: backfillId }, data: { status: failures ? "FAILED" : invalid ? "PARTIAL" : "COMPLETED", savedRows: count("SAVED"), duplicateRows: count("DUPLICATE"), failedRows: failures + invalid, completedAt: failures ? null : new Date() } });
    await tx.collectionRun.update({ where: { id: plan.collectionRunId! }, data: { status: failures ? "FAILED" : invalid ? "PARTIAL" : "SUCCEEDED", successCount: count("SAVED") + count("DUPLICATE"), failureCount: failures + invalid, errorCode: failures ? "BACKFILL_PERSISTENCE_FAILED" : invalid ? "BACKFILL_INVALID_ROWS" : null, finishedAt: new Date() } });
    await tx.auditEvent.create({ data: { eventType: "historical_backfill_progress", entityType: "ServiceBackfill", entityId: backfillId, payload: { jobId, counts: Object.fromEntries(counts.map(row => [row.status, row._count._all])), sourceFreshnessUnchanged: true }, eventHash: hashOpaqueToken(`${backfillId}:${jobId}:${Date.now()}`, getEnvironment().ACCESS_KEY_SECRET) } });
  });
  if (failures) throw new BackfillError("BACKFILL_PERSISTENCE_FAILED");
}

export async function retryHistoricalBackfill(backfillId: string, adminId: string, reason: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ServiceBackfill" WHERE id = ${backfillId} FOR UPDATE`;
    const plan = await tx.serviceBackfill.findUniqueOrThrow({ where: { id: backfillId } });
    const job = plan.jobId ? await tx.job.findUnique({ where: { id: plan.jobId } }) : null;
    if (job && ["PENDING", "RUNNING"].includes(job.status) && ["QUEUED", "RUNNING"].includes(plan.status)) return plan;
    if (job && ["PENDING", "RUNNING"].includes(job.status)) throw new BackfillError("BACKFILL_STILL_ACTIVE");
    const pending = await tx.serviceBackfillRow.count({ where: { backfillId, status: { in: ["PENDING", "FAILED"] } } });
    if (!pending || ["CANCELLED", "COMPLETED", "PARTIAL"].includes(plan.status)) throw new BackfillError("BACKFILL_NOT_RECOVERABLE");
    const next = await tx.job.upsert({ where: { idempotencyKey: `backfill:${backfillId}:retry-after:${plan.jobId}` }, create: { type: "BACKFILL_IMPORT", queueName: "public-data-collection", payload: { backfillId }, idempotencyKey: `backfill:${backfillId}:retry-after:${plan.jobId}`, maxAttempts: 1, sourceId: job?.sourceId }, update: {} });
    if (plan.collectionRunId) await tx.collectionRun.updateMany({ where: { id: plan.collectionRunId, status: { in: ["PENDING", "RUNNING"] } }, data: { status: "FAILED", errorCode: "BACKFILL_JOB_INTERRUPTED", failureCount: pending, finishedAt: new Date() } });
    const updated = await tx.serviceBackfill.update({ where: { id: backfillId }, data: { status: "QUEUED", jobId: next.id, collectionRunId: null } });
    await tx.auditEvent.create({ data: { actorAdminId: adminId, eventType: "historical_backfill_retry", entityType: "ServiceBackfill", entityId: backfillId, payload: { reason, originalJobId: job?.id ?? null, jobId: next.id, unfinishedRows: pending }, eventHash: hashOpaqueToken(next.id, getEnvironment().ACCESS_KEY_SECRET) } });
    return updated;
  });
}

export async function cancelHistoricalBackfill(backfillId: string, adminId: string, reason: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ServiceBackfill" WHERE id = ${backfillId} FOR UPDATE`;
    const plan = await tx.serviceBackfill.findUniqueOrThrow({ where: { id: backfillId } });
    if (plan.status === "CANCELLED") return plan;
    if (plan.status !== "QUEUED" || !plan.jobId) throw new BackfillError("BACKFILL_NOT_CANCELLABLE");
    const cancelled = await tx.job.updateMany({ where: { id: plan.jobId, status: "PENDING" }, data: { status: "CANCELLED", completedAt: new Date(), lastErrorCode: "ADMIN_CANCELLED" } });
    if (!cancelled.count) throw new BackfillError("BACKFILL_STILL_ACTIVE");
    const updated = await tx.serviceBackfill.update({ where: { id: plan.id }, data: { status: "CANCELLED", completedAt: new Date() } });
    await tx.auditEvent.create({ data: { actorAdminId: adminId, eventType: "historical_backfill_cancelled", entityType: "ServiceBackfill", entityId: plan.id, payload: { reason, jobId: plan.jobId, originalHistoryRetained: true }, eventHash: hashOpaqueToken(`${plan.id}:cancel`, getEnvironment().ACCESS_KEY_SECRET) } });
    return updated;
  });
}
