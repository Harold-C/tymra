import { prisma, Prisma, type Job } from "@tymra/db";
import { addNzCalendarDays, nzStartOfDay } from "@tymra/domain";
import type { Environment } from "@tymra/config";
import type { ArgusCaptureInput } from "../clients/argus-client";
import { OBSERVATION_PILOT_KEY, OBSERVATION_QUEUE, pilotHash, pilotJobSchema, pilotStateSchema, pilotRepairSchema, pilotTasks, taskAllowed, type PilotManifest, type PilotRepair } from "./observation-pilot";
import { resolveObservationUnit, evaluateCapturedObservation } from "./observation-evaluation";
import { DeferredJobError } from "../jobs/deferred-job";
import { isSelectedPanelJob } from "./selected-panel-plan";
import { legacyOtaDailyWhere } from "./selected-panel-budget";
import { verifiedObservationWire, type ObservationWireProof } from "./observation-wire";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function persistObservationEvidence(parentJobId: string, runId: string, sourceId: string, traceId: string, failure: boolean, evidenceOwner = OBSERVATION_PILOT_KEY) {
  const execution = await prisma.argusExecution.findFirstOrThrow({ where: { parentJobId } });
  const persisted = execution.result as unknown as import("../clients/argus-client").ArgusJobResult;
  if (!persisted?.result_sha256) throw new Error("RESULT_NOT_READY_FOR_RETENTION");
  const run = await prisma.collectionRun.findUniqueOrThrow({ where: { id: runId } });
  const proof = (run.scope as { verifiedWire?: ObservationWireProof }).verifiedWire;
  const wire = verifiedObservationWire(persisted, proof);
  if (wire.job_id !== execution.argusJobId || wire.items.length !== 1 || wire.items[0].trace_id !== traceId) throw new Error("RESULT_IDENTITY_OR_HASH_MISMATCH");
  const result = wire.items[0].result;
  if (result && (result.trace_id !== traceId || result.readonly_only !== true || result.external_side_effects_performed !== false)) throw new Error("UNSAFE_CAPTURE");
  for (const pointer of wire.items.flatMap(item => item.result?.evidence ?? [])) {
    if (pointer.containsSensitiveData !== false || pointer.traceId !== traceId) throw new Error("UNSAFE_EVIDENCE");
    const id = `observation-${pilotHash([runId, pointer.storageRef]).slice(0,32)}`;
    await prisma.rawArtifact.upsert({ where: { id }, update: {}, create: { id, dataSourceId: sourceId, collectionRunId: runId, artifactType: pointer.kind.toUpperCase(), storageRef: pointer.storageRef, contentHash: pointer.sha256,
      payload: json({ pointer, observationPilot: evidenceOwner }), parserFailure: failure, expiresAt: new Date(Date.now() + (failure ? 168 : 72) * 3600_000) } });
  }
  if (!failure && !result?.evidence.some(e => e.kind === "html")) throw new Error("REQUIRED_EVIDENCE_MISSING");
}

/** A dedicated disabled schedule is the control record; source discovery permissions are not changed. */
export async function prepareObservationPilot(manifest: PilotManifest, expiresAt: string) {
  const state = pilotStateSchema.parse({ manifest, manifestHash: pilotHash(manifest), canaryEnabled: true, canaryExpiresAt: expiresAt, heldCandidates: [], stoppedSources: [] });
  if (new Date(expiresAt).getTime() > Date.now() + 24 * 3600_000 || new Date(expiresAt).getTime() <= Date.now()) throw new Error("CANARY_PERMISSION_MUST_EXPIRE_WITHIN_24H");
  const existing = await prisma.scheduleDefinition.findUnique({ where: { key: OBSERVATION_PILOT_KEY } });
  if (existing) {
    const prior = pilotStateSchema.parse(existing.payload);
    if (prior.manifestHash !== state.manifestHash || existing.enabled) throw new Error("PILOT_ALREADY_EXISTS_WITH_DIFFERENT_INTENT");
    return existing; // Never rearm an expired or stopped canary implicitly.
  }
  return prisma.scheduleDefinition.create({ data: { key: OBSERVATION_PILOT_KEY, jobType: "RATE_COLLECTION", queueName: OBSERVATION_QUEUE, cronExpression: "daily", enabled: false, payload: json(state) } });
}

