import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma, recordListingVersion, recordTransformation, type Prisma } from "@tymra/db";
import { otaResolveListingExtractionSchema } from "@tymra/providers/ota-argus-contracts";
import { matchOtaListingToConfirmedAddress } from "@tymra/providers/ota-address-match";
import { z } from "zod";
import { canReadArtifactContent, resolveRetainedEvidencePath } from "./raw-artifact-content";
import { ServiceRecoveryError, writeServiceAudit } from "./service-recovery";

export const mappingRepairSchema = z.object({ commandId: z.string().min(8).max(200), targetUnitId: z.string().min(1), evidenceArtifactId: z.string().min(1), reason: z.string().trim().min(3).max(1000), previewHash: z.string().optional() }).strict();
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const normalName = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

async function identityEvidence(artifactId: string) {
  const artifact = await prisma.rawArtifact.findUniqueOrThrow({ where: { id: artifactId } });
  if (artifact.containsSensitiveData || artifact.deletedAt || artifact.parserFailure) throw new ServiceRecoveryError("REPAIR_EVIDENCE_UNAVAILABLE");
  let value: unknown;
  if (artifact.storageRef === `postgres:RawArtifact:${artifact.id}`) {
    if (digest(artifact.payload) !== artifact.contentHash) throw new ServiceRecoveryError("ARTIFACT_HASH_MISMATCH");
    value = artifact.payload;
  } else {
    if (!canReadArtifactContent(artifact)) throw new ServiceRecoveryError("REPAIR_EVIDENCE_UNAVAILABLE");
    const root = await fs.realpath(process.env.ARGUS_EVIDENCE_ROOT ?? "/argus-evidence");
    const target = await fs.realpath(resolveRetainedEvidencePath(root, artifact.storageRef));
    if (!target.startsWith(`${root}${path.sep}`)) throw new ServiceRecoveryError("REPAIR_EVIDENCE_UNAVAILABLE");
    const stat = await fs.stat(target); if (!stat.isFile() || stat.size > 10000000) throw new ServiceRecoveryError("REPAIR_EVIDENCE_UNAVAILABLE");
    const content = await fs.readFile(target); if (createHash("sha256").update(content).digest("hex") !== artifact.contentHash) throw new ServiceRecoveryError("ARTIFACT_HASH_MISMATCH");
    value = JSON.parse(content.toString("utf8"));
  }
  const wrapper = value as { extracted?: unknown; result?: { extracted?: unknown } };
  const extraction = otaResolveListingExtractionSchema.safeParse(wrapper?.extracted ?? wrapper?.result?.extracted ?? value);
  if (!extraction.success || extraction.data.quality !== "complete") throw new ServiceRecoveryError("COMPLETE_IDENTITY_EVIDENCE_REQUIRED");
  return { artifact, extraction: extraction.data };
}

