import { randomUUID } from "node:crypto";
import { getEnvironment, type Environment } from "@tymra/config";
import { prisma, type JobType, type Prisma } from "@tymra/db";
import { serviceCollectionJobTypes } from "@tymra/domain";
import { z } from "zod";
import { writeServiceAudit } from "./service-recovery";
import { sendOtaServiceCommand } from "./worker-service-control";

export const collectionControlActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enqueue"), scheduleKey: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("set_source_enabled"), sourceKey: z.string().trim().min(1).max(120), enabled: z.boolean() }),
  z.object({ action: z.literal("set_schedule_enabled"), scheduleKey: z.string().trim().min(1).max(120), enabled: z.boolean() }),
  z.object({ action: z.literal("cancel_job"), jobId: z.string().trim().min(1).max(120) }),
]).and(z.object({ reason: z.string().trim().min(3).max(1000), commandId: z.string().min(8).max(200).optional() }));
export type CollectionControlAction = z.infer<typeof collectionControlActionSchema>;
type CollectionSourceState = { key: string; enabled?: boolean; operationalStatus: string };
const collectionJobTypes: JobType[] = [...serviceCollectionJobTypes];

export async function runCollectionControlAction(adminId: string, inputValue: unknown, environment: Environment = getEnvironment()) {
  const input = collectionControlActionSchema.parse(inputValue);
  const commandId = input.commandId ?? randomUUID();
  const schedule = "scheduleKey" in input ? await prisma.scheduleDefinition.findUnique({ where: { key: input.scheduleKey } }) : null;
  const originalJob = input.action === "cancel_job" ? await prisma.job.findUnique({ where: { id: input.jobId } }) : null;
  if ("scheduleKey" in input && (!schedule || !collectionJobTypes.includes(schedule.jobType))) throw new CollectionControlError("WORKFLOW_NOT_FOUND");
  if (input.action === "cancel_job" && (!originalJob || !collectionJobTypes.includes(originalJob.type))) throw new CollectionControlError("JOB_NOT_FOUND");
  const sourceKey = "sourceKey" in input ? input.sourceKey : schedule ? stringValue(jsonObject(schedule.payload).sourceId) : originalJob?.sourceId;
  if (!sourceKey) throw new CollectionControlError("WORKFLOW_HAS_NO_SOURCE");
  const source = await prisma.dataSource.findUnique({ where: { key: sourceKey } });
  if (!source || source.isDemo || !["PUBLIC", "OTA"].includes(source.providerType) || !["PUBLIC_DATA", "OTA"].includes(source.sourceType)) throw new CollectionControlError("SOURCE_NOT_CONTROLLABLE");
  if (source.providerType === "PUBLIC" && input.action === "set_schedule_enabled" && input.enabled && environment.NODE_ENV === "production") {
    return sendOtaServiceCommand({ adminId, commandId, sourceKey: source.key, scheduleKey: schedule!.key, reason: input.reason, action: "ENABLE_PUBLIC_SCHEDULE" }, environment);
  }
  if (source.providerType === "OTA" && (input.action === "enqueue" || (input.action === "set_source_enabled" && input.enabled) || (input.action === "set_schedule_enabled" && input.enabled))) {
    if (schedule && schedule.key !== `pilot-ota-${source.key}-daily`) throw new CollectionControlError("OTA_WORKFLOW_CONTRACT_REJECTED");
    return sendOtaServiceCommand({ adminId, commandId, sourceKey: source.key, reason: input.reason, action: input.action === "enqueue" ? "TRIAL" : input.action === "set_source_enabled" ? "RESUME_SOURCE" : "ENABLE_SCHEDULE" }, environment);
  }
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "DataSource" WHERE id = ${source.id} FOR UPDATE`;
    const current = await tx.dataSource.findUniqueOrThrow({ where: { id: source.id } });
    let response: Prisma.InputJsonObject;
    let entityType = "DataSource"; let entityId = source.id;
    if (input.action === "enqueue") {
      const key = `service-collection:${commandId}`;
      const duplicate = await tx.job.findUnique({ where: { idempotencyKey: key } });
      if (duplicate) {
        if (duplicate.sourceId !== source.key || duplicate.type !== schedule!.jobType) throw new CollectionControlError("SERVICE_COMMAND_COLLISION");
        return { action: "enqueue", jobId: duplicate.id, status: duplicate.status, sourceKey: source.key, scheduleKey: schedule!.key };
      }
      if (!current.enabled) throw new CollectionControlError("SOURCE_PAUSED");
      if (!["HEALTHY", "DEGRADED"].includes(current.operationalStatus)) throw new CollectionControlError("SOURCE_UNAVAILABLE");
      if (environment.NODE_ENV === "development" && !current.environments.includes("DEVELOPMENT")) throw new CollectionControlError("SOURCE_ENVIRONMENT_DISABLED");
      const cooldownMinutes = manualCollectionCooldownMinutes(source.key);
      const active = await tx.job.findFirst({ where: { sourceId: source.key, type: schedule!.jobType, status: { in: ["PENDING", "RUNNING"] } } });
      if (active) throw new CollectionControlError("COLLECTION_ALREADY_ACTIVE");
      const recent = await tx.job.findMany({ where: { sourceId: source.key, type: schedule!.jobType, createdAt: { gte: new Date(Date.now() - cooldownMinutes * 60000) } }, orderBy: { createdAt: "desc" }, take: 20 });
      const base = jsonObject(schedule!.payload);
      if (recent.some(job => { const p = jsonObject(job.payload); return p.adminScheduleKey === schedule!.key || stringValue(p.phase) === stringValue(base.phase); })) throw new CollectionControlError("COLLECTION_COOLDOWN", { cooldownMinutes });
      const job = await tx.job.create({ data: { type: schedule!.jobType, queueName: schedule!.queueName, payload: buildControlledCollectionPayload(current, schedule!.key, base, environment), sourceId: source.key, idempotencyKey: key, maxAttempts: ["eventfinda", "ticketmaster", "fx_rates", "school_sport_nz", "school_sport_canterbury", "ticketek_events"].includes(source.key) ? 1 : 2 } });
      response = { action: "enqueue", jobId: job.id, status: job.status, sourceKey: source.key, scheduleKey: schedule!.key };
      entityType = "Job"; entityId = job.id;
    } else if (input.action === "set_source_enabled") {
      await tx.dataSource.update({ where: { id: current.id }, data: { enabled: input.enabled } });
      const schedules = await tx.scheduleDefinition.findMany({ where: { jobType: { in: collectionJobTypes }, payload: { path: ["sourceId"], equals: source.key } } });
      let cancelledJobs = 0;
      if (!input.enabled) {
        await tx.scheduleDefinition.updateMany({ where: { id: { in: schedules.map(s => s.id) } }, data: { enabled: false, nextRunAt: null } });
        cancelledJobs = (await tx.job.updateMany({ where: { sourceId: source.key, type: { in: collectionJobTypes }, status: "PENDING" }, data: { status: "CANCELLED", completedAt: new Date(), lastErrorCode: "SOURCE_PAUSED" } })).count;
      }
      response = { action: input.action, sourceKey: source.key, enabled: input.enabled, cancelledJobs, observedHealthUnchanged: true };
    } else if (input.action === "set_schedule_enabled") {
      if (input.enabled && (environment.NODE_ENV === "development" || !environment.SCHEDULER_ENABLED)) throw new CollectionControlError("SCHEDULER_RUNTIME_DISABLED");
      if (input.enabled && !current.enabled) throw new CollectionControlError("SOURCE_PAUSED");
      if (input.enabled && !["HEALTHY", "DEGRADED"].includes(current.operationalStatus)) throw new CollectionControlError("SOURCE_UNAVAILABLE");
      const updated = await tx.scheduleDefinition.update({ where: { id: schedule!.id }, data: { enabled: input.enabled, nextRunAt: input.enabled ? new Date() : null } });
      response = { action: input.action, scheduleKey: updated.key, enabled: updated.enabled, nextRunAt: updated.nextRunAt?.toISOString() ?? null };
      entityType = "ScheduleDefinition"; entityId = updated.id;
    } else {
      const cancelled = await tx.job.updateMany({ where: { id: originalJob!.id, status: "PENDING" }, data: { status: "CANCELLED", completedAt: new Date(), lastErrorCode: "ADMIN_CANCELLED" } });
      if (cancelled.count !== 1) throw new CollectionControlError("JOB_NOT_CANCELLABLE");
      response = { action: input.action, jobId: originalJob!.id, status: "CANCELLED" };
      entityType = "Job"; entityId = originalJob!.id;
    }
    await writeServiceAudit(tx, adminId, `collection_${input.action}`, entityType, entityId, { commandId, reason: input.reason, sourceKey: source.key, before: { enabled: current.enabled, health: current.operationalStatus }, after: response });
    return response;
  });
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


export function manualCollectionCooldownMinutes(sourceKey: string) {
  if (sourceKey === "ticketmaster" || sourceKey === "ticketek_events") return 30;
  if (["eventfinda", "school_sport_nz", "school_sport_canterbury"].includes(sourceKey)) return 15;
  return 5;
}
function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {}; }
function stringValue(value: Prisma.JsonValue | undefined) { return typeof value === "string" ? value : ""; }
export class CollectionControlError extends Error {
  constructor(readonly code: string, readonly detail: { cooldownMinutes?: number } = {}) { super(code); }
}
