import { enqueueJob, prisma } from "@tymra/db";

import { nextCollectionOutsideOfficeHours } from "./collection-office-hours";
import { isProductionPublicPilotSchedule } from "./production-public-pilot";

export const PROGRESS_SCHEDULES = [
  { sourceId: "eventfinda", key: "progress-eventfinda-daily", maxPages: 3, maxDetails: 1, limit: 500 },
  { sourceId: "ticketmaster", key: "progress-ticketmaster-daily", maxPages: 3, maxDetails: 2, limit: 100 },
] as const;

export function progressSchedulePayload(sourceId: string) {
  const spec = PROGRESS_SCHEDULES.find((item) => item.sourceId === sourceId);
  if (!spec) throw new Error(`No progressive schedule is approved for ${sourceId}`);
  return { sourceId, marketScope: "new-zealand", phase: "full", maxPages: spec.maxPages, maxDetails: spec.maxDetails, limit: spec.limit };
}

export function isProductionProgressSchedule(schedule: {
  key: string; jobType: string; queueName: string; cronExpression: string; payload: unknown;
}) {
  const spec = PROGRESS_SCHEDULES.find((item) => item.key === schedule.key);
  if (!spec || schedule.jobType !== "EVENT_COLLECTION" || schedule.queueName !== "event-collection" || schedule.cronExpression !== "daily") return false;
  const expected = progressSchedulePayload(spec.sourceId);
  const payload = schedule.payload;
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    && Object.keys(payload).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, value]) => (payload as Record<string, unknown>)[key] === value);
}

export function isSuccessfulProgressTrial(sourceId: string, run: { status: string; scope: unknown }) {
  const spec = PROGRESS_SCHEDULES.find((item) => item.sourceId === sourceId);
  if (!spec || run.status !== "SUCCEEDED" || typeof run.scope !== "object" || run.scope === null || Array.isArray(run.scope)) return false;
  const scope = run.scope as Record<string, unknown>;
  if (sourceId === "eventfinda") {
    return scope.phase === "full" && scope.maxPages === spec.maxPages && scope.maxDetails === spec.maxDetails
      && scope.maxRecords === spec.limit && typeof scope.requests === "number" && scope.requests <= 24
      && scope.failureCount === 0;
  }
  const limits = scope.limits;
  const counters = scope.counters;
  return scope.requestedPhase === "full" && scope.phase === "full"
    && typeof limits === "object" && limits !== null && !Array.isArray(limits)
    && (limits as Record<string, unknown>).maxPages === spec.maxPages
    && (limits as Record<string, unknown>).maxDetails === spec.maxDetails
    && (limits as Record<string, unknown>).maxRecords === spec.limit
    && typeof counters === "object" && counters !== null && !Array.isArray(counters)
    && typeof (counters as Record<string, unknown>).requests === "number"
    && ((counters as Record<string, unknown>).requests as number) <= 20
    && (counters as Record<string, unknown>).failures === 0;
}

export async function enqueueProductionProgressTrial(sourceId: string, nodeEnv: string) {
  if (nodeEnv !== "production") throw new Error("Progressive trial requires production");
  const spec = PROGRESS_SCHEDULES.find((item) => item.sourceId === sourceId);
  if (!spec) throw new Error(`No progressive trial is approved for ${sourceId}`);
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceId } });
  const pilot = await prisma.scheduleDefinition.findUnique({ where: { key: `pilot-public-${sourceId}-weekly` } });
  if (!source.enabled || source.operationalStatus !== "HEALTHY" || !pilot?.enabled
    || !isProductionPublicPilotSchedule(pilot)) throw new Error("Progressive trial requires an active healthy weekly pilot");
  if (await prisma.job.count({ where: { status: { in: ["PENDING", "RUNNING"] }, sourceId } })) {
    throw new Error("The source already has an active collection Job");
  }
  const runs = await prisma.collectionRun.findMany({ where: { dataSourceId: source.id, isDemo: false }, orderBy: { createdAt: "desc" }, take: 2, select: { status: true, scope: true } });
  if (runs.length === 2 && runs.every((run) => isSuccessfulProgressTrial(sourceId, run))) {
    throw new Error("Two successful progressive trials already exist; enable the schedule instead");
  }
  const runAt = nextCollectionOutsideOfficeHours(new Date());
  const job = await enqueueJob({
    type: "EVENT_COLLECTION", queueName: "event-collection", sourceId,
    payload: progressSchedulePayload(sourceId),
    idempotencyKey: `progress-trial:${sourceId}:${Date.now()}`, maxAttempts: 1, runAt,
  });
  return { sourceId, jobId: job.id, runAt, mutationPerformed: true };
}

