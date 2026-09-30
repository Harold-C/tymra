import { prisma, Prisma } from "@tymra/db";
import { registrySourceSeedRecords } from "../../../../packages/db/prisma/seed-sources";
import { ACTIVE_OTA_SOURCE_KEYS, calculateOtaHealthMetrics, otaReleaseGate } from "./ota-health";
import { nextCollectionOutsideOfficeHours } from "./collection-office-hours";

export const OTA_PILOT_VERSION = "ota-bounded-production-v1";
export const OTA_DAILY_EXECUTION_BUDGET = 6;
export function otaIdentityRequiresDetail(identity: { address: string | null; countryCode: string | null; latitude: number | null; longitude: number | null; warnings: string[]; units: { externalId: string; unitType: string; capacity: number | null }[] }) {
  return identity.countryCode !== "NZ" || !identity.address || identity.latitude === null || identity.longitude === null
    || !identity.units.some((unit) => unit.capacity !== null)
    || identity.warnings.includes("UNIT_CAPACITY_FROM_SEARCH_OCCUPANCY")
    || identity.units.some((unit) => unit.externalId.endsWith(":visible-card") || unit.unitType === "Search summary (not sellable)");
}
export function requireOtaSource(key: string) {
  if (!(ACTIVE_OTA_SOURCE_KEYS as readonly string[]).includes(key)) throw new Error("Only the six approved public OTA sources are supported");
  return key;
}
export function productionOtaPayload(sourceId: string) {
  return { sourceId: requireOtaSource(sourceId), marketScope: "new-zealand", productionOta: OTA_PILOT_VERSION, maxTargets: 1, maxListings: 1, maxDetails: 1, maxRates: 1 };
}
export function isProductionOtaPayload(payload: unknown): payload is ReturnType<typeof productionOtaPayload> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const actual = payload as Record<string, unknown>;
  if (typeof actual.sourceId !== "string" || !(ACTIVE_OTA_SOURCE_KEYS as readonly string[]).includes(actual.sourceId)) return false;
  const expected = productionOtaPayload(actual.sourceId);
  return Object.keys(actual).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => actual[key] === value);
}
export function isProductionOtaSchedule(schedule: { key: string; jobType: string; queueName: string; cronExpression: string; payload: unknown }) {
  return isProductionOtaPayload(schedule.payload) && schedule.key === `pilot-ota-${schedule.payload.sourceId}-daily`
    && schedule.jobType === "CATALOG_DISCOVERY" && schedule.queueName === "ota-production" && schedule.cronExpression === "daily";
}
export function otaSourceApproved(source: { key: string; providerType: string; sourceType: string; enabled: boolean; isDemo: boolean; environments: string[]; concurrencyLimit: number; dailyBudget: number; metadata: unknown; accessMethod: string | null }) {
  const meta = source.metadata as Record<string, unknown> | null;
  return (ACTIVE_OTA_SOURCE_KEYS as readonly string[]).includes(source.key) && source.providerType === "OTA" && source.sourceType === "OTA"
    && source.enabled && !source.isDemo && source.environments.includes("PRODUCTION") && source.concurrencyLimit === 1
    && source.dailyBudget === OTA_DAILY_EXECUTION_BUDGET && source.accessMethod === "PUBLIC_WEB_ARGUS_READ_ONLY"
    && meta?.productionOta === OTA_PILOT_VERSION;
}
export async function prepareProductionOta(sourceId: string, nodeEnv: string) {
  return prisma.$transaction((tx) => prepareProductionOtaTransaction(tx, sourceId, nodeEnv));
}
export async function prepareProductionOtaTransaction(tx: Prisma.TransactionClient, sourceId: string, nodeEnv: string) {
  requireOtaSource(sourceId);
  if (nodeEnv !== "production") throw new Error("OTA production preparation requires production");
  const record = registrySourceSeedRecords().find((item) => item.key === sourceId)!;
    if (await tx.dataSource.findUnique({ where: { key: sourceId } })) throw new Error("Source exists; preparation never overwrites existing source or history");
    const source = await tx.dataSource.create({ data: {
      key: record.key, name: record.name, providerType: "OTA", sourceType: "OTA", supportedDomains: [...record.supportedDomains],
      adapterKey: `ota:${sourceId}:v1`, environments: ["PRODUCTION"], acquisitionMethod: "PUBLIC_WEB_ARGUS_READ_ONLY", accessMethod: "PUBLIC_WEB_ARGUS_READ_ONLY",
      lifecycle: "RESEARCH", status: "UNKNOWN", operationalStatus: "DEGRADED", healthStatus: "DEGRADED", enabled: false, isDemo: false,
      concurrencyLimit: 1, dailyBudget: OTA_DAILY_EXECUTION_BUDGET, owner: "Tymra production", retentionDays: 365,
      retentionPolicy: { rawHours: 72, parserFailureHours: 168 }, metadata: { productionOta: OTA_PILOT_VERSION },
      capabilities: { create: (["DISCOVER_LISTINGS", "RESOLVE_LISTING", "COLLECT_RATES", "HEALTH_CHECK"] as const).map((capability) => ({ capability, version: 1, contractVersion: "source-capability-v1" })) },
    } });
    await tx.scheduleDefinition.create({ data: { key: `pilot-ota-${sourceId}-daily`, jobType: "CATALOG_DISCOVERY", queueName: "ota-production", cronExpression: "daily", enabled: false, payload: productionOtaPayload(sourceId) } });
    return { sourceId, enabled: source.enabled, scheduleEnabled: false, mutationPerformed: true };
}
export async function enqueueProductionOtaTrial(sourceId: string, nodeEnv: string) {
  return prisma.$transaction((tx) => enqueueProductionOtaTrialTransaction(tx, sourceId, nodeEnv), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
export async function enqueueProductionOtaTrialTransaction(tx: Prisma.TransactionClient, sourceId: string, nodeEnv: string) {
  requireOtaSource(sourceId);
  if (nodeEnv !== "production") throw new Error("OTA production trial requires production");
    const source = await tx.dataSource.findUniqueOrThrow({ where: { key: sourceId } });
    if (!otaSourceApproved({ ...source, enabled: true }) || source.operationalStatus === "BLOCKED") throw new Error("Source does not match the isolated public OTA contract");
    const schedules = await tx.scheduleDefinition.findMany({ where: { enabled: true } });
    if (schedules.some((s) => (s.payload as Record<string, unknown>)?.sourceId === sourceId)) throw new Error("Disable this source's schedules before a manual trial");
    if (await tx.job.count({ where: { sourceId: { in: [...ACTIVE_OTA_SOURCE_KEYS] }, status: { in: ["PENDING", "RUNNING"] } } })) throw new Error("Another Tymra OTA job is active; trials run one source at a time");
    await tx.dataSource.update({ where: { id: source.id }, data: { enabled: true, lifecycle: "PILOT", status: "PILOT", operationalStatus: "DEGRADED", healthStatus: "DEGRADED", lastReviewedAt: new Date() } });
    // Job and source rearm are committed together, without touching other sources.
    const runAt = nextCollectionOutsideOfficeHours(new Date());
    const job = await tx.job.create({ data: { type: "CATALOG_DISCOVERY", queueName: "ota-production", sourceId, payload: productionOtaPayload(sourceId), idempotencyKey: `ota-trial:${sourceId}:${Date.now()}`, maxAttempts: 1, runAt } });
    return { sourceId, jobId: job.id, runAt, mutationPerformed: true };
}
export async function pauseProductionOta(sourceId: string, nodeEnv: string) {
  requireOtaSource(sourceId);
  if (nodeEnv !== "production") throw new Error("OTA production pause requires production");
  await prisma.$transaction([
    prisma.scheduleDefinition.updateMany({ where: { key: `pilot-ota-${sourceId}-daily` }, data: { enabled: false, nextRunAt: null } }),
    prisma.dataSource.updateMany({ where: { key: sourceId, metadata: { path: ["productionOta"], equals: OTA_PILOT_VERSION } }, data: { enabled: false, lifecycle: "SUSPENDED", healthStatus: "DEGRADED", lastReviewedAt: new Date() } }),
  ]);
  return { sourceId, scheduleEnabled: false, mutationPerformed: true };
}
export async function enableProductionOtaSchedule(sourceId: string, nodeEnv: string) {
  requireOtaSource(sourceId);
  if (nodeEnv !== "production") throw new Error("OTA production schedules require production");
  return prisma.$transaction(async (tx) => {
    const source = await tx.dataSource.findUniqueOrThrow({ where: { key: sourceId } });
    if (!otaSourceApproved(source)) throw new Error("Source is not an approved enabled public OTA pilot");
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    const recentRuns = await tx.collectionRun.findMany({ where: { dataSourceId: source.id, isDemo: false, createdAt: { gte: cutoff } } });
    const recentExecutions = await tx.argusExecution.findMany({ where: { dataSourceId: source.id, submittedAt: { gte: cutoff } } });
    const parserArtifactFailures = await tx.rawArtifact.count({ where: { dataSourceId: source.id, parserFailure: true, createdAt: { gte: cutoff } } });
    const positiveListingCount = await tx.listing.count({ where: { dataSourceId: source.id, isDemo: false, lastConfirmedAt: { gte: cutoff }, metadata: { path: ["discoveredFor"], not: Prisma.AnyNull } } });
    const positiveRateCount = await tx.rateObservation.count({ where: { dataSourceId: source.id, isDemo: false, collectedAt: { gte: cutoff }, availabilityStatus: "AVAILABLE", feeCompleteness: "COMPLETE", totalAmountMinor: { gt: 0 } } });
    const metrics = calculateOtaHealthMetrics({ key: source.key, enabled: true, lifecycle: "PILOT", operationalStatus: "HEALTHY", runs: recentRuns, executions: recentExecutions, positiveListingCount, positiveRateCount, parserArtifactFailures, latestListingAt: null, latestRateAt: null });
    // Actual listing/price counts are checked for each exact trial below. This check
    // additionally retains D-039's rolling parser/challenge/policy failure thresholds.
    const gate = otaReleaseGate(metrics);
    if (!gate.ready) throw new Error(`OTA source health gate: ${gate.failures.join("; ")}`);
    const jobs = await tx.job.findMany({ where: { sourceId, queueName: "ota-production" }, orderBy: { createdAt: "desc" }, take: 2 });
    if (jobs.length !== 2 || jobs.some((job) => !isProductionOtaPayload(job.payload) || job.status !== "SUCCEEDED" || job.attemptCount !== 1 || job.maxAttempts !== 1 || job.createdAt.getTime() < Date.now() - 7 * 86_400_000)) throw new Error("The latest two exact bounded OTA jobs must have succeeded once within seven days");
    for (const job of jobs) {
      const runs = await tx.collectionRun.findMany({ where: { jobId: job.id, dataSourceId: source.id, isDemo: false } });
      if (runs.length !== 2 || runs.some((r) => r.status !== "SUCCEEDED" || r.successCount < 1 || r.failureCount !== 0 || !r.finishedAt || (r.scope as Record<string, unknown>).deliveryVerified !== true)) throw new Error("Both discovery and exact-unit rate must succeed with verified delivery in each trial");
      if (runs.filter((r) => (r.scope as Record<string, unknown>).operation === "NATIONAL_CATALOG_DISCOVERY").length !== 1 || runs.filter((r) => (r.scope as Record<string, unknown>).operation === "OTA_PANEL_RATE").length !== 1) throw new Error("Each exact trial requires one discovery run and one unit-rate run");
      const rate = await tx.rateObservation.count({ where: { collectionRunId: { in: runs.map((r) => r.id) }, dataSourceId: source.id, isDemo: false, collectedAt: { gte: new Date(Date.now() - 7 * 86_400_000), lte: new Date() }, checkIn: { gte: new Date() }, availabilityStatus: "AVAILABLE", feeCompleteness: "COMPLETE", totalAmountMinor: { gt: 0 } } });
      if (!rate) throw new Error("Each trial requires an available positive public total with complete mandatory fees");
      const executions = await tx.argusExecution.findMany({ where: { parentJobId: job.id } });
      if (executions.length < 2 || executions.length > 3 || executions.some((e) => e.status !== "COMPLETED" || !e.result)) throw new Error("All bounded executions require successful persisted results and Argus ACK");
      const artifacts = await tx.rawArtifact.findMany({ where: { collectionRunId: { in: runs.map((r) => r.id) }, deletedAt: null } });
      if (!artifacts.some((a) => a.storageRef.startsWith("tymra-evidence:")) || artifacts.some((a) => a.parserFailure || a.storageRef.startsWith("argus-evidence:"))) throw new Error("Local evidence retention is incomplete");
    }
    const schedule = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: `pilot-ota-${sourceId}-daily` } });
    if (!isProductionOtaSchedule(schedule)) throw new Error("OTA schedule contract differs from approved bounds");
    const nextRunAt = nextCollectionOutsideOfficeHours(new Date(Date.now() + 86_400_000 + ACTIVE_OTA_SOURCE_KEYS.indexOf(sourceId as typeof ACTIVE_OTA_SOURCE_KEYS[number]) * 30 * 60_000));
    await tx.dataSource.update({ where: { id: source.id }, data: { operationalStatus: "HEALTHY", healthStatus: "HEALTHY", lastSuccessAt: new Date(), healthSummary: { approvedJobs: jobs.map((job) => job.id), policyVersion: OTA_PILOT_VERSION } } });
    await tx.scheduleDefinition.update({ where: { id: schedule.id }, data: { enabled: true, nextRunAt } });
    return { sourceId, nextRunAt, acceptedJobs: jobs.map((job) => job.id), mutationPerformed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