/** Budget reservation is the durable parent Job, created under the pilot row lock before any submission. */
export async function prepareObservationRepair(input: { id: string; candidateId: string; reason: string; expectedReserved: number; expectedRemaining: number }, expiresAt: string) {
  const repair = pilotRepairSchema.parse({ id: input.id, candidateId: input.candidateId, reason: input.reason,
    reservedBefore: input.expectedReserved, enabled: true, expiresAt });
  if (new Date(expiresAt).getTime() > Date.now() + 24 * 3600_000 || new Date(expiresAt).getTime() <= Date.now()) throw new Error("REPAIR_PERMISSION_MUST_EXPIRE_WITHIN_24H");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${OBSERVATION_PILOT_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: OBSERVATION_PILOT_KEY } });
    const state = pilotStateSchema.parse(control.payload);
    const existing = state.repairs?.find(r => r.id === repair.id);
    if (existing) {
      if (existing.candidateId !== repair.candidateId || existing.reason !== repair.reason || existing.reservedBefore !== repair.reservedBefore) throw new Error("REPAIR_AUTHORIZATION_CHANGED");
      return existing; // Never extend or rearm an existing authorization.
    }
    const jobs = await tx.job.findMany({ where: { queueName: OBSERVATION_QUEUE } });
    if (control.enabled || state.canaryEnabled || state.repairs?.some(r => r.enabled)
      || jobs.some(j => ["PENDING", "RUNNING"].includes(j.status))) throw new Error("REPAIR_REQUIRES_CLOSED_IDLE_PILOT");
    if (jobs.length !== input.expectedReserved || state.manifest.totalLimit - state.manifest.baselineSpent - jobs.length !== input.expectedRemaining
      || jobs.length + 3 > state.manifest.additionalLimit) throw new Error("REPAIR_BUDGET_CHANGED");
    const candidate = state.manifest.candidates.find(c => c.candidate.id === repair.candidateId);
    if (!candidate || !state.heldCandidates.includes(repair.candidateId) || state.stoppedSources.includes(candidate.candidate.source.toLowerCase())) throw new Error("REPAIR_REQUIRES_HELD_OBJECT_WITH_AVAILABLE_SOURCE");
    const tasks = pilotTasks(state.manifest, state.repairs);
    if (jobs.filter(j => tasks.find(t => t.key === pilotJobSchema.parse(j.payload).taskKey)?.bucket === "retry").length + 3 > state.manifest.remainingBuckets.retry) throw new Error("REPAIR_RESERVE_EXHAUSTED");
    state.repairs = [...(state.repairs ?? []), repair];
    await tx.scheduleDefinition.update({ where: { id: control.id }, data: { payload: json(state) } });
    return repair;
  });
}

export async function closeObservationRepair(id: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${OBSERVATION_PILOT_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: OBSERVATION_PILOT_KEY } });
    const state = pilotStateSchema.parse(control.payload);
    const repair = state.repairs?.find(r => r.id === id);
    if (!repair) throw new Error("UNKNOWN_REPAIR_AUTHORIZATION");
    repair.enabled = false;
    const keys = pilotTasks(state.manifest, [repair]).filter(t => t.repairId === id).map(t => t.key);
    const jobs = (await tx.job.findMany({ where: { queueName: OBSERVATION_QUEUE } })).filter(j => keys.includes(pilotJobSchema.parse(j.payload).taskKey));
    const verified = await tx.argusExecution.count({ where: { parentJobId: { in: jobs.map(j => j.id) }, deliveryVerifiedAt: { not: null } } });
    const passed = jobs.length === 3 && jobs.every(j => j.status === "SUCCEEDED") && verified === 3;
    if (passed) state.heldCandidates = state.heldCandidates.filter(c => c !== repair.candidateId);
    await tx.scheduleDefinition.update({ where: { id: control.id }, data: { enabled: false, nextRunAt: null, payload: json(state) } });
    return { passed, held: state.heldCandidates.includes(repair.candidateId), repairEnabled: false, automaticEnabled: false };
  });
}

