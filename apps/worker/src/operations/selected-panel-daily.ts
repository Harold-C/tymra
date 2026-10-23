import { createHmac } from "node:crypto";
import { z } from "zod";
import { nzDateKey } from "@tymra/domain";
import { prisma, Prisma } from "@tymra/db";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedHash, selectedStateSchema } from "./selected-panel-plan";

const requestSchema = z.object({ expectedStateHash: z.string().regex(/^[a-f0-9]{64}$/), effectiveOn: z.string().date() }).strict();
export function prepareSelectedDaily(state: unknown, request: unknown, now = new Date()) {
  const before = selectedStateSchema.parse(state), r = requestSchema.parse(request);
  if (selectedHash(before) !== r.expectedStateHash || before.cadence?.version !== "dual-window-weekly-v2"
    || r.effectiveOn < nzDateKey(now)) throw Error("DAILY_ACTIVATION_SCOPE_CHANGED");
  return selectedStateSchema.parse({ ...before, cadence: { ...before.cadence, version: "dual-window-daily-v1", dailyStartsOn: r.effectiveOn } });
}
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
function requireProduction() {
  if (process.env.NODE_ENV !== "production" || !process.env.ACCESS_KEY_SECRET || new URL(process.env.ARGUS_API_BASE_URL!).hostname !== "api.argus.nz") throw Error("PRODUCTION_TARGET_REQUIRED");
}
const seal = (v: unknown) => createHmac("sha256", process.env.ACCESS_KEY_SECRET!).update(selectedHash(v)).digest("hex");
export async function applySelectedDaily(request: unknown, now = new Date()) {
  requireProduction();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
    if (!control.enabled || await tx.job.count({ where: { queueName: SELECTED_PANEL_QUEUE, status: { in: ["PENDING", "RUNNING"] } } })) throw Error("SELECTED_WORK_ACTIVE");
    const before = selectedStateSchema.parse(control.payload), after = prepareSelectedDaily(before, request, now);
    const payload = { beforeCadence: before.cadence!, afterCadence: after.cadence!, beforeStateHash: selectedHash(before), afterStateHash: selectedHash(after),
      manifestHash: before.manifestHash, effectiveAt: now.toISOString(), members: before.manifest.members.length, automaticRetry: false, sourceCaptures: 0 };
    await tx.scheduleDefinition.update({ where: { id: control.id }, data: { payload: json(after) } });
    const audit = await tx.auditEvent.create({ data: { eventType: "selected_daily_activated", entityType: "ScheduleDefinition", entityId: control.id, payload: json(payload), eventHash: seal(payload) } });
    return { auditId: audit.id, stateHash: selectedHash(after), cadence: after.cadence, members: after.manifest.members.length, sourceCaptures: 0 };
  }, { timeout: 20000, isolationLevel: "RepeatableRead" });
}
/** Restore only cadence before rolling back the image; preserve later holds and every run. */
export async function rollbackSelectedDaily(auditId: string, expectedStateHash: string) {
  requireProduction();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
    if (selectedHash(control.payload) !== expectedStateHash || await tx.job.count({ where: { queueName: SELECTED_PANEL_QUEUE, status: { in: ["PENDING", "RUNNING"] } } })) throw Error("DAILY_ROLLBACK_STATE_CHANGED");
    const audit = await tx.auditEvent.findUniqueOrThrow({ where: { id: auditId } });
    if (audit.eventType !== "selected_daily_activated" || audit.entityId !== control.id || audit.eventHash !== seal(audit.payload)) throw Error("DAILY_ROLLBACK_PROOF_INVALID");
    const proof = audit.payload as unknown as { beforeCadence: unknown; afterCadence: unknown; manifestHash: string };
    const state = selectedStateSchema.parse(control.payload);
    if (state.manifestHash !== proof.manifestHash || selectedHash(state.cadence) !== selectedHash(proof.afterCadence)) throw Error("DAILY_ROLLBACK_SCOPE_CHANGED");
    const after = selectedStateSchema.parse({ ...state, cadence: proof.beforeCadence });
    await tx.scheduleDefinition.update({ where: { id: control.id }, data: { payload: json(after) } });
    const payload = { activationAuditId: audit.id, stateHash: selectedHash(after), automaticRetry: false, historicJobsAndRunsUnchanged: true };
    await tx.auditEvent.create({ data: { eventType: "selected_daily_rolled_back", entityType: "ScheduleDefinition", entityId: control.id, payload, eventHash: seal(payload) } });
    return payload;
  });
}
