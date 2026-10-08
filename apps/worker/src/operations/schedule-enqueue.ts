import { prisma, type Prisma } from "@tymra/db";
import { type Environment } from "@tymra/config";
import { automaticSchedulingAllowed, sourceCollectionBlockers } from "./source-access";
import { classifySchedule, sourceMeetsSchedulePolicy } from "./schedule-policy";

/** Rechecks intent and expiry under the same lock used by Admin pause and waiver. */
export async function enqueueScheduleIfDue(scheduleId: string, now: Date, intervalMs: number, environment: Environment) {
  if (!automaticSchedulingAllowed(environment.NODE_ENV, environment.SCHEDULER_ENABLED)) return null;
  return prisma.$transaction(async tx => {
    const initial = await tx.scheduleDefinition.findUniqueOrThrow({ where: { id: scheduleId } });
    const initialPayload = initial.payload as Prisma.JsonObject;
    const initialSourceId = typeof initialPayload.sourceId === "string" ? initialPayload.sourceId : undefined;
    if (initialSourceId) await tx.$queryRaw`SELECT id FROM "DataSource" WHERE key = ${initialSourceId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE id = ${scheduleId} FOR UPDATE`;
    const schedule = await tx.scheduleDefinition.findUniqueOrThrow({ where: { id: scheduleId } });
    if (!schedule.enabled || (schedule.nextRunAt && schedule.nextRunAt > now)) return null;
    if (await tx.serviceWaiver.count({ where: { scheduleId, revokedAt: null, expiresAt: { gt: now } } })) return null;
    const payload = schedule.payload as Prisma.JsonObject;
    const sourceId = typeof payload.sourceId === "string" ? payload.sourceId : undefined;
    if (sourceId !== initialSourceId) return null;
    const policy = classifySchedule(schedule);
    if (environment.NODE_ENV === "production" && !policy) return null;
    if (sourceId) {
      const source = await tx.dataSource.findUnique({ where: { key: sourceId } });
      if (!source || sourceCollectionBlockers(source, environment.NODE_ENV).length) return null;
      if (policy && !sourceMeetsSchedulePolicy(policy, source)) return null;
    }
    const key = `schedule:${schedule.key}:${Math.floor(now.getTime() / intervalMs)}`;
    const job = await tx.job.upsert({ where: { idempotencyKey: key }, create: { type: schedule.jobType, queueName: schedule.queueName, payload: schedule.payload as Prisma.InputJsonValue, sourceId, idempotencyKey: key, runAt: now, maxAttempts: environment.NODE_ENV === "production" ? 1 : 3 }, update: {} });
    await tx.scheduleDefinition.update({ where: { id: schedule.id }, data: { lastEnqueuedAt: now, nextRunAt: new Date(now.getTime() + intervalMs) } });
    return job;
  });
}
