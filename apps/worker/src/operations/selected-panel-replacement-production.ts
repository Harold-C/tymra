import { createHmac } from "node:crypto";
import { prisma, Prisma } from "@tymra/db";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedHash, selectedStateSchema } from "./selected-panel-plan";
import { prepareSelectedReplacement, prepareSelectedReplacementRollback } from "./selected-panel-replacement";

function requireProduction() {
  if (process.env.NODE_ENV !== "production" || !process.env.ACCESS_KEY_SECRET
    || new URL(process.env.ARGUS_API_BASE_URL!).hostname !== "api.argus.nz") throw Error("PRODUCTION_TARGET_REQUIRED");
}

/** Explicit operator action only. New seats remain held until identity, both windows and source review pass. */
export async function applySelectedReplacement(request: unknown) {
  requireProduction();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
    if (!control.enabled) throw Error("SELECTED_PLAN_DISABLED");
    if (await tx.job.count({ where: { queueName: SELECTED_PANEL_QUEUE, status: { in: ["PENDING", "RUNNING"] } } })) throw Error("SELECTED_WORK_ACTIVE");
    const before = selectedStateSchema.parse(control.payload), prepared = prepareSelectedReplacement(before, request);
    const payload = { beforeState: before, afterStateHash: selectedHash(prepared.state),
      beforeManifestHash: before.manifestHash, manifestHash: prepared.state.manifestHash,
      changes: prepared.changes.map(c => ({ ...c, retiredMember: before.manifest.members.find(m => m.id === c.oldMemberId) })),
      unchangedMembers: prepared.unchangedMembers, effectiveAt: new Date().toISOString(),
      newSeatsHeldPendingManualAcceptance: true, historicJobsAndRunsUnchanged: true, automaticRetry: false,
      rollbackOrder: "Stop selected scheduling/worker during authorized rollback; restore reviewed prior control payload before starting old image. Keep all new Jobs/Runs/evidence and unrelated state." };
    await tx.scheduleDefinition.update({ where: { id: control.id }, data: { payload: prepared.state as unknown as Prisma.InputJsonValue } });
    const audit = await tx.auditEvent.create({ data: { eventType: "selected_members_replaced", entityType: "ScheduleDefinition", entityId: control.id,
      payload: payload as unknown as Prisma.InputJsonValue,
      eventHash: createHmac("sha256", process.env.ACCESS_KEY_SECRET!).update(selectedHash(payload)).digest("hex") } });
    return { status: "passed", auditId: audit.id, manifestHash: prepared.state.manifestHash,
      stateHash: selectedHash(prepared.state), unchangedMembers: prepared.unchangedMembers, held: prepared.state.held,
      automaticRetry: false, sourceCaptures: 0 };
  }, { timeout: 20000, isolationLevel: "RepeatableRead" });
}

export async function rollbackSelectedReplacement(auditId: string, expectedStateHash: string) {
  requireProduction();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
    if (await tx.job.count({ where: { queueName: SELECTED_PANEL_QUEUE, status: { in: ["PENDING", "RUNNING"] } } })) throw Error("SELECTED_WORK_ACTIVE");
    if (selectedHash(control.payload) !== expectedStateHash) throw Error("REPLACEMENT_STATE_CHANGED");
    const audit = await tx.auditEvent.findUniqueOrThrow({ where: { id: auditId } });
    if (audit.eventType !== "selected_members_replaced" || audit.entityId !== control.id
      || audit.eventHash !== createHmac("sha256", process.env.ACCESS_KEY_SECRET!).update(selectedHash(audit.payload)).digest("hex")) throw Error("REPLACEMENT_ROLLBACK_PROOF_INVALID");
    const proof = audit.payload as unknown as { beforeState: unknown; manifestHash: string };
    const state = prepareSelectedReplacementRollback(control.payload, proof.beforeState, proof.manifestHash);
    await tx.scheduleDefinition.update({ where: { id: control.id }, data: { payload: state as unknown as Prisma.InputJsonValue } });
    const payload = { replacementAuditId: audit.id, priorStateHash: expectedStateHash, stateHash: selectedHash(state),
      historicJobsAndRunsUnchanged: true, automaticRetry: false };
    await tx.auditEvent.create({ data: { eventType: "selected_members_replacement_rolled_back", entityType: "ScheduleDefinition", entityId: control.id,
      payload, eventHash: createHmac("sha256", process.env.ACCESS_KEY_SECRET!).update(selectedHash(payload)).digest("hex") } });
    return { status: "passed", stateHash: selectedHash(state), manifestHash: state.manifestHash, sourceCaptures: 0 };
  }, { timeout: 20000, isolationLevel: "RepeatableRead" });
}
