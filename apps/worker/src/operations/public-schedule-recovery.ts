import { prisma, type Prisma } from "@tymra/db";
import { nextCollectionOutsideOfficeHours } from "./collection-office-hours";
import { isProductionPublicPilotSchedule, publicPilotRequestLimit } from "./production-public-pilot";
import { isProductionProgressSchedule, isSuccessfulProgressTrial } from "./production-progress-schedules";

export const PUBLIC_RECOVERY_SOURCES = ["eventfinda", "ticketmaster", "school_sport_nz", "queenstownnz_events", "southlandnz_events", "wellington_airport_monthly", "queenstown_airport_monthly"] as const;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function recoveryState(tx: Prisma.TransactionClient, sourceKey: string, nodeEnv: string, revision: string) {
  if (nodeEnv !== "production" || !PUBLIC_RECOVERY_SOURCES.includes(sourceKey as typeof PUBLIC_RECOVERY_SOURCES[number]) || !/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error("Public schedule recovery requires an approved production source and exact revision");
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'public-schedule-recovery:'+sourceKey}))`;
  const source = await tx.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
  const plans = await tx.scheduleDefinition.findMany({ where: { payload: { path: ["sourceId"], equals: sourceKey } } });
  if (source.providerType !== "PUBLIC" || source.isDemo || !source.environments.includes("PRODUCTION")
    || source.operationalStatus !== "HEALTHY" || record(source.metadata).boundedProductionCanary !== true
    || plans.length !== 1 || (!isProductionProgressSchedule(plans[0]!) && !isProductionPublicPilotSchedule(plans[0]!))) {
    throw new Error("Public recovery source or existing schedule is not approved");
  }
  return { source, plan: plans[0]!, metadata: record(source.metadata) };
}

export async function preparePublicScheduleRecovery(sourceKey: string, nodeEnv: string, revision: string) {
  return prisma.$transaction((tx) => preparePublicScheduleRecoveryTransaction(tx, sourceKey, nodeEnv, revision));
}

export async function preparePublicScheduleRecoveryTransaction(tx: Prisma.TransactionClient, sourceKey: string, nodeEnv: string, revision: string) {
    const { source, plan, metadata } = await recoveryState(tx, sourceKey, nodeEnv, revision);
    if (plan.enabled || await tx.job.count({ where: { sourceId: sourceKey, status: { in: ["PENDING", "RUNNING"] } } })) throw new Error("Recovery requires a paused plan and idle source");
    const existing = record(metadata.publicScheduleRepair);
    const sameVersion = existing.revision === revision && typeof existing.startedAt === "string";
    const checkpoint = sameVersion ? existing : { revision, startedAt: new Date().toISOString(), previous: Object.keys(existing).length ? existing : null };
    await tx.dataSource.update({ where: { id: source.id }, data: { enabled: true, lifecycle: "PILOT",
      ...(sourceKey === "queenstown_airport_monthly" ? { dailyBudget: Math.max(12, source.dailyBudget) } : {}),
      metadata: { ...metadata, publicScheduleRepair: checkpoint } as Prisma.InputJsonValue,
    } });
    return { sourceKey, revision, startedAt: checkpoint.startedAt, scheduleEnabled: false };
}

export async function enqueuePublicRecoveryTrial(sourceKey: string, nodeEnv: string, revision: string) {
  return prisma.$transaction((tx) => enqueuePublicRecoveryTrialTransaction(tx, sourceKey, nodeEnv, revision));
}

export async function enqueuePublicRecoveryTrialTransaction(tx: Prisma.TransactionClient, sourceKey: string, nodeEnv: string, revision: string) {
    const { source, plan, metadata } = await recoveryState(tx, sourceKey, nodeEnv, revision);
    if (!source.enabled || plan.enabled || record(metadata.publicScheduleRepair).revision !== revision) throw new Error("Recovery trial has not been prepared for this revision");
    if (await tx.job.count({ where: { status: { in: ["PENDING", "RUNNING"] } } })) throw new Error("Serial recovery trial requires an idle Tymra queue");
    // The existing scheduler sees these exact-plan successes after the old failure.
    const prefix = `schedule:${plan.key}:recovery:${revision}:`;
    const ordinal = await tx.job.count({ where: { idempotencyKey: { startsWith: prefix } } }) + 1;
    const job = await tx.job.create({ data: { type: plan.jobType, queueName: plan.queueName, sourceId: sourceKey,
      payload: plan.payload as Prisma.InputJsonValue, idempotencyKey: `${prefix}${ordinal}`, maxAttempts: 1 } });
    return { sourceKey, jobId: job.id, ordinal };
}

export async function enableRecoveredPublicSchedule(sourceKey: string, nodeEnv: string, revision: string) {
  return prisma.$transaction((tx) => enableRecoveredPublicScheduleTransaction(tx, sourceKey, nodeEnv, revision));
}

export async function enableRecoveredPublicScheduleTransaction(tx: Prisma.TransactionClient, sourceKey: string, nodeEnv: string, revision: string) {
    const { source, plan, metadata } = await recoveryState(tx, sourceKey, nodeEnv, revision);
    const checkpoint = record(metadata.publicScheduleRepair);
    const start = typeof checkpoint.startedAt === "string" ? new Date(checkpoint.startedAt) : null;
    if (!source.enabled || checkpoint.revision !== revision || !start || !Number.isFinite(start.getTime())) throw new Error("Recovery acceptance checkpoint is missing");
    if (await tx.job.count({ where: { sourceId: sourceKey, status: { in: ["PENDING", "RUNNING"] } } })) throw new Error("Recovery source still has an active job");
    const runs = await tx.collectionRun.findMany({ where: { dataSourceId: source.id, isDemo: false, createdAt: { gte: start } }, orderBy: { createdAt: "desc" }, take: 2, include: { job: true } });
    if (runs.length !== 2 || runs.some((run) => {
      const scope = record(run.scope), counters = record(scope.counters);
      return run.status !== "SUCCEEDED" || run.successCount < 1 || run.failureCount !== 0 || !run.finishedAt
        || run.job?.status !== "SUCCEEDED" || run.job.attemptCount !== 1 || run.job.maxAttempts !== 1
        || !run.job.idempotencyKey.startsWith(`schedule:${plan.key}:recovery:${revision}:`)
        || !samePayload(run.job.payload, plan.payload)
        || (isProductionProgressSchedule(plan) ? !isSuccessfulProgressTrial(sourceKey, run)
          : scope.productionCanary !== true || scope.configurationUnchanged !== true || scope.schedulesUnchanged !== true
            || counters.failures !== 0 || typeof counters.requests !== "number" || counters.requests < 1 || counters.requests > publicPilotRequestLimit(sourceKey));
    })) throw new Error("The latest two exact recovery trials must finish fully in one attempt");
    for (const run of runs) {
      const artifacts = await tx.rawArtifact.findMany({ where: { collectionRunId: run.id, deletedAt: null } });
      if (!artifacts.length || artifacts.some((a) => a.parserFailure || a.storageRef.startsWith("argus-evidence:"))) throw new Error("Recovery evidence is incomplete or failed");
      if (["eventfinda", "ticketmaster", "school_sport_nz"].includes(sourceKey)) {
        const executions = await tx.argusExecution.findMany({ where: { collectionRunId: run.id } });
        if (!executions.length || executions.some((e) => e.status !== "COMPLETED" || !e.deliveryVerifiedAt)
          || !artifacts.some((a) => a.storageRef.startsWith("tymra-evidence:"))) throw new Error("Recovery browser evidence delivery is incomplete");
      }
    }
    const acceptedRuns = runs.map((run) => run.id);
    const nextRunAt = plan.enabled && plan.nextRunAt ? plan.nextRunAt : nextCollectionOutsideOfficeHours(new Date(Date.now() + (plan.cronExpression === "daily" ? 1 : 7) * 86_400_000));
    await tx.scheduleDefinition.update({ where: { id: plan.id }, data: { enabled: true, nextRunAt } });
    await tx.dataSource.update({ where: { id: source.id }, data: { lifecycle: "PRODUCTION", enabled: true, metadata: {
      ...metadata, publicScheduleRepair: { ...checkpoint, acceptedRuns, enabledAt: new Date().toISOString() },
    } as Prisma.InputJsonValue } });
    return { sourceKey, schedule: plan.key, enabled: true, nextRunAt, acceptedRuns };
}

function samePayload(actual: unknown, expected: unknown) {
  const left = record(actual), right = record(expected);
  return Object.keys(left).length === Object.keys(right).length
    && Object.entries(right).every(([key, value]) => left[key] === value);
}
