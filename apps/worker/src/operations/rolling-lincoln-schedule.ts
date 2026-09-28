import { enqueueJob, prisma, type Prisma } from "@tymra/db";
import { nzDateKey } from "@tymra/domain";

import { nextCollectionOutsideOfficeHours } from "./collection-office-hours";

export const ROLLING_LINCOLN_SCHEDULE_KEY = "rolling-christchurch-university-dates-weekly";

export function rollingLincolnSchedulePayload() {
  return { sourceId: "christchurch_university_dates", marketScope: "christchurch", limit: 200, rollingLincoln: true };
}

export function isRollingLincolnSchedule(schedule: {
  key: string; jobType: string; queueName: string; cronExpression: string; payload: unknown;
}) {
  if (schedule.key !== ROLLING_LINCOLN_SCHEDULE_KEY || schedule.jobType !== "PUBLIC_DATA_COLLECTION"
    || schedule.queueName !== "public-data-collection" || schedule.cronExpression !== "weekly") return false;
  const payload = schedule.payload;
  const expected = rollingLincolnSchedulePayload();
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    && Object.keys(payload).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, value]) => (payload as Record<string, unknown>)[key] === value);
}

export async function prepareRollingLincolnAcceptance(nodeEnv: string) {
  if (nodeEnv !== "production") throw new Error("Rolling Lincoln preparation requires production");
  return prisma.$transaction(async (tx) => {
    const source = await tx.dataSource.findUniqueOrThrow({ where: { key: "christchurch_university_dates" } });
    const metadata = source.metadata;
    if (!source.enabled || source.operationalStatus !== "HEALTHY" || source.providerType !== "PUBLIC"
      || source.isDemo || !source.environments.includes("PRODUCTION")
      || typeof metadata !== "object" || metadata === null || Array.isArray(metadata)
      || (metadata as Record<string, unknown>).lincolnAcceptanceOnly !== true) {
      throw new Error("Lincoln source is not in the expected production acceptance state");
    }
    if (await tx.scheduleDefinition.count({ where: { enabled: true, payload: { path: ["sourceId"], equals: source.key } } })) {
      throw new Error("Lincoln preparation requires no enabled schedule");
    }
    const updated = await tx.dataSource.update({ where: { id: source.id }, data: {
      supportedDomains: ["www.lincoln.ac.nz", "www.canterbury.ac.nz"], dailyBudget: 3,
      metadata: { ...(metadata as Prisma.JsonObject), rollingLincolnTrial: true },
    }, select: { key: true, dailyBudget: true, supportedDomains: true } });
    return { ...updated, mutationPerformed: true };
  });
}

export async function enqueueRollingLincolnTrial(nodeEnv: string) {
  if (nodeEnv !== "production") throw new Error("Rolling Lincoln trial requires production");
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "christchurch_university_dates" } });
  const metadata = source.metadata;
  if (!source.enabled || source.operationalStatus !== "HEALTHY" || source.dailyBudget !== 3
    || typeof metadata !== "object" || metadata === null || Array.isArray(metadata)
    || (metadata as Record<string, unknown>).lincolnAcceptanceOnly !== true
    || (metadata as Record<string, unknown>).rollingLincolnTrial !== true) {
    throw new Error("Rolling Lincoln trial requires the prepared acceptance source");
  }
  if (await prisma.job.count({ where: { sourceId: source.key, status: { in: ["PENDING", "RUNNING"] } } })) {
    throw new Error("The university source already has an active Job");
  }
  const prior = await prisma.collectionRun.findFirst({ where: { dataSourceId: source.id, isDemo: false, scope: { path: ["rollingLincoln"], equals: true } }, orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true } });
  const runAt = nextCollectionOutsideOfficeHours(new Date());
  if (prior && (prior.status !== "SUCCEEDED" || nzDateKey(prior.createdAt) === nzDateKey(runAt))) {
    throw new Error("The previous rolling trial must succeed and the next trial must use a new New Zealand budget day");
  }
  const job = await enqueueJob({
    type: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", sourceId: source.key,
    payload: rollingLincolnSchedulePayload(), idempotencyKey: `rolling-lincoln-trial:${nzDateKey(runAt)}`,
    maxAttempts: 1, runAt,
  });
  return { sourceId: source.key, jobId: job.id, runAt, mutationPerformed: true };
}