export async function enqueueObservationTask(mode: "canary" | "scheduled" | "repair", now = new Date()) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${OBSERVATION_PILOT_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUnique({ where: { key: OBSERVATION_PILOT_KEY } });
    if (!control) return null;
    const state = pilotStateSchema.parse(control.payload);
    if (mode === "scheduled" && now > new Date(`${state.manifest.end}T23:59:59+13:00`)) {
      if (control.enabled) await tx.scheduleDefinition.update({ where: { id: control.id }, data: { enabled: false, nextRunAt: null } });
      return null;
    }
    const jobs = await tx.job.findMany({ where: { queueName: OBSERVATION_QUEUE } });
    if (jobs.length >= state.manifest.additionalLimit || jobs.some(j => ["PENDING", "RUNNING"].includes(j.status))) return null;
    const tasks = pilotTasks(state.manifest, state.repairs);
    const used = new Set(jobs.map(j => pilotJobSchema.parse(j.payload).taskKey));
    const candidates = tasks.filter(t => t.mode === mode && !used.has(t.key) && taskAllowed(state, control.enabled, t, now));
    if (mode === "canary" && jobs.filter(j => pilotJobSchema.parse(j.payload).taskKey.startsWith("canary:")).length >= state.manifest.canaryLimit) return null;
    for (const task of candidates) {
      const c = state.manifest.candidates.find(c => c.candidate.id === task.candidateId)!;
      const sourceId = c.candidate.source.toLowerCase();
      const source = await tx.dataSource.findUniqueOrThrow({ where: { key: sourceId } });
      if (!["HEALTHY", "DEGRADED"].includes(source.operationalStatus) || source.lifecycle === "BLOCKED" || source.isDemo || !source.environments.includes("PRODUCTION") || source.concurrencyLimit !== 1) continue;
      // Include reserved Jobs without an ArgusExecution as spent; never reclaim uncertain submissions.
      const executions = await tx.argusExecution.findMany({ where: await legacyOtaDailyWhere(source.id, sourceId, now, tx), select: { parentJobId: true } });
      const reserved = jobs.filter(j => j.sourceId === sourceId && j.createdAt >= nzStartOfDay(now));
      const daily = executions.length + reserved.filter(j => !executions.some(e => e.parentJobId === j.id)).length;
      if (daily >= Math.min(6, source.dailyBudget)) continue;
      if (jobs.filter(j => tasks.find(t => t.key === pilotJobSchema.parse(j.payload).taskKey)?.bucket === task.bucket).length >= state.manifest.remainingBuckets[task.bucket]) continue;
      // Canary exact identity is a prerequisite for each rate; scheduled rates reuse that reviewed identity.
      const identityKeys = task.mode === "repair" ? [`repair:${task.repairId}:${task.candidateId}:identity`]
        : tasks.filter(t => t.candidateId === task.candidateId && t.workflow === "resolve_listing" && t.mode !== "scheduled").map(t => t.key);
      if (task.workflow === "collect_rates" && !jobs.some(j => identityKeys.includes(pilotJobSchema.parse(j.payload).taskKey) && j.status === "SUCCEEDED")) continue;
      return tx.job.create({ data: { type: "RATE_COLLECTION", queueName: OBSERVATION_QUEUE, sourceId, maxAttempts: 1,
        idempotencyKey: `${OBSERVATION_PILOT_KEY}:${state.manifestHash}:${task.key}`,
        payload: json({ observationPilot: OBSERVATION_PILOT_KEY, manifestHash: state.manifestHash, taskKey: task.key, sourceId }), runAt: now, createdAt: now } });
    }
    return null;
  });
}

