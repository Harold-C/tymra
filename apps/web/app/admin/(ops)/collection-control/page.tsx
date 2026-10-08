import { getEnvironment } from "@tymra/config";
import { prisma, type JobType, type Prisma } from "@tymra/db";
import { serviceCollectionJobTypes } from "@tymra/domain";

import { CollectionControlPanel, type CollectionControlView } from "@/components/admin/CollectionControlPanel";
import { getAdminLocale } from "@/lib/server/admin-locale";
import { ServiceWaiverForm } from "@/components/admin/ServiceWaiverForm";
import { ServiceRecoveryAction } from "@/components/admin/ServiceRecoveryAction";

const collectionJobTypes: JobType[] = [...serviceCollectionJobTypes];

export const dynamic = "force-dynamic";

export default async function CollectionControlPage() {
  const environment = getEnvironment();
  const locale = getAdminLocale();
  const schedules = await prisma.scheduleDefinition.findMany({
    where: { jobType: { in: collectionJobTypes } },
    orderBy: [{ queueName: "asc" }, { key: "asc" }],
  });
  const sourceKeys = [...new Set(schedules.map((schedule) => stringValue(jsonObject(schedule.payload).sourceId)).filter(Boolean))];
  const [sources, runs, jobs, groupedJobs] = await Promise.all([
    prisma.dataSource.findMany({
      where: { key: { in: sourceKeys }, providerType: { in: ["PUBLIC", "OTA"] }, sourceType: { in: ["PUBLIC_DATA", "OTA"] }, isDemo: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        enabled: true,
        operationalStatus: true,
        environments: true,
        lastSuccessAt: true,
        errorRate: true,
      },
    }),
    prisma.collectionRun.findMany({
      where: { dataSource: { key: { in: sourceKeys } }, isDemo: false },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, dataSourceId: true, status: true, startedAt: true, finishedAt: true, successCount: true, failureCount: true, errorCode: true },
    }),
    prisma.job.findMany({
      where: { sourceId: { in: sourceKeys }, type: { in: collectionJobTypes } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, sourceId: true, type: true, status: true, payload: true, attemptCount: true, maxAttempts: true, runAt: true, createdAt: true, completedAt: true, lastErrorCode: true },
    }),
    prisma.job.groupBy({ where: { type: { in: collectionJobTypes } }, by: ["status"], _count: { _all: true } }),
  ]);
  const latestRun = new Map<string, (typeof runs)[number]>();
  for (const run of runs) if (!latestRun.has(run.dataSourceId)) latestRun.set(run.dataSourceId, run);
  const schedulesBySource = new Map<string, CollectionControlView["sources"][number]["schedules"]>();
  for (const schedule of schedules) {
    const sourceKey = stringValue(jsonObject(schedule.payload).sourceId);
    if (!sourceKey) continue;
    const payload = jsonObject(schedule.payload);
    const item = {
      key: schedule.key,
      jobType: schedule.jobType,
      queueName: schedule.queueName,
      frequency: schedule.cronExpression,
      enabled: schedule.enabled,
      phase: stringValue(payload.phase) || null,
      nextRunAt: iso(schedule.nextRunAt),
      lastEnqueuedAt: iso(schedule.lastEnqueuedAt),
    };
    schedulesBySource.set(sourceKey, [...(schedulesBySource.get(sourceKey) ?? []), item]);
  }
  const jobCounts = Object.fromEntries(groupedJobs.map((item) => [item.status, item._count._all]));
  const view: CollectionControlView = {
    schedulerEnabled: environment.NODE_ENV !== "development" && environment.SCHEDULER_ENABLED,
    nodeEnvironment: environment.NODE_ENV,
    summary: {
      sources: sources.length,
      enabledSources: sources.filter((source) => source.enabled).length,
      pendingJobs: jobCounts.PENDING ?? 0,
      runningJobs: jobCounts.RUNNING ?? 0,
      failedJobs: (jobCounts.FAILED ?? 0) + (jobCounts.DEAD_LETTER ?? 0),
    },
    sources: sources.map((source) => {
      const lastRun = latestRun.get(source.id);
      const activeJob = jobs.find((job) => job.sourceId === source.key && (job.status === "PENDING" || job.status === "RUNNING"));
      return {
        key: source.key,
        name: source.name,
        enabled: source.enabled,
        operationalStatus: source.operationalStatus,
        developmentAllowed: source.environments.includes("DEVELOPMENT"),
        operationallyReady: ["HEALTHY", "DEGRADED"].includes(source.operationalStatus),
        lastSuccessAt: iso(source.lastSuccessAt),
        errorRate: source.errorRate,
        schedules: schedulesBySource.get(source.key) ?? [],
        activeJob: activeJob ? { id: activeJob.id, status: activeJob.status, workflow: workflowLabel(activeJob.payload, activeJob.type) } : null,
        lastRun: lastRun ? { id: lastRun.id, status: lastRun.status, startedAt: iso(lastRun.startedAt), finishedAt: iso(lastRun.finishedAt), successCount: lastRun.successCount, failureCount: lastRun.failureCount, errorCode: lastRun.errorCode } : null,
      };
    }),
    jobs: jobs.map((job) => ({
      id: job.id,
      sourceKey: job.sourceId ?? "",
      type: job.type,
      workflow: workflowLabel(job.payload, job.type),
      status: job.status,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      runAt: job.runAt.toISOString(),
      createdAt: job.createdAt.toISOString(),
      completedAt: iso(job.completedAt),
      lastErrorCode: job.lastErrorCode,
    })),
  };
  const waivers = await prisma.serviceWaiver.findMany({ include: { schedule: { select: { key: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  return <><CollectionControlPanel locale={locale} view={view} /><section className="admin-detail-section"><h2>{locale === "zh" ? "临时计划豁免" : "Temporary schedule waivers"}</h2><p>{locale === "zh" ? "豁免只跳过指定时间窗内的计划，不改变来源健康、质量门槛或预算。历史保持可查。" : "A waiver skips one schedule within its time window. Health, quality gates and budgets remain unchanged."}</p><ServiceWaiverForm schedules={schedules.filter(s => s.enabled)} locale={locale} />{waivers.map(waiver => <article key={waiver.id} className="admin-detail-section"><strong>{waiver.schedule.key}</strong><p>{waiver.reason} · {waiver.expiresAt.toISOString()} · {waiver.revokedAt ? "REVOKED" : waiver.expiresAt > new Date() ? "ACTIVE" : "EXPIRED"}</p>{!waiver.revokedAt && waiver.expiresAt > new Date() ? <ServiceRecoveryAction locale={locale} endpoint={`/api/v1/admin/waivers/${waiver.id}/actions`} action="REVOKE" label={locale === "zh" ? "提前结束豁免" : "End waiver"} completedMessage={locale === "zh" ? "豁免已结束，已恢复原计划。" : "Waiver ended; original schedule restored."} /> : null}</article>)}</section></>;
}

function workflowLabel(payloadValue: Prisma.JsonValue, fallback: string) {
  const payload = jsonObject(payloadValue);
  return stringValue(payload.adminScheduleKey) || stringValue(payload.phase) || fallback;
}

function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function stringValue(value: Prisma.JsonValue | undefined) { return typeof value === "string" ? value : ""; }
function iso(value: Date | null) { return value?.toISOString() ?? null; }