export async function enableRollingLincolnSchedule(nodeEnv: string) {
  if (nodeEnv !== "production") throw new Error("Rolling Lincoln activation requires production");
  return prisma.$transaction(async (tx) => {
    const source = await tx.dataSource.findUnique({ where: { key: "christchurch_university_dates" } });
    if (!source || !source.enabled || source.operationalStatus !== "HEALTHY" || source.providerType !== "PUBLIC"
      || source.isDemo || !source.environments.includes("PRODUCTION") || source.dailyBudget !== 3) throw new Error("Lincoln source is not enabled and healthy with its three-request budget");
    const metadata = source.metadata;
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)
      || (metadata as Record<string, unknown>).lincolnAcceptanceOnly !== true
      || (metadata as Record<string, unknown>).rollingLincolnTrial !== true) throw new Error("Lincoln source is not in the expected acceptance state");
    const runs = await tx.collectionRun.findMany({
      where: { dataSourceId: source.id, isDemo: false, scope: { path: ["rollingLincoln"], equals: true } },
      orderBy: { createdAt: "desc" }, take: 2,
      select: { id: true, status: true, successCount: true, scope: true, createdAt: true },
    });
    if (runs.length !== 2 || runs.some((run) => {
      const counters = run.scope && typeof run.scope === "object" && !Array.isArray(run.scope)
        ? (run.scope as Record<string, unknown>).counters : null;
      return run.status !== "SUCCEEDED" || run.successCount < 1 || !counters || typeof counters !== "object"
        || Array.isArray(counters) || (counters as Record<string, unknown>).visitedReferences !== 3;
    })) throw new Error("Two complete rolling university production passes are required");
    if (nzDateKey(runs[0]!.createdAt) === nzDateKey(runs[1]!.createdAt)) {
      throw new Error("Rolling university acceptance passes must use separate New Zealand budget days");
    }
    for (const run of runs) {
      const artifacts = await tx.rawArtifact.findMany({ where: { collectionRunId: run.id, deletedAt: null }, select: { storageRef: true } });
      if (!artifacts.some((artifact) => artifact.storageRef.startsWith("tymra-evidence:"))
        || artifacts.some((artifact) => artifact.storageRef.startsWith("argus-evidence:"))) {
        throw new Error("Lincoln production evidence has not completed local retention and Argus ACK");
      }
    }
    if (await tx.scheduleDefinition.findUnique({ where: { key: ROLLING_LINCOLN_SCHEDULE_KEY } })) throw new Error("Rolling Lincoln schedule already exists");
    await tx.dataSource.update({ where: { id: source.id }, data: {
      name: "Christchurch university key dates", supportedDomains: ["www.lincoln.ac.nz", "www.canterbury.ac.nz"],
      metadata: { ...(metadata as Prisma.JsonObject), lincolnAcceptanceOnly: false, rollingLincolnApproved: true },
    } });
    const nextRunAt = nextCollectionOutsideOfficeHours(new Date(Date.now() + 7 * 86_400_000));
    const schedule = await tx.scheduleDefinition.create({ data: {
      key: ROLLING_LINCOLN_SCHEDULE_KEY, jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection",
      cronExpression: "weekly", payload: rollingLincolnSchedulePayload(), enabled: true, nextRunAt,
    } });
    return { sourceId: source.key, acceptedRuns: runs.map((run) => run.id), schedule: { key: schedule.key, nextRunAt } };
  });
}
