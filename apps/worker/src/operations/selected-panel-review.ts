import { createHmac } from "node:crypto";
import { prisma, Prisma, type Job } from "@tymra/db";
import { nzDateKey } from "@tymra/domain";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedStateSchema, selectedJobSchema, selectedTaskKey, selectedCycle, selectedHash, type SelectedTask } from "./selected-panel-plan";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const eventType = "selected_manual_acceptance_authorized";
const marker = ":manual-review:";
export function selectedManualBatch(parent: Pick<Job, "payload" | "idempotencyKey">): string | null {
  const task = selectedJobSchema.parse(parent.payload), prefix = selectedTaskKey(task) + marker;
  if (!parent.idempotencyKey.startsWith(prefix)) return null;
  const batch = parent.idempotencyKey.slice(prefix.length);
  return /^[a-z0-9-]{1,64}$/.test(batch) ? batch : null;
}

/** Operator-created, exact-task receipts; never called by the scheduler. */
export async function authorizeSelectedManualReview(input: {
  batch: string; memberId: string; phase: "identity" | "quote"; checkIn: string;
  unitExternalId: string | null; manifestHash: string; expiresAt: string;
}, now = new Date()) {
  const expiresAt = new Date(input.expiresAt);
  if (process.env.NODE_ENV !== "production" || !/^[a-z0-9-]{1,64}$/.test(input.batch)
    || !process.env.ACCESS_KEY_SECRET || !(expiresAt > now) || expiresAt.getTime() - now.getTime() > 72 * 3600_000) throw Error("MANUAL_REVIEW_AUTHORIZATION_INVALID");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
    const state = selectedStateSchema.parse(control.payload), member = state.manifest.members.find(m => m.id === input.memberId);
    const held = state.held.find(h => h.memberId === input.memberId);
    const cycle = selectedCycle(state, now);
    if (!control.enabled || state.manifestHash !== input.manifestHash || !member?.enabled || !held
      || state.stoppedSources.includes(member.source) || !cycle.anchors.includes(input.checkIn)) throw Error("MANUAL_REVIEW_SCOPE_CHANGED");
    const task = selectedJobSchema.parse({ selectedPanel: SELECTED_PANEL_KEY, manifestHash: state.manifestHash,
      memberId: member.id, sourceId: member.source, phase: input.phase, checkIn: input.checkIn,
      unitExternalId: input.unitExternalId, round: input.phase === "identity" ? nzDateKey(now) : cycle.round });
    // Keep the task/state schemas readable by the verified rollback image.
    const key = selectedTaskKey(task) + marker + input.batch, existing = await tx.job.findUnique({ where: { idempotencyKey: key } });
    if (existing) return { status: "existing" as const, jobId: existing.id, jobStatus: existing.status };
    const batchJobs = await tx.job.findMany({ where: { queueName: SELECTED_PANEL_QUEUE,
      idempotencyKey: { endsWith: marker + input.batch } } });
    const own = batchJobs.filter(j => (j.payload as { memberId: string }).memberId === member.id);
    if (own.some(j => ["FAILED", "DEAD_LETTER", "CANCELLED"].includes(j.status))) throw Error("MANUAL_REVIEW_FAILED_NO_RETRY");
    if (input.phase === "identity" && own.some(j => (j.payload as { phase: string }).phase === "identity")) throw Error("MANUAL_REVIEW_IDENTITY_ALREADY_ATTEMPTED");
    if (input.phase === "quote") {
      const identity = own.find(j => (j.payload as { phase: string }).phase === "identity" && j.status === "SUCCEEDED");
      const run = identity && await tx.collectionRun.findFirst({ where: { jobId: identity.id, status: "SUCCEEDED" } });
      if (!run || (run.scope as { evaluated?: { externalId?: string } }).evaluated?.externalId !== input.unitExternalId
        || !await tx.argusExecution.count({ where: { parentJobId: identity!.id, deliveryVerifiedAt: { not: null } } })) throw Error("MANUAL_REVIEW_IDENTITY_NOT_ACCEPTED");
    }
    // Do not steal an existing task's turn or enqueue parallel browser work.
    if (await tx.argusExecution.count({ where: { status: { in: ["SUBMITTED", "RUNNING", "WAITING_FOR_MANUAL", "CANCEL_REQUESTED"] } } })
      || await tx.job.count({ where: { type: { in: ["RATE_COLLECTION", "CATALOG_DISCOVERY"] }, OR: [{ status: "RUNNING" }, { status: "PENDING", runAt: { lte: now } }] } })) return { status: "waiting" as const };
    const job = await tx.job.create({ data: { type: "RATE_COLLECTION", queueName: SELECTED_PANEL_QUEUE, sourceId: member.source,
      maxAttempts: 1, payload: json(task), idempotencyKey: key, createdAt: now, runAt: now } });
    const payload = { controlId: control.id, batch: input.batch, memberId: member.id, manifestHash: state.manifestHash,
      taskHash: selectedHash(task), expiresAt: input.expiresAt, originalHold: held.reason, maxAttempts: 1, automaticRetry: false };
    await tx.auditEvent.create({ data: { eventType, entityType: "Job", entityId: job.id, payload: json(payload),
      eventHash: createHmac("sha256", process.env.ACCESS_KEY_SECRET!).update(selectedHash(payload)).digest("hex") } });
    return { status: "queued" as const, jobId: job.id };
  });
}

