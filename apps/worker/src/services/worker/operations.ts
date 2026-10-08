import { randomUUID } from "node:crypto";
import { enqueueJob, hashPersonalIdentifier, prisma, Prisma, syncCollectionIncident } from "@tymra/db";
import { nzDateKey } from "@tymra/domain";
import { otaAdapters } from "@tymra/providers/ota-adapters";
import { nextCollectionOutsideOfficeHours } from "../../operations/collection-office-hours";
import { cleanupMembershipRetention, membershipOperationalMetrics } from "../../membership/operations";
import { redisHealth } from "@tymra/queue";
import { ACTIVE_OTA_SOURCE_KEYS, calculateOtaHealthMetrics, otaReleaseGate, otaHealthEvidenceWindowStart, otaRepairAcceptanceWindow } from "../../operations/ota-health";
import { positiveOtaListingEvidenceWhere } from "../../operations/ota-listing-evidence";
import { getArgusHealth } from "../../clients/argus-client";
import { sourceSchedulingBlockers } from "../../operations/source-access";
import { evaluateOperationalAlerts } from "../../operations/operational-alerts";
import { ConfigureSourceSchedulesRequest } from "./contracts";
import { WorkerRequestError } from "./errors";
import { jsonRecord, scheduleSourceId } from "./helpers";
import type { WorkerContext } from "./context";

export async function argusHealth(this: WorkerContext) {
  if (this.environment.PUBLIC_COLLECTION_MODE === "fixture") {
    return { healthy: true, ready: true, mode: "fixture", latencyMs: 0 } as const;
  }
  return getArgusHealth(this.environment);
}

