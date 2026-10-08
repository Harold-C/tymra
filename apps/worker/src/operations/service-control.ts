import { createHash } from "node:crypto";
import { getEnvironment, type Environment } from "@tymra/config";
import { hashOpaqueToken, prisma, verifyOpaqueToken, type Prisma } from "@tymra/db";
import { otaServiceCommandSchema } from "@tymra/domain";
import { enableProductionOtaScheduleTransaction, enqueueProductionOtaTrialTransaction, otaSourceApproved, requireOtaSource } from "./production-ota";
import { classifySchedule, sourceMeetsSchedulePolicy } from "./schedule-policy";
import { sourceCollectionBlockers } from "./source-access";

export class ServiceControlError extends Error {
  constructor(readonly code: string, readonly statusCode = 409) { super(code); }
}
export async function runOtaServiceCommand(body: unknown, signature: string, environment: Environment = getEnvironment()) {
  const serialized = JSON.stringify(body);
  if (!verifyOpaqueToken(`tymra-service-command-v1:${serialized}`, signature, environment.SESSION_SECRET)) throw new ServiceControlError("SERVICE_SIGNATURE_REQUIRED", 403);
  const command = otaServiceCommandSchema.parse(body);
  if (Math.abs(Date.now() - command.timestamp) > 120000) throw new ServiceControlError("SERVICE_COMMAND_EXPIRED", 403);
  if (environment.NODE_ENV !== "production") throw new ServiceControlError("OTA_REQUIRES_PRODUCTION");
  if (command.action !== "ENABLE_PUBLIC_SCHEDULE") requireOtaSource(command.sourceKey);
  const requestHash = createHash("sha256").update(JSON.stringify({ ...command, timestamp: 0 })).digest("hex");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tymra:ota:service-control'))`;
    const admin = await tx.adminUser.findFirst({ where: { id: command.adminId, active: true } });
    if (!admin) throw new ServiceControlError("ADMIN_DISABLED", 403);
    const existing = await tx.serviceOperation.findUnique({ where: { id: command.commandId } });
    if (existing) {
      if (existing.requestHash !== requestHash || existing.actorAdminId !== command.adminId) throw new ServiceControlError("SERVICE_COMMAND_COLLISION");
      return existing.response;
    }
    const selectedSource = await tx.dataSource.findUniqueOrThrow({ where: { key: command.sourceKey } });
    await tx.$queryRaw`SELECT id FROM "DataSource" WHERE id = ${selectedSource.id} FOR UPDATE`;
    const source = await tx.dataSource.findUniqueOrThrow({ where: { id: selectedSource.id } });
    let response: Prisma.InputJsonObject;
    if (command.action === "ENABLE_PUBLIC_SCHEDULE") {
      if (!environment.SCHEDULER_ENABLED) throw new ServiceControlError("SCHEDULER_RUNTIME_DISABLED");
      const selected = command.scheduleKey ? await tx.scheduleDefinition.findUnique({ where: { key: command.scheduleKey } }) : null;
      if (selected) await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE id = ${selected.id} FOR UPDATE`;
      const schedule = selected ? await tx.scheduleDefinition.findUnique({ where: { id: selected.id } }) : null;
      const policy = schedule ? classifySchedule(schedule) : null;
      if (!schedule || !policy || policy.kind === "ota" || policy.sourceId !== source.key || !sourceMeetsSchedulePolicy(policy, source) || sourceCollectionBlockers(source, environment.NODE_ENV).length) throw new ServiceControlError("SCHEDULE_CONTRACT_REJECTED");
      const updated = await tx.scheduleDefinition.update({ where: { id: schedule.id }, data: { enabled: true, nextRunAt: new Date() } });
      response = { action: "set_schedule_enabled", scheduleKey: updated.key, enabled: true, nextRunAt: updated.nextRunAt!.toISOString(), policy: policy.kind };
    } else if (command.action === "TRIAL") {
      const result = await enqueueProductionOtaTrialTransaction(tx, command.sourceKey, environment.NODE_ENV);
      response = { action: "enqueue", sourceKey: command.sourceKey, jobId: result.jobId, status: "PENDING" };
    } else if (command.action === "ENABLE_SCHEDULE") {
      if (!environment.SCHEDULER_ENABLED) throw new ServiceControlError("SCHEDULER_RUNTIME_DISABLED");
      const result = await enableProductionOtaScheduleTransaction(tx, command.sourceKey, environment.NODE_ENV);
      response = { action: "set_schedule_enabled", scheduleKey: `pilot-ota-${command.sourceKey}-daily`, enabled: true, nextRunAt: result.nextRunAt.toISOString(), acceptedJobs: result.acceptedJobs };
    } else {
      if (!otaSourceApproved({ ...source, enabled: true }) || source.operationalStatus === "BLOCKED") throw new ServiceControlError("OTA_SOURCE_CONTRACT_REJECTED");
      await tx.dataSource.update({ where: { id: source.id }, data: { enabled: true } });
      response = { action: "set_source_enabled", sourceKey: source.key, enabled: true, observedHealthUnchanged: true };
    }
    await tx.serviceOperation.create({ data: { id: command.commandId, actorAdminId: admin.id, requestHash, action: command.action, sourceKey: command.sourceKey, response } });
    await tx.auditEvent.create({ data: { actorAdminId: admin.id, eventType: "ota_service_control", entityType: "DataSource", entityId: source.id, payload: { commandId: command.commandId, action: command.action, reason: command.reason, before: { enabled: source.enabled, health: source.operationalStatus }, after: response }, eventHash: hashOpaqueToken(`ota-service:${command.commandId}:${requestHash}`, environment.ACCESS_KEY_SECRET) } });
    return response;
  }, { timeout: 15000 }).catch(error => {
    if (error instanceof ServiceControlError) throw error;
    if (error instanceof Error && /requires|approved|blocked|disabled|acceptance|evidence|cooldown|already|active|schedule|trial|positive|off.hours/iu.test(error.message)) throw new ServiceControlError("SOURCE_GATE_REJECTED");
    throw error;
  });
}