export async function previewMappingRepair(listingId: string, value: unknown, database: Prisma.TransactionClient = prisma) {
  const input = mappingRepairSchema.parse(value);
  const [listing, unit, evidence] = await Promise.all([database.listing.findUniqueOrThrow({ where: { id: listingId }, include: { dataSource: true } }), database.sellableUnit.findUniqueOrThrow({ where: { id: input.targetUnitId }, include: { property: true } }), identityEvidence(input.evidenceArtifactId)]);
  const { artifact, extraction } = evidence;
  if (listing.isDemo || unit.isDemo || listing.dataSource.isDemo || listing.dataSource.providerType !== "OTA" || artifact.dataSourceId !== listing.dataSourceId || extraction.provider !== listing.dataSource.key || extraction.sourceListingId !== listing.sourceListingId || extraction.canonicalUrl !== listing.canonicalUrl || unit.propertyId !== listing.propertyId || unit.status !== "ACTIVE" || unit.mergedIntoId) throw new ServiceRecoveryError("MAPPING_SCOPE_NOT_PROVEN");
  const externalUnitId = listing.externalId.startsWith(`${listing.sourceListingId}:`) ? listing.externalId.slice(listing.sourceListingId.length + 1) : listing.externalId;
  const rawUnit = extraction.units.find(candidate => candidate.externalId === externalUnitId);
  if (!rawUnit || normalName(rawUnit.officialName) !== normalName(unit.officialName) || rawUnit.capacity !== unit.capacity || rawUnit.unitType !== unit.unitType || rawUnit.entireOrShared !== unit.entireOrShared || matchOtaListingToConfirmedAddress(unit.property, extraction).status !== "MATCH") throw new ServiceRecoveryError("CANONICAL_IDENTITY_NOT_PROVEN");
  if (listing.unitId === unit.id) throw new ServiceRecoveryError("MAPPING_ALREADY_CORRECT");
  const observations = await database.rateObservation.findMany({ where: { listingId, quarantine: null }, select: { id: true }, take: 501 });
  if (observations.length > 500) throw new ServiceRecoveryError("REPAIR_IMPACT_REQUIRES_BOUNDED_REVIEW");
  const snapshots = observations.length ? await database.marketSnapshot.findMany({ where: { OR: observations.map(row => ({ observationIds: { array_contains: [row.id] } })) }, select: { id: true } }) : [];
  const directChecks = await database.priceCheck.findMany({ where: { unitId: listing.unitId, listingUrl: listing.canonicalUrl, status: { notIn: ["ARCHIVED", "CANCELLED", "EXPIRED"] } }, select: { id: true } });
  const affectedRuns = observations.length ? await database.rateObservation.findMany({ where: { id: { in: observations.map(row => row.id) } }, select: { collectionRun: { select: { priceCheckId: true } } } }) : [];
  const impactedRequests = [...new Set([...directChecks.map(row => row.id), ...affectedRuns.flatMap(row => row.collectionRun?.priceCheckId ? [row.collectionRun.priceCheckId] : [])])];
  const results = await database.resultVersion.findMany({ where: { status: "PUBLISHED", OR: [{ marketSnapshotId: { in: snapshots.map(row => row.id) } }, { priceCheckId: { in: impactedRequests } }] }, select: { id: true, priceCheckId: true } });
  const checkIds = [...new Set([...results.map(row => row.priceCheckId), ...directChecks.map(row => row.id)])].sort();
  if (checkIds.length > 100) throw new ServiceRecoveryError("REPAIR_IMPACT_REQUIRES_BOUNDED_REVIEW");
  const previewHash = digest({ listingId, originalUnitId: listing.unitId, targetUnitId: unit.id, unitVersion: unit.updatedAt.toISOString(), listingVersion: listing.updatedAt.toISOString(), evidenceHash: artifact.contentHash, observations: observations.map(row => row.id).sort(), results: results.map(row => row.id).sort(), checkIds });
  return { input, listing, unit, artifact, observations, results, directChecks, checkIds, previewHash, identityProjection: { provider: extraction.provider, sourceListingId: extraction.sourceListingId, canonicalUrl: extraction.canonicalUrl, unit: rawUnit, confirmedAddress: unit.property.address } };
}

