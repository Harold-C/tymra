import { prisma } from "@tymra/db";
import { serviceCollectionJobTypes } from "@tymra/domain";
import { ServiceRecoveryError, writeServiceAudit } from "./service-recovery";

export function scheduleAfterWaiver(nextRun: Date | null, expression: string, expiry: Date, now = new Date()) {
  const match = expression.match(/^every-(\d+)-(minutes|hours)$/);
  const interval = expression === "daily" ? 86400000 : expression === "weekly" ? 7 * 86400000 : match ? Number(match[1]) * (match[2] === "hours" ? 3600000 : 60000) : 0;
  if (!interval) throw new ServiceRecoveryError("UNSUPPORTED_SCHEDULE");
  const base = nextRun ?? now;
  return new Date(base.getTime() + Math.max(0, Math.ceil((expiry.getTime() - base.getTime()) / interval)) * interval);
}
export async function waiveSchedule(scheduleKey: string, adminId: string, reason: string, expiresAt: Date) {
  const now = new Date();
  if (expiresAt <= now || expiresAt.getTime() > now.getTime() + 86400000) throw new ServiceRecoveryError("WAIVER_MAX_24_HOURS", 422);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${scheduleKey} FOR UPDATE`;
    const schedule = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: scheduleKey } });
    if (!schedule.enabled || !serviceCollectionJobTypes.includes(schedule.jobType as typeof serviceCollectionJobTypes[number])) throw new ServiceRecoveryError("WAIVER_REQUIRES_ENABLED_COLLECTION");
    const active = await tx.serviceWaiver.findFirst({ where: { scheduleId: schedule.id, revokedAt: null, expiresAt: { gt: now } } });
    if (active) return { id: active.id, expiresAt: active.expiresAt };
    const waiver = await tx.serviceWaiver.create({ data: { scheduleId: schedule.id, actorAdminId: adminId, reason, expiresAt, originalNextRunAt: schedule.nextRunAt } });
    const nextRunAt = scheduleAfterWaiver(schedule.nextRunAt, schedule.cronExpression, expiresAt, now);
    await tx.scheduleDefinition.update({ where: { id: schedule.id }, data: { nextRunAt } });
    await writeServiceAudit(tx, adminId, "schedule_temporarily_waived", "ServiceWaiver", waiver.id, { reason, scheduleKey, scope: "SINGLE_SCHEDULE_TIME_WINDOW", expiresAt: expiresAt.toISOString(), nextRunAt: nextRunAt.toISOString(), originalNextRunAt: schedule.nextRunAt?.toISOString() ?? null, healthUnchanged: true, budgetUnchanged: true, catchupSkipped: true });
    return { id: waiver.id, expiresAt, nextRunAt };
  });
}
export async function revokeScheduleWaiver(waiverId: string, adminId: string, reason: string) {
  return prisma.$transaction(async tx => {
    const waiver = await tx.serviceWaiver.findUniqueOrThrow({ where: { id: waiverId }, include: { schedule: true } });
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE id = ${waiver.scheduleId} FOR UPDATE`;
    const current = await tx.serviceWaiver.findUniqueOrThrow({ where: { id: waiver.id } });
    if (current.revokedAt || current.expiresAt <= new Date()) return { revoked: false };
    await tx.serviceWaiver.update({ where: { id: waiver.id }, data: { revokedAt: new Date() } });
    const schedule = await tx.scheduleDefinition.findUniqueOrThrow({ where: { id: waiver.scheduleId } });
    if (schedule.enabled) await tx.scheduleDefinition.update({ where: { id: waiver.scheduleId }, data: { nextRunAt: waiver.originalNextRunAt ?? new Date() } });
    await writeServiceAudit(tx, adminId, "schedule_waiver_revoked", "ServiceWaiver", waiver.id, { reason, scheduleKey: waiver.schedule.key, healthUnchanged: true });
    return { revoked: true };
  });
}
