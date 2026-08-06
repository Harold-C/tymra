import { randomUUID } from "node:crypto";

import { getEnvironment, type Environment } from "@tymra/config";
import { enqueueJob, hashPersonalIdentifier, prisma, type Job, type JobType, type Prisma } from "@tymra/db";
import { z } from "zod";

export const collectionControlActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enqueue"), scheduleKey: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("set_source_enabled"), sourceKey: z.string().trim().min(1).max(120), enabled: z.boolean() }),
  z.object({ action: z.literal("set_schedule_enabled"), scheduleKey: z.string().trim().min(1).max(120), enabled: z.boolean() }),
  z.object({ action: z.literal("cancel_job"), jobId: z.string().trim().min(1).max(120) }),
]);

export type CollectionControlAction = z.infer<typeof collectionControlActionSchema>;

type CollectionSourceState = {
  key: string;
  enabled?: boolean;
  operationalStatus: string;
};

const collectionJobTypes = new Set<JobType>([
  "PUBLIC_DATA_COLLECTION",
  "EVENT_COLLECTION",
  "WEATHER_COLLECTION",
  "TRANSPORT_COLLECTION",
]);

export async function runCollectionControlAction(
  adminId: string,
  inputValue: unknown,
  environment: Environment = getEnvironment(),
) {
  const input = collectionControlActionSchema.parse(inputValue);
  switch (input.action) {
    case "enqueue": return enqueueControlledCollection(adminId, input.scheduleKey, environment);
    case "set_source_enabled": return setCollectionSourceEnabled(adminId, input.sourceKey, input.enabled, environment);
    case "set_schedule_enabled": return setCollectionScheduleEnabled(adminId, input.scheduleKey, input.enabled, environment);
    case "cancel_job": return cancelCollectionJob(adminId, input.jobId, environment);
  }
}