export async function repairListingMapping(listingId: string, value: unknown, adminId: string) {
  const input = mappingRepairSchema.parse(value);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${listingId} FOR UPDATE`;
    const existing = await tx.serviceDataRepair.findUnique({ where: { commandId: input.commandId } });
    if (existing) {
      if (existing.listingId !== listingId || existing.correctedUnitId !== input.targetUnitId || existing.evidenceArtifactId !== input.evidenceArtifactId || existing.actorAdminId !== adminId) throw new ServiceRecoveryError("REPAIR_COMMAND_COLLISION");
      return existing;
    }
    const preview = await previewMappingRepair(listingId, input, tx);
    if (!input.previewHash || input.previewHash !== preview.previewHash) throw new ServiceRecoveryError("REPAIR_PREVIEW_CHANGED");
    for (const id of preview.checkIds) await tx.$queryRaw`SELECT id FROM "PriceCheck" WHERE id = ${id} FOR UPDATE`;
    if (await tx.job.count({ where: { OR: [{ priceCheckId: { in: preview.checkIds } }, { sourceId: preview.listing.dataSource.key }, { type: { in: ["CATALOG_DISCOVERY", "ANCHOR_PANEL_COLLECTION", "ROTATING_PANEL_COLLECTION"] } }], status: { in: ["PENDING", "RUNNING"] }, type: { notIn: ["EMAIL_DELIVERY", "RESULT_NOTIFICATION"] } } })) throw new ServiceRecoveryError("AFFECTED_REQUEST_STILL_ACTIVE");
    const now = new Date();
    await recordListingVersion(listingId, { collectedAt: now, changeType: "BEFORE_EVIDENCE_MAPPING_REPAIR", identityEvidence: { originalMappingRecordedBeforeRepair: true } }, tx);
    await tx.listing.update({ where: { id: listingId }, data: { unitId: preview.unit.id } });
    const version = await recordListingVersion(listingId, { collectedAt: now, collectionRunId: preview.artifact.collectionRunId, collectorVersion: "service-evidence-repair-v1", parserVersion: "ota-public.resolve_listing@1.0.0", changeType: "EVIDENCE_MAPPING_REPAIR", identityEvidence: { artifactId: preview.artifact.id, artifactHash: preview.artifact.contentHash, reason: input.reason, previousUnitId: preview.listing.unitId, correctedUnitId: preview.unit.id, sourceIdentity: preview.identityProjection as Prisma.InputJsonValue } }, tx);
    const repair = await tx.serviceDataRepair.create({ data: { commandId: input.commandId, actorAdminId: adminId, listingId, previousUnitId: preview.listing.unitId, correctedUnitId: preview.unit.id, evidenceArtifactId: preview.artifact.id, evidenceHash: preview.artifact.contentHash, reason: input.reason, listingVersionId: version.id, impact: { previewHash: preview.previewHash, quarantinedObservationIds: preview.observations.map(row => row.id), affectedCheckIds: preview.checkIds, withdrawnResultIds: preview.results.map(row => row.id), originalInputsRetained: true } } });
    for (const row of preview.observations) await tx.rateQuarantine.create({ data: { rateObservationId: row.id, repairId: repair.id, reason: input.reason } });
    if (preview.observations.length) await tx.queryCacheEntry.updateMany({ where: { OR: preview.observations.map(row => ({ observationIds: { array_contains: [row.id] } })) }, data: { validUntil: now } });
    for (const result of preview.results) await tx.resultVersion.update({ where: { id: result.id }, data: { status: "WITHDRAWN" } });
    await tx.emailDelivery.updateMany({ where: { resultVersionId: { in: preview.results.map(row => row.id) }, status: { in: ["PENDING", "FAILED"] } }, data: { status: "CANCELLED", lastError: "Evidence mapping repair withdrew the result" } });
    for (const priceCheckId of preview.checkIds) {
      const needsConfirmation = preview.directChecks.some(row => row.id === priceCheckId);
      await tx.priceCheck.update({ where: { id: priceCheckId }, data: { status: needsConfirmation ? "NEEDS_CONFIRMATION" : "EXCEPTION" } });
      await tx.exceptionCase.create({ data: { priceCheckId, type: needsConfirmation ? "UNIT_MATCH" : "SOURCE_CONFLICT", priority: "P1", blockingUser: true, recommendation: needsConfirmation ? "Customer confirmation is required after a proven platform mapping correction." : "Reprocess the original request using corrected source mapping; historical evidence is retained.", evidence: { serviceDataRepairId: repair.id, affectedListingId: listingId, originalInputPreserved: true }, allowedActions: needsConfirmation ? ["ACKNOWLEDGE", "REQUEST_USER_CONFIRMATION", "VERIFY_RECOVERY"] : ["ACKNOWLEDGE", "RECOLLECT", "REANALYSE", "VERIFY_RECOVERY"] } });
    }
    await recordTransformation({ dataSourceId: preview.listing.dataSourceId, collectionRunId: preview.artifact.collectionRunId, transformationType: "CANONICAL_MAPPING_REPAIR", transformationVersion: "service-evidence-repair-v1", inputs: [{ type: "RAW_ARTIFACT", id: preview.artifact.id }], outputs: [{ type: "NORMALIZED_FACT", id: version.id }], metadata: { repairId: repair.id, previousUnitId: preview.listing.unitId, correctedUnitId: preview.unit.id } }, tx);
    await writeServiceAudit(tx, adminId, "canonical_mapping_repaired", "Listing", listingId, { reason: input.reason, repairId: repair.id, artifactHash: preview.artifact.contentHash, impact: repair.impact as Prisma.InputJsonValue });
    return repair;
  }, { timeout: 15000 });
}