export async function observationCapturePermission(parent: Job, input: ArgusCaptureInput, dataSourceId: string, now = new Date()) {
  if (isSelectedPanelJob(parent.payload)) return (await import("./selected-panel-production")).selectedCapturePermission(parent, input, dataSourceId, now);
  const payload = pilotJobSchema.parse(parent.payload);
  const control = await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: OBSERVATION_PILOT_KEY } });
  const state = pilotStateSchema.parse(control.payload);
  const task = pilotTasks(state.manifest, state.repairs).find(t => t.key === payload.taskKey);
  if (!task || payload.manifestHash !== state.manifestHash || parent.type !== "RATE_COLLECTION" || parent.queueName !== OBSERVATION_QUEUE || parent.maxAttempts !== 1
    || parent.idempotencyKey !== `${OBSERVATION_PILOT_KEY}:${state.manifestHash}:${task.key}` || !taskAllowed(state, control.enabled, task, now)) throw new Error("OBSERVATION_PERMISSION_CLOSED");
  const c = state.manifest.candidates.find(c => c.candidate.id === task.candidateId)!;
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { id: dataSourceId } });
  if (source.key !== payload.sourceId || parent.sourceId !== source.key || source.key !== c.candidate.source.toLowerCase()
    || source.isDemo || !source.environments.includes("PRODUCTION") || source.lifecycle === "BLOCKED" || !["HEALTHY", "DEGRADED"].includes(source.operationalStatus) || source.concurrencyLimit !== 1) throw new Error("OBSERVATION_SOURCE_BLOCKED");
  const expected = observationInput(state.manifest, task.key, parent.id, state.repairs);
  if (JSON.stringify(input) !== JSON.stringify(expected)) throw new Error("OBSERVATION_INPUT_CHANGED");
  const jobs = await prisma.job.count({ where: { queueName: OBSERVATION_QUEUE } });
  if (jobs > state.manifest.additionalLimit || jobs + state.manifest.baselineSpent > state.manifest.totalLimit) throw new Error("OBSERVATION_BUDGET_EXHAUSTED");
  const daily = await prisma.argusExecution.count({ where: await legacyOtaDailyWhere(dataSourceId, source.key, now) });
  if (daily >= Math.min(6, source.dailyBudget)) throw new Error("OBSERVATION_SOURCE_DAILY_LIMIT");
}

export function observationInput(manifest: PilotManifest, taskKey: string, parentId: string, repairs?: PilotRepair[]): ArgusCaptureInput {
  const task = pilotTasks(manifest, repairs).find(t => t.key === taskKey);
  if (!task) throw new Error("UNKNOWN_OBSERVATION_TASK");
  const { candidate: c, unitExternalId } = manifest.candidates.find(c => c.candidate.id === task.candidateId)!;
  const stay = { checkIn: task.checkIn, checkOut: addNzCalendarDays(task.checkIn, c.nights), adults: 2, children: 0 as const, units: 1, currency: "NZD" as const };
  return { traceId: `chch-${pilotHash([parentId, task.key]).slice(0,32)}`, connectorId: `${c.source.toLowerCase()}-public` as ArgusCaptureInput["connectorId"], workflowId: task.workflow,
    url: c.sourceUrl, maxRecords: 20, maxAttempts: 1, timeoutMs: 60000,
    ...(task.workflow === "collect_rates" ? { ...stay, unitExternalId } : c.source === "EXPEDIA" ? { identityStay: stay } : {}) };
}

export async function stopObservationObject(candidateId: string, sourceId?: string) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${OBSERVATION_PILOT_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: OBSERVATION_PILOT_KEY } });
    const state = pilotStateSchema.parse(control.payload);
    state.heldCandidates = [...new Set([...state.heldCandidates, candidateId])];
    for (const repair of state.repairs ?? []) if (repair.candidateId === candidateId) repair.enabled = false;
    if (sourceId) state.stoppedSources = [...new Set([...state.stoppedSources, sourceId])];
    await tx.scheduleDefinition.update({ where: { id: control.id }, data: { payload: json(state) } });
  });
}