async function enqueueControlledCollection(adminId: string, scheduleKey: string, environment: Environment) {
  const schedule = await prisma.scheduleDefinition.findUnique({ where: { key: scheduleKey } });
  if (!schedule || !collectionJobTypes.has(schedule.jobType)) throw new CollectionControlError("WORKFLOW_NOT_FOUND");
  const basePayload = jsonObject(schedule.payload);
  const sourceKey = stringValue(basePayload.sourceId);
  if (!sourceKey) throw new CollectionControlError("WORKFLOW_HAS_NO_SOURCE");
  const source = await findControllableSource(sourceKey);
  if (!source.enabled) throw new CollectionControlError("SOURCE_PAUSED");
  assertManualRunAllowed(source, environment);

  const cooldownMinutes = manualCollectionCooldownMinutes(source.key);
  const cooldownStart = new Date(Date.now() - cooldownMinutes * 60_000);
  const recent = await prisma.job.findMany({
    where: {
      sourceId: source.key,
      type: schedule.jobType,
      createdAt: { gte: cooldownStart },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const matching = recent.find((job) => workflowMatches(job, schedule.key, basePayload));
  if (matching?.status === "PENDING" || matching?.status === "RUNNING") throw new CollectionControlError("COLLECTION_ALREADY_ACTIVE");
  if (matching) throw new CollectionControlError("COLLECTION_COOLDOWN", { cooldownMinutes });

  const payload = buildControlledCollectionPayload(source, schedule.key, basePayload, environment);
  const job = await enqueueJob({
    type: schedule.jobType,
    queueName: schedule.queueName,
    payload,
    sourceId: source.key,
    maxAttempts: ["eventfinda", "ticketmaster", "fx_rates", "school_sport_nz", "school_sport_canterbury", "ticketek_events"].includes(source.key) ? 1 : 2,
    idempotencyKey: `admin-collection:${schedule.key}:${randomUUID()}`,
  });
  await writeAudit(adminId, "collection_job_enqueued", "Job", job.id, {
    sourceKey: source.key,
    scheduleKey: schedule.key,
    jobType: schedule.jobType,
    manualSafety: payload.manualSafety,
  }, environment);
  return { action: "enqueue", jobId: job.id, status: job.status, sourceKey: source.key, scheduleKey: schedule.key };
}

async function setCollectionSourceEnabled(adminId: string, sourceKey: string, enabled: boolean, environment: Environment) {
  const source = await findControllableSource(sourceKey);
  const schedules = await schedulesForSource(source.key);
  let cancelledJobs = 0;
  await prisma.$transaction(async (transaction) => {
    await transaction.dataSource.update({ where: { id: source.id }, data: { enabled } });
    if (!enabled) {
      await transaction.scheduleDefinition.updateMany({
        where: { id: { in: schedules.map((schedule) => schedule.id) } },
        data: { enabled: false, nextRunAt: null },
      });
      const cancelled = await transaction.job.updateMany({
        where: { sourceId: source.key, status: "PENDING", type: { in: [...collectionJobTypes] } },
        data: { status: "CANCELLED", completedAt: new Date(), lastErrorCode: "SOURCE_PAUSED", lastErrorMessage: "Cancelled before execution because an administrator paused the source" },
      });
      cancelledJobs = cancelled.count;
    }
  });
  await writeAudit(adminId, enabled ? "collection_source_resumed" : "collection_source_paused", "DataSource", source.id, {
    sourceKey: source.key,
    cancelledJobs,
    disabledSchedules: enabled ? 0 : schedules.length,
  }, environment);
  return { action: "set_source_enabled", sourceKey: source.key, enabled, cancelledJobs };
}

async function setCollectionScheduleEnabled(adminId: string, scheduleKey: string, enabled: boolean, environment: Environment) {
  const schedule = await prisma.scheduleDefinition.findUnique({ where: { key: scheduleKey } });
  if (!schedule || !collectionJobTypes.has(schedule.jobType)) throw new CollectionControlError("WORKFLOW_NOT_FOUND");
  const sourceKey = stringValue(jsonObject(schedule.payload).sourceId);
  if (!sourceKey) throw new CollectionControlError("WORKFLOW_HAS_NO_SOURCE");
  const source = await findControllableSource(sourceKey);
  if (enabled) {
    if (environment.NODE_ENV === "development" || !environment.SCHEDULER_ENABLED) throw new CollectionControlError("SCHEDULER_RUNTIME_DISABLED");
    if (!source.enabled) throw new CollectionControlError("SOURCE_PAUSED");
    assertCollectionAvailable(source);
  }
  const updated = await prisma.scheduleDefinition.update({
    where: { id: schedule.id },
    data: { enabled, nextRunAt: enabled ? new Date() : null },
  });
  await writeAudit(adminId, enabled ? "collection_schedule_enabled" : "collection_schedule_disabled", "ScheduleDefinition", schedule.id, {
    scheduleKey: schedule.key,
    sourceKey,
  }, environment);
  return { action: "set_schedule_enabled", scheduleKey: updated.key, enabled: updated.enabled, nextRunAt: updated.nextRunAt };
}

async function cancelCollectionJob(adminId: string, jobId: string, environment: Environment) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || !collectionJobTypes.has(job.type) || !job.sourceId) throw new CollectionControlError("JOB_NOT_FOUND");
  await findControllableSource(job.sourceId);
  const result = await prisma.job.updateMany({
    where: { id: job.id, status: "PENDING" },
    data: { status: "CANCELLED", completedAt: new Date(), lastErrorCode: "ADMIN_CANCELLED", lastErrorMessage: "Cancelled by an administrator before execution" },
  });
  if (result.count !== 1) throw new CollectionControlError("JOB_NOT_CANCELLABLE");
  await writeAudit(adminId, "collection_job_cancelled", "Job", job.id, { sourceKey: job.sourceId, jobType: job.type }, environment);
  return { action: "cancel_job", jobId: job.id, status: "CANCELLED" };
}

export function buildControlledCollectionPayload(
  source: CollectionSourceState,
  scheduleKey: string,
  basePayload: Record<string, Prisma.JsonValue>,
  environment: Pick<Environment, "NODE_ENV">,
): Prisma.InputJsonObject {
  const payload: Record<string, Prisma.InputJsonValue> = {
    ...(basePayload as Record<string, Prisma.InputJsonValue>),
    adminScheduleKey: scheduleKey,
    manualSafety: true,
  };
  if (source.key === "eventfinda") {
    if (basePayload.phase === "discovery") payload.maxPages = 1;
    if (basePayload.phase === "details") payload.maxDetails = 3;
  }
  if (source.key === "ticketmaster") {
    if (basePayload.phase === "discovery") payload.maxPages = 1;
    if (basePayload.phase === "details") payload.maxDetails = 1;
  }
  if (source.key === "ticketek_events") {
    if (basePayload.phase === "discovery") payload.limit = 10;
    if (basePayload.phase === "details") payload.maxDetails = 1;
  }
  if (source.key === "school_sport_nz" || source.key === "school_sport_canterbury") payload.limit = 20;
  if (environment.NODE_ENV === "development") {
    if (source.key === "eventfinda" || source.key === "ticketmaster") payload.developmentBootstrap = true;
    else payload.localAcceptance = true;
    payload.limit = 2;
  }
  return payload as Prisma.InputJsonObject;
}

function assertManualRunAllowed(source: Awaited<ReturnType<typeof findControllableSource>>, environment: Environment) {
  if (!collectionAvailable(source)) throw new CollectionControlError("SOURCE_UNAVAILABLE");
  if (environment.NODE_ENV === "development") return;
}

function assertCollectionAvailable(source: Awaited<ReturnType<typeof findControllableSource>>) {
  if (!collectionAvailable(source)) throw new CollectionControlError("SOURCE_UNAVAILABLE");
}

function collectionAvailable(source: CollectionSourceState) {
  return source.enabled !== false && ["HEALTHY", "DEGRADED"].includes(source.operationalStatus);
}

async function findControllableSource(sourceKey: string) {
  const source = await prisma.dataSource.findUnique({
    where: { key: sourceKey },
    select: {
      id: true,
      key: true,
      name: true,
      providerType: true,
      sourceType: true,
      enabled: true,
      environments: true,
      operationalStatus: true,
    },
  });
  if (!source || source.providerType !== "PUBLIC" || source.sourceType !== "PUBLIC_DATA") throw new CollectionControlError("SOURCE_NOT_CONTROLLABLE");
  return source;
}

async function schedulesForSource(sourceKey: string) {
  const schedules = await prisma.scheduleDefinition.findMany({ where: { jobType: { in: [...collectionJobTypes] } } });
  return schedules.filter((schedule) => stringValue(jsonObject(schedule.payload).sourceId) === sourceKey);
}

function workflowMatches(job: Job, scheduleKey: string, basePayload: Record<string, Prisma.JsonValue>) {
  const payload = jsonObject(job.payload);
  if (payload.adminScheduleKey === scheduleKey) return true;
  return stringValue(payload.sourceId) === stringValue(basePayload.sourceId)
    && stringValue(payload.phase) === stringValue(basePayload.phase);
}

export function manualCollectionCooldownMinutes(sourceKey: string) {
  if (sourceKey === "ticketmaster" || sourceKey === "ticketek_events") return 30;
  if (sourceKey === "school_sport_nz" || sourceKey === "school_sport_canterbury") return 15;
  if (sourceKey === "eventfinda") return 15;
  return 5;
}

async function writeAudit(
  adminId: string,
  eventType: string,
  entityType: string,
  entityId: string,
  payload: Prisma.InputJsonObject,
  environment: Environment,
) {
  await prisma.auditEvent.create({
    data: {
      actorAdminId: adminId,
      eventType,
      entityType,
      entityId,
      payload,
      eventHash: hashPersonalIdentifier(`${eventType}:${entityId}:${randomUUID()}`, environment.ACCESS_KEY_SECRET),
      isDemo: environment.NODE_ENV === "test",
    },
  });
}

function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function stringValue(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value : "";
}

export class CollectionControlError extends Error {
  constructor(public readonly code: string, public readonly detail: Record<string, number> = {}) {
    super(code);
  }
}