export async function enableProductionProgressSchedule(sourceId: string, nodeEnv: string) {
  if (nodeEnv !== "production") throw new Error("Progressive source schedules require production");
  const spec = PROGRESS_SCHEDULES.find((item) => item.sourceId === sourceId);
  if (!spec) throw new Error(`No progressive schedule is approved for ${sourceId}`);
  return prisma.$transaction(async (tx) => {
    const source = await tx.dataSource.findUnique({ where: { key: sourceId } });
    if (!source || !source.enabled || source.operationalStatus !== "HEALTHY" || source.providerType !== "PUBLIC" || source.isDemo) {
      throw new Error("Progressive schedule source is not enabled and healthy");
    }
    const pilotKey = `pilot-public-${sourceId}-weekly`;
    const pilot = await tx.scheduleDefinition.findUnique({ where: { key: pilotKey } });
    if (!pilot?.enabled || !isProductionPublicPilotSchedule(pilot)) throw new Error("An approved active weekly pilot is required");
    const latestRuns = await tx.collectionRun.findMany({
      where: { dataSourceId: source.id, isDemo: false }, orderBy: { createdAt: "desc" }, take: 2,
      select: { id: true, jobId: true, status: true, finishedAt: true, scope: true, job: { select: { status: true, attemptCount: true, maxAttempts: true } } },
    });
    if (latestRuns.length !== 2 || latestRuns.some((run) => !run.finishedAt || !isSuccessfulProgressTrial(sourceId, run)
      || !run.jobId || run.job?.status !== "SUCCEEDED" || run.job.attemptCount !== 1 || run.job.maxAttempts !== 1)) {
      throw new Error("The latest two exact progressive trial Jobs must both have succeeded once");
    }
    for (const run of latestRuns) {
      const artifacts = await tx.rawArtifact.findMany({ where: { collectionRunId: run.id, deletedAt: null }, select: { storageRef: true, parserFailure: true } });
      if (!artifacts.some((artifact) => artifact.storageRef.startsWith("tymra-evidence:"))
        || artifacts.some((artifact) => artifact.storageRef.startsWith("argus-evidence:") || artifact.parserFailure)) {
        throw new Error("Progressive trial evidence has not completed local retention and Argus ACK");
      }
    }
    const existing = await tx.scheduleDefinition.findUnique({ where: { key: spec.key } });
    if (existing) throw new Error("Progressive schedule already exists");
    await tx.scheduleDefinition.update({ where: { id: pilot.id }, data: { enabled: false, nextRunAt: null } });
    const nextRunAt = nextCollectionOutsideOfficeHours(new Date(Date.now() + 86_400_000));
    const schedule = await tx.scheduleDefinition.create({ data: {
      key: spec.key, jobType: "EVENT_COLLECTION", queueName: "event-collection", cronExpression: "daily",
      payload: progressSchedulePayload(sourceId), enabled: true, nextRunAt,
    } });
    return { sourceId, previousSchedule: pilotKey, schedule: { key: schedule.key, nextRunAt }, acceptedRuns: latestRuns.map((run) => run.id) };
  });
}