export async function handleObservationJob(job: Job, environment: Environment) {
  if (isSelectedPanelJob(job.payload)) return (await import("./selected-panel-production")).handleSelectedPanelJob(job, environment);
  if (environment.NODE_ENV !== "production" || new URL(environment.ARGUS_API_BASE_URL).hostname !== "api.argus.nz") throw new Error("PRODUCTION_OBSERVATION_TARGET_REQUIRED");
  const payload = pilotJobSchema.parse(job.payload);
  const control = await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: OBSERVATION_PILOT_KEY } });
  const state = pilotStateSchema.parse(control.payload);
  if (payload.manifestHash !== state.manifestHash) throw new Error("MANIFEST_CHANGED");
  const task = pilotTasks(state.manifest, state.repairs).find(t => t.key === payload.taskKey)!;
  const selected = state.manifest.candidates.find(c => c.candidate.id === task?.candidateId);
  if (!selected) throw new Error("UNKNOWN_OBSERVATION_OBJECT");
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: payload.sourceId } });
  let run = await prisma.collectionRun.findFirst({ where: { jobId: job.id } });
  if (!run) run = await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "RUNNING", startedAt: new Date(), scope: json({ observationPilot: OBSERVATION_PILOT_KEY, manifestHash: state.manifestHash, task, comparison: "RAW_ONLY", captureReserved: false }) } });
  const { captureBrowserTaskWithDurableArgus, acknowledgePersistedArgusResults } = await import("../services/argus-orchestrator");
  try {
    const input = observationInput(state.manifest, task.key, job.id, state.repairs);
    const response = await captureBrowserTaskWithDurableArgus(environment, input, { parentJobId: job.id, collectionRunId: run.id, dataSourceId: source.id });
    if (!response.ok || !response.payload.ok) throw new Error("OBSERVATION_CAPTURE_FAILED");
    const extracted = response.payload.extracted;
    const evaluated = task.workflow === "resolve_listing" ? resolveObservationUnit(selected.candidate, extracted)
      : evaluateCapturedObservation(selected.candidate, selected.unitExternalId, task.checkIn, extracted, run.id);
    if (task.workflow === "resolve_listing" && (evaluated as { externalId: string }).externalId !== selected.unitExternalId) throw new Error("REVIEWED_UNIT_CHANGED");
    await persistObservationEvidence(job.id, run.id, source.id, input.traceId, false);
    const retainedRun = await prisma.collectionRun.findUniqueOrThrow({ where: { id: run.id } });
    await prisma.collectionRun.update({ where: { id: run.id }, data: { scope: json({ ...(retainedRun.scope as object), evaluated, captureReserved: true }) } });
    await acknowledgePersistedArgusResults(environment, job.id);
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: 1, finishedAt: new Date() } });
  } catch (error) {
    if (error instanceof DeferredJobError) throw error;
    const execution = await prisma.argusExecution.findFirst({ where: { parentJobId: job.id } });
    const code = execution?.errorCategory ?? (error instanceof Error ? error.message : "OBSERVATION_FAILED");
    await stopObservationObject(task.candidateId, /CHALLENGE|CAPTCHA|LOGIN|RATE_LIMIT|BLOCKED|ACCESS_DENIED/.test(code) ? payload.sourceId : undefined);
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: code.slice(0,200), finishedAt: new Date() } });
    if (execution?.result && ["FAILED", "CANCELLED"].includes(execution.status)) {
      try {
        await persistObservationEvidence(job.id, run.id, source.id, execution.traceId, true);
        await acknowledgePersistedArgusResults(environment, job.id);
      } catch { /* Unverified evidence remains unacknowledged for explicit reconciliation. */ }
    }
    throw error;
  }
}