export async function assertSelectedManualReview(parent: Job, task: SelectedTask, controlId: string, now: Date) {
  const record = await prisma.auditEvent.findFirst({ where: { eventType, entityType: "Job", entityId: parent.id } });
  if (!record || !process.env.ACCESS_KEY_SECRET || record.eventHash !== createHmac("sha256", process.env.ACCESS_KEY_SECRET).update(selectedHash(record.payload)).digest("hex")) throw Error("MANUAL_REVIEW_PERMISSION_CLOSED");
  const proof = record?.payload as { controlId?: string; batch?: string; memberId?: string; manifestHash?: string; taskHash?: string; expiresAt?: string; maxAttempts?: number; automaticRetry?: boolean } | undefined;
  const batch = selectedManualBatch(parent);
  if (!batch || !proof || proof.controlId !== controlId || proof.batch !== batch || proof.memberId !== task.memberId
    || proof.manifestHash !== task.manifestHash || proof.taskHash !== selectedHash(task) || proof.maxAttempts !== 1
    || proof.automaticRetry !== false || !proof.expiresAt || !(new Date(proof.expiresAt) > now)) throw Error("MANUAL_REVIEW_PERMISSION_CLOSED");
  const siblings = await prisma.job.findMany({ where: { queueName: SELECTED_PANEL_QUEUE, idempotencyKey: { endsWith: marker + batch } } });
  if (siblings.some(j => (j.payload as { memberId?: string }).memberId === task.memberId && j.id !== parent.id
    && ["FAILED", "DEAD_LETTER", "CANCELLED"].includes(j.status))) throw Error("MANUAL_REVIEW_FAILED_NO_RETRY");
}

/** Called only after the operator reviews saved HTML, exact windows and fees/terms. */
export async function closeSelectedManualReview(batch: string, memberId: string, sourceReviewSha256: string) {
  if (process.env.NODE_ENV !== "production" || !/^[a-f0-9]{64}$/.test(sourceReviewSha256) || !process.env.ACCESS_KEY_SECRET) throw Error("MANUAL_REVIEW_RECEIPT_REQUIRED");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
    const c = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } }), state = selectedStateSchema.parse(c.payload);
    const member = state.manifest.members.find(m => m.id === memberId);
    if (!c.enabled || !member || state.stoppedSources.includes(member.source)) throw Error("MANUAL_REVIEW_SOURCE_BLOCKED");
    const jobs = (await tx.job.findMany({ where: { queueName: SELECTED_PANEL_QUEUE, idempotencyKey: { endsWith: marker + batch } } }))
      .filter(j => (j.payload as { memberId: string }).memberId === memberId);
    const tasks = jobs.map(j => selectedJobSchema.parse(j.payload));
    const anchors = selectedCycle(state, new Date()).anchors;
    if (jobs.length !== 3 || jobs.some(j => j.status !== "SUCCEEDED" || j.maxAttempts !== 1)
      || tasks.some(t => t.manifestHash !== state.manifestHash || t.memberId !== memberId)
      || jobs.some(j => selectedManualBatch(j) !== batch)
      || tasks.filter(t => t.phase === "identity").length !== 1 || anchors.some(d => !tasks.some(t => t.phase === "quote" && t.checkIn === d))) throw Error("MANUAL_REVIEW_INCOMPLETE_KEEP_HELD");
    for (const j of jobs) if (!await tx.collectionRun.count({ where: { jobId: j.id, status: "SUCCEEDED" } })
      || !await tx.argusExecution.count({ where: { parentJobId: j.id, deliveryVerifiedAt: { not: null } } })) throw Error("MANUAL_REVIEW_DELIVERY_INCOMPLETE");
    if (!state.held.some(h => h.memberId === memberId)) return { released: false, reason: "ALREADY_RELEASED" };
    state.held = state.held.filter(h => h.memberId !== memberId);
    await tx.scheduleDefinition.update({ where: { id: c.id }, data: { payload: json(state) } });
    const payload = { batch, memberId, sourceReviewSha256, jobIds: jobs.map(j => j.id), automaticRetry: false, manifestHash: state.manifestHash };
    await tx.auditEvent.create({ data: { eventType: "selected_manual_acceptance_closed", entityType: "ScheduleDefinition", entityId: c.id,
      payload: json(payload), eventHash: createHmac("sha256", process.env.ACCESS_KEY_SECRET!).update(JSON.stringify(payload)).digest("hex") } });
    return { released: true };
  });
}
