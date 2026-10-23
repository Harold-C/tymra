import { createHmac } from "node:crypto";
import { prisma, Prisma } from "@tymra/db";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedHash, selectedStateSchema } from "./selected-panel-plan";
import { prepareSelectedWindowUpgrade } from "./selected-panel-window-upgrade";
import { prepareSelectedReplacementRollback } from "./selected-panel-replacement";

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
function requireProduction() {
  if (process.env.NODE_ENV !== "production" || !process.env.ACCESS_KEY_SECRET || new URL(process.env.ARGUS_API_BASE_URL!).hostname !== "api.argus.nz") throw Error("PRODUCTION_TARGET_REQUIRED");
}
function seal(value: unknown) { return createHmac("sha256", process.env.ACCESS_KEY_SECRET!).update(selectedHash(value)).digest("hex"); }
/** Apply once at idle. Each changed member remains isolated until its exact new windows are reviewed. */
export async function applySelectedWindowUpgrade(request: unknown) {
  requireProduction();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
    if (!control.enabled || await tx.job.count({ where: { queueName: SELECTED_PANEL_QUEUE, status: { in: ["PENDING", "RUNNING"] } } })) throw Error("SELECTED_WORK_ACTIVE");
    const before = selectedStateSchema.parse(control.payload), prepared = prepareSelectedWindowUpgrade(before, request);
    const payload = { beforeState: before, manifestHash: prepared.state.manifestHash, afterStateHash: selectedHash(prepared.state),
      changes: prepared.changes, unchangedMembers: prepared.unchangedMembers, effectiveAt: new Date().toISOString(),
      historicJobsAndRunsUnchanged: true, automaticRetry: false, sourceCaptures: 0 };
    await tx.scheduleDefinition.update({ where: { id: control.id }, data: { payload: json(prepared.state) } });
    const audit = await tx.auditEvent.create({ data: { eventType: "selected_windows_upgraded", entityType: "ScheduleDefinition", entityId: control.id, payload: json(payload), eventHash: seal(payload) } });
    return { auditId: audit.id, manifestHash: prepared.state.manifestHash, held: prepared.state.held, unchangedMembers: prepared.unchangedMembers, sourceCaptures: 0 };
  }, { timeout: 20000, isolationLevel: "RepeatableRead" });
}
/** Restore compatible controls before an image rollback; preserve later unrelated holds and all history. */
export async function rollbackSelectedWindowUpgrade(auditId: string, expectedStateHash: string) {
  requireProduction();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
    if (selectedHash(control.payload) !== expectedStateHash || await tx.job.count({ where: { queueName: SELECTED_PANEL_QUEUE, status: { in: ["PENDING", "RUNNING"] } } })) throw Error("WINDOW_ROLLBACK_STATE_CHANGED");
    const audit = await tx.auditEvent.findUniqueOrThrow({ where: { id: auditId } });
    if (audit.eventType !== "selected_windows_upgraded" || audit.entityId !== control.id || audit.eventHash !== seal(audit.payload)) throw Error("WINDOW_ROLLBACK_PROOF_INVALID");
    const proof = audit.payload as unknown as { beforeState: unknown; manifestHash: string };
    const state = prepareSelectedReplacementRollback(control.payload, proof.beforeState, proof.manifestHash);
    await tx.scheduleDefinition.update({ where: { id: control.id }, data: { payload: json(state) } });
    const payload = { upgradeAuditId: audit.id, stateHash: selectedHash(state), historicJobsAndRunsUnchanged: true, automaticRetry: false };
    await tx.auditEvent.create({ data: { eventType: "selected_windows_rolled_back", entityType: "ScheduleDefinition", entityId: control.id, payload, eventHash: seal(payload) } });
    return { stateHash: selectedHash(state), manifestHash: state.manifestHash, sourceCaptures: 0 };
  });
}