export async function syncCollectionIncidentSafely(this: WorkerContext, collectionRunId: string) {
  try {
    await syncCollectionIncident(collectionRunId);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ service: "tymra-worker", event: "collection_incident_sync_failed", collectionRunId, message: error instanceof Error ? error.message : "Unknown incident sync failure" })}\n`);
  }
}

export async function sourceHealth(this: WorkerContext, sourceId?: string) {
  const selected = sourceId ? { [sourceId]: otaAdapters[sourceId] ?? this.publicAdapters[sourceId] } : { ...otaAdapters, ...this.publicAdapters };
  const results = [];
  const otaMetricsByKey = new Map((await this.otaHealth()).map((metrics) => [metrics.key, metrics]));
  for (const [key, adapter] of Object.entries(selected)) {
    if (!adapter) continue;
    const otaMetrics = otaMetricsByKey.get(key);
    if (otaMetrics) {
      const source = await prisma.dataSource.findUnique({ where: { key } });
      if (!source) continue;
      const gate = otaReleaseGate(otaMetrics);
      const status = source.operationalStatus === "BLOCKED" ? "BLOCKED" : gate.ready ? "HEALTHY" : "DEGRADED";
      const checkedAt = new Date();
      const message = gate.ready ? "OTA has recent positive discovery and rate evidence" : gate.failures.join("; ");
      const failureRate = Math.max(otaMetrics.parsingFailureRate, otaMetrics.policyBlockedRate, otaMetrics.challengeRate, otaMetrics.rateLimitRate, otaMetrics.emptyResultRate);
      const healthSummary = { checkedAt, mode: "durable-ota-evidence", metrics: otaMetrics, releaseGate: gate };
      await prisma.$transaction([
        prisma.sourceHealthCheck.create({ data: { dataSourceId: source.id, status, message, latencyMs: otaMetrics.averageResponseMs, metadata: healthSummary } }),
        prisma.dataSource.update({
          where: { id: source.id },
          data: {
            operationalStatus: gate.ready ? "HEALTHY" : source.operationalStatus,
            healthStatus: status === "HEALTHY" ? "HEALTHY" : status === "BLOCKED" ? "DOWN" : "DEGRADED",
            healthSummary,
            errorRate: failureRate,
            lastSuccessAt: otaMetrics.lastPositiveAt,
          },
        }),
      ]);
      results.push({ sourceId: key, status, message, latencyMs: otaMetrics.averageResponseMs, checkedAt, mode: "durable-ota-evidence", releaseGate: gate });
      continue;
    }
    const context = key in this.publicAdapters ? this.publicAdapterContext() : this.adapterContext();
    const health = await adapter.healthCheck(context);
    const source = await prisma.dataSource.findUnique({ where: { key } });
    if (source) {
      await prisma.$transaction([
        prisma.sourceHealthCheck.create({ data: { dataSourceId: source.id, status: health.status, message: health.message, latencyMs: health.latencyMs, metadata: { mode: health.mode } } }),
        prisma.dataSource.update({ where: { id: source.id }, data: { operationalStatus: health.status, healthStatus: health.status === "HEALTHY" ? "HEALTHY" : health.status === "DOWN" || health.status === "BLOCKED" ? "DOWN" : "DEGRADED", healthSummary: { message: health.message, checkedAt: health.checkedAt, mode: health.mode }, lastSuccessAt: health.status === "HEALTHY" ? health.checkedAt : source.lastSuccessAt } }),
      ]);
    }
    results.push({ sourceId: key, ...health });
  }
  return results;
}

export async function otaHealth(this: WorkerContext, windowDays = 30) {
  const boundedWindowDays = Math.min(90, Math.max(1, Math.trunc(windowDays)));
  const now = new Date();
  const historicalCutoff = new Date(now.getTime() - boundedWindowDays * 86_400_000);
  const sources = await prisma.dataSource.findMany({
    where: { key: { in: [...ACTIVE_OTA_SOURCE_KEYS] } },
    orderBy: { key: "asc" },
  });
  return Promise.all(sources.map(async (source) => {
    const readMetrics = async (cutoff: Date) => {
      const runs = await prisma.collectionRun.findMany({
        where: { dataSourceId: source.id, createdAt: { gte: cutoff }, isDemo: false },
        select: { jobId: true, createdAt: true, status: true, successCount: true, failureCount: true, errorCode: true, scope: true, finishedAt: true },
      });
      const listingWhere = positiveOtaListingEvidenceWhere(source.id, cutoff, runs, now);
      const [executions, positiveListingCount, positiveRateCount, parserArtifactFailures, latestListing, latestRate] = await Promise.all([
        prisma.argusExecution.findMany({
          where: { dataSourceId: source.id, submittedAt: { gte: cutoff } },
          select: { status: true, result: true, errorCategory: true, submittedAt: true, completedAt: true },
        }),
        prisma.listing.count({ where: listingWhere }),
        prisma.rateObservation.count({ where: { quarantine: null, dataSourceId: source.id, isDemo: false, collectedAt: { gte: cutoff }, availabilityStatus: "AVAILABLE", feeCompleteness: "COMPLETE", totalAmountMinor: { gt: 0 } } }),
        prisma.rawArtifact.count({ where: { dataSourceId: source.id, parserFailure: true, createdAt: { gte: cutoff } } }),
        prisma.listing.findFirst({ where: listingWhere, orderBy: { lastConfirmedAt: "desc" }, select: { lastConfirmedAt: true } }),
        prisma.rateObservation.findFirst({ where: { quarantine: null, dataSourceId: source.id, isDemo: false, collectedAt: { gte: cutoff }, availabilityStatus: "AVAILABLE", feeCompleteness: "COMPLETE", totalAmountMinor: { gt: 0 } }, orderBy: { collectedAt: "desc" }, select: { collectedAt: true } }),
      ]);
      return calculateOtaHealthMetrics({
        key: source.key,
        enabled: source.enabled,
        lifecycle: source.lifecycle,
        operationalStatus: source.operationalStatus,
        runs,
        executions,
        positiveListingCount,
        positiveRateCount,
        parserArtifactFailures,
        latestListingAt: latestListing?.lastConfirmedAt ?? null,
        latestRateAt: latestRate?.collectedAt ?? null,
      });
    };
    const historicalMetrics = await readMetrics(historicalCutoff);
    const acceptanceWindow = otaRepairAcceptanceWindow(source.metadata, now);
    const cutoff = otaHealthEvidenceWindowStart(source.metadata, historicalCutoff, now);
    const metrics = cutoff.getTime() === historicalCutoff.getTime() ? historicalMetrics : await readMetrics(cutoff);
    return {
      ...metrics, windowDays: boundedWindowDays, evidenceWindowStartedAt: cutoff,
      acceptanceWindow, historicalWindowDays: boundedWindowDays, historicalMetrics,
      releaseGate: otaReleaseGate(metrics, now),
    };
  }));
}

export async function retentionCleanup(this: WorkerContext, now = new Date()) {
  return cleanupMembershipRetention(now);
}

export async function activateSource(this: WorkerContext, sourceId: string) {
  if (otaAdapters[sourceId]) {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceId } });
    const metrics = (await this.otaHealth()).find((candidate) => candidate.key === sourceId);
    if (!metrics) throw new WorkerRequestError("SOURCE_NOT_FOUND", `No OTA source exists for ${sourceId}`, 404);
    const gate = otaReleaseGate(metrics, new Date(), { requireLifecycle: false, requireOperationalStatus: false });
    if (!gate.ready) throw new WorkerRequestError("SOURCE_UNAVAILABLE", `OTA source cannot be activated: ${gate.failures.join("; ")}`, 503);
    const checkedAt = new Date();
    return prisma.$transaction(async (transaction) => {
      await transaction.sourceHealthCheck.create({ data: { dataSourceId: source.id, status: "HEALTHY", message: "OTA activation gate passed", latencyMs: metrics.averageResponseMs, metadata: { mode: "durable-ota-evidence", metrics, activationCheck: true } } });
      return transaction.dataSource.update({
        where: { id: source.id },
        data: {
          lifecycle: "PILOT",
          operationalStatus: "HEALTHY",
          status: "PILOT",
          healthStatus: "HEALTHY",
          enabled: true,
          lastReviewedAt: checkedAt,
          lastSuccessAt: metrics.lastPositiveAt,
          healthSummary: { checkedAt, mode: "durable-ota-evidence", metrics, releaseGate: gate, activationCheck: true },
          metadata: { ...jsonRecord(source.metadata), activation: { activatedAt: checkedAt.toISOString(), environment: this.environment.NODE_ENV, evidenceWindowDays: metrics.windowDays } },
        },
      });
    });
  }
  const adapter = this.publicAdapters[sourceId];
  if (!adapter) throw new WorkerRequestError("SOURCE_NOT_FOUND", `No public adapter exists for ${sourceId}`, 404);
  const health = await adapter.healthCheck(this.publicAdapterContext());
  if (health.status !== "HEALTHY") throw new WorkerRequestError("SOURCE_UNAVAILABLE", `Source cannot be activated: ${health.message}`, 503);
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceId } });
  return prisma.$transaction(async (transaction) => {
    await transaction.sourceHealthCheck.create({ data: { dataSourceId: source.id, status: health.status, message: health.message, latencyMs: health.latencyMs, metadata: { mode: health.mode, activationCheck: true } } });
    return transaction.dataSource.update({
      where: { id: source.id },
      data: {
        lifecycle: "PILOT",
        operationalStatus: "HEALTHY",
        status: "PILOT",
        healthStatus: "HEALTHY",
        enabled: true,
        lastReviewedAt: new Date(),
        lastSuccessAt: health.checkedAt,
        healthSummary: { message: health.message, checkedAt: health.checkedAt, mode: health.mode, activationCheck: true },
        metadata: { ...jsonRecord(source.metadata), activation: { activatedAt: new Date().toISOString(), environment: this.environment.NODE_ENV } },
      },
    });
  });
}

export async function suspendSource(this: WorkerContext, sourceId: string) {
  return prisma.dataSource.update({ where: { key: sourceId }, data: { lifecycle: "SUSPENDED", enabled: false, lastReviewedAt: new Date() } });
}

export async function sourceSchedulePlan(this: WorkerContext, sourceIds: string[]) {
  const requested = [...new Set(sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))].sort();
  if (!requested.length) throw new WorkerRequestError("SOURCES_REQUIRED", "At least one source is required", 422);
  const [sources, allSchedules] = await Promise.all([
    prisma.dataSource.findMany({ where: { key: { in: requested } }, orderBy: { key: "asc" } }),
    prisma.scheduleDefinition.findMany({ orderBy: { key: "asc" } }),
  ]);
  const bySource = new Map(sources.map((source) => [source.key, source]));
  const entries = requested.map((sourceId) => {
    const source = bySource.get(sourceId);
    const schedules = allSchedules.filter((schedule) => scheduleSourceId(schedule.payload) === sourceId);
    const blockers = source
      ? sourceSchedulingBlockers(source, Boolean(this.publicAdapters[sourceId]), this.environment.NODE_ENV)
      : ["source does not exist"];
    if (!schedules.length) blockers.push("no source-bound schedule is registered");
    return { sourceId, schedules: schedules.map((schedule) => ({ key: schedule.key, enabled: schedule.enabled, cronExpression: schedule.cronExpression })), blockers };
  });
  return { ready: entries.every((entry) => entry.blockers.length === 0), sources: entries, mutationPerformed: false };
}

export async function configureSourceSchedules(this: WorkerContext, sourceIds: string[], input: ConfigureSourceSchedulesRequest) {
  const requested = [...new Set(sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))].sort();
  const reason = input.reason.trim();
  if (!requested.length) throw new WorkerRequestError("SOURCES_REQUIRED", "At least one source is required", 422);
  if (reason.length < 8) throw new WorkerRequestError("INVALID_REASON", "A reason of at least 8 characters is required", 422);
  return prisma.$transaction(async (transaction) => {
    const [sources, allSchedules] = await Promise.all([
      transaction.dataSource.findMany({ where: { key: { in: requested } }, orderBy: { key: "asc" } }),
      transaction.scheduleDefinition.findMany({ orderBy: { key: "asc" } }),
    ]);
    const found = new Set(sources.map((source) => source.key));
    const missing = requested.filter((sourceId) => !found.has(sourceId));
    if (missing.length) throw new WorkerRequestError("SOURCE_NOT_FOUND", `Unknown sources: ${missing.join(", ")}`, 404);
    const schedules = allSchedules.filter((schedule) => requested.includes(scheduleSourceId(schedule.payload) ?? ""));
    const scheduledSources = new Set(schedules.map((schedule) => scheduleSourceId(schedule.payload)).filter((sourceId): sourceId is string => Boolean(sourceId)));
    const withoutSchedules = requested.filter((sourceId) => !scheduledSources.has(sourceId));
    if (withoutSchedules.length) throw new WorkerRequestError("SCHEDULES_MISSING", `No source-bound schedules for: ${withoutSchedules.join(", ")}`, 409);
    if (input.enabled) {
      const blocked = sources.flatMap((source) => sourceSchedulingBlockers(source, Boolean(this.publicAdapters[source.key]), this.environment.NODE_ENV).map((blocker) => `${source.key}: ${blocker}`));
      if (blocked.length) throw new WorkerRequestError("SOURCE_UNAVAILABLE", `Cannot enable schedules: ${blocked.join("; ")}`, 409);
    }
    const scheduleIds = schedules.map((schedule) => schedule.id);
    await transaction.scheduleDefinition.updateMany({
      where: { id: { in: scheduleIds } },
      data: { enabled: input.enabled, nextRunAt: input.enabled
        ? this.environment.NODE_ENV === "production" ? nextCollectionOutsideOfficeHours(new Date()) : new Date()
        : null },
    });
    await transaction.auditEvent.create({ data: {
      eventType: input.enabled ? "source_schedules_enabled" : "source_schedules_disabled",
      entityType: "CollectionRuntime",
      entityId: requested.join(","),
      payload: { sources: requested, schedules: schedules.map((schedule) => schedule.key), reason },
      eventHash: hashPersonalIdentifier(`source-schedules:${input.enabled}:${requested.join(",")}:${randomUUID()}`, this.environment.ACCESS_KEY_SECRET),
    } });
    const updated = await transaction.scheduleDefinition.findMany({ where: { id: { in: scheduleIds } }, orderBy: { key: "asc" } });
    return { enabled: input.enabled, sources: requested, schedules: updated, mutationPerformed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function enqueueOperationalJob(this: WorkerContext, type: "CATALOG_DISCOVERY" | "MARKET_COVERAGE_COLLECTION" | "ANCHOR_PANEL_COLLECTION" | "ROTATING_PANEL_COLLECTION", payload: Prisma.InputJsonValue = {}) {
  return enqueueJob({ type, payload, idempotencyKey: `cli:${type}:${nzDateKey(new Date())}` });
}

export async function health(this: WorkerContext) {
  const last24Hours = new Date(Date.now() - 86_400_000);
  const [heartbeats, retentionEvidence] = await Promise.all([prisma.serviceRuntimeHeartbeat.findMany(), prisma.auditEvent.findFirst({ where: { eventType: "evidence_retention_executed" }, orderBy: { createdAt: "desc" } })]);
  const fresh = (serviceId: string) => heartbeats.find(row => row.serviceId === serviceId && row.environment === this.environment.NODE_ENV && row.status === "RUNNING" && row.observedAt.getTime() > Date.now() - 90000);
  const [database, redis, queueDepth, failedJobs, failedJobsLast24Hours, sources, jobMetrics, cacheMetrics, emailMetrics, coverage, argus, membershipMetrics] = await Promise.all([
    prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`.then(() => ({ healthy: true, message: "connected" })).catch((error: unknown) => ({ healthy: false, message: error instanceof Error ? error.message : "database failed" })),
    redisHealth(this.environment.REDIS_URL),
    prisma.job.count({ where: { status: "PENDING" } }),
    prisma.job.count({ where: { status: { in: ["FAILED", "DEAD_LETTER"] } } }),
    prisma.job.count({ where: { status: { in: ["FAILED", "DEAD_LETTER"] }, updatedAt: { gte: last24Hours } } }),
    prisma.dataSource.groupBy({ by: ["operationalStatus"], _count: { _all: true } }),
    prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.workerAnalysisRequest.groupBy({ by: ["cacheHitType"], _count: { _all: true } }),
    prisma.emailDelivery.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.marketCoverage.findMany({ select: { key: true, coverage24h: true, coverage72h: true, competitorCoverage: true, collectionSuccessRate: true, sourceFailureRate: true } }),
    this.argusHealth(),
    membershipOperationalMetrics(),
  ]);
  const alerts = evaluateOperationalAlerts({
    databaseHealthy: database.healthy,
    redisHealthy: redis.healthy,
    argusHealthy: argus.healthy,
    queueDepth,
    failedJobs: failedJobsLast24Hours,
    billingFailures: membershipMetrics.billingFailuresLast24Hours,
    captchaManualRequiredLast24Hours: membershipMetrics.captcha.manualRequiredLast24Hours,
    schedulerOldestPendingAgeSeconds: membershipMetrics.scheduler.oldestPendingAgeSeconds,
    thresholds: {
      queueDepthWarning: this.environment.ALERT_QUEUE_DEPTH_WARNING,
      failedJobsCritical: this.environment.ALERT_FAILED_JOBS_CRITICAL,
      billingFailuresCritical: this.environment.ALERT_BILLING_FAILURES_CRITICAL,
      captchaManual24hWarning: this.environment.ALERT_CAPTCHA_MANUAL_24H_WARNING,
      schedulerOldestPendingSecondsWarning: this.environment.ALERT_SCHEDULER_OLDEST_PENDING_SECONDS_WARNING,
    },
  });
  return {
    process: { healthy: true, pid: process.pid, uptimeSeconds: process.uptime() },
    worker: { healthy: Boolean(fresh("worker")), heartbeat: heartbeats.find(row => row.serviceId === "worker") ?? null },
    database,
    redis,
    queue: { healthy: database.healthy, depth: queueDepth, failed: failedJobs },
    argus,
    sources,
    scheduler: { healthy: this.environment.SCHEDULER_ENABLED ? Boolean(fresh("scheduler")) : null, enabled: this.environment.SCHEDULER_ENABLED, heartbeat: heartbeats.find(row => row.serviceId === "scheduler") ?? null },
    retention: { healthy: retentionEvidence && retentionEvidence.createdAt > last24Hours ? jsonRecord(retentionEvidence.payload).failures === 0 : null, verifiedAt: retentionEvidence?.createdAt ?? null, rawArtifactTtlHours: this.environment.RAW_ARTIFACT_TTL_HOURS },
    alerts,
    metrics: {
      jobs: jobMetrics,
      cache: cacheMetrics,
      email: emailMetrics,
      coverage,
      membership: membershipMetrics,
    },
  };
}
