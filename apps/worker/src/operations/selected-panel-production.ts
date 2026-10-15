import { prisma, Prisma, type Job } from "@tymra/db";
import type { Environment } from "@tymra/config";
import { addNzCalendarDays, nzStartOfDay, nzDateKey, observationCandidateSchema } from "@tymra/domain";
import { otaResolveListingExtractionSchema, otaCollectRatesExtractionSchema } from "@tymra/providers/ota-argus-contracts";
import type { ArgusCaptureInput } from "../clients/argus-client";
import { DeferredJobError } from "../jobs/deferred-job";
import { persistObservationEvidence } from "./observation-production";
import { evaluateCapturedObservation } from "./observation-evaluation";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedStateSchema, selectedJobSchema, selectedTaskKey, selectedHash, selectedListingId, selectedAnchors, selectedWeek, nextSelectedTasks, type SelectedMember, type SelectedTask, type MemberProgress } from "./selected-panel-plan";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const activeStatuses = ["SUBMITTED", "RUNNING", "WAITING_FOR_MANUAL", "CANCEL_REQUESTED"] as const;
export function selectedInput(member: SelectedMember, task: SelectedTask, parentId: string): ArgusCaptureInput {
  const stay = { checkIn: task.checkIn, checkOut: addNzCalendarDays(task.checkIn, member.nights), adults: 2, children: 0 as const, units: 1, currency: "NZD" as const };
  return { traceId: `selected-${selectedHash([parentId, task]).slice(0, 30)}`, connectorId: `${member.source}-public` as ArgusCaptureInput["connectorId"],
    workflowId: task.phase === "identity" ? "resolve_listing" : "collect_rates", url: member.sourceUrl,
    maxRecords: 20, maxAttempts: 1, timeoutMs: 60000,
    ...(task.phase === "quote" ? { ...stay, unitExternalId: task.unitExternalId! } : member.source === "expedia" ? { identityStay: stay } : {}) };
}
export function resolveSelectedUnit(member: SelectedMember, extracted: unknown) {
  const data = otaResolveListingExtractionSchema.parse(extracted);
  if (data.provider !== member.source || data.sourceListingId !== selectedListingId(member)) throw Error("LISTING_IDENTITY_MISMATCH");
  if (member.source === "booking" && !data.warnings.includes(`BOOKING_INTERNAL_PROPERTY_ID=${member.sourceListingId}`)) throw Error("BOOKING_PROPERTY_ID_UNVERIFIED");
  const name = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const matches = data.units.filter(unit => {
    if (unit.capacity !== null && unit.capacity < 2) return false;
    if (/dorm|bed in |powered site|camp ?site/i.test(unit.officialName)) return false;
    if (member.entireBedrooms !== null && (unit.entireOrShared !== "ENTIRE" || unit.bedrooms !== member.entireBedrooms)) return false;
    if (member.signature && (unit.areaSquareMetres !== member.signature.areaSquareMetres || unit.capacity !== member.signature.capacity || !unit.bedTypes.includes(member.signature.bedType))) return false;
    if (member.expectedUnitId) return unit.externalId === member.expectedUnitId && (!member.expectedUnitName || name(unit.officialName) === name(member.expectedUnitName));
    if (member.entireBedrooms !== null) return unit.entireOrShared === "ENTIRE" && unit.bedrooms === member.entireBedrooms;
    return member.expectedUnitName !== null && name(unit.officialName) === name(member.expectedUnitName);
  });
  if (matches.length !== 1) throw Error(matches.length ? "UNIT_IDENTITY_AMBIGUOUS" : "SELECTED_ROOM_NOT_RETURNED");
  return { externalId: matches[0].externalId, unit: matches[0], observedAt: data.observedAt };
}

export async function enqueueSelectedPanel(now = new Date()) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUnique({ where: { key: SELECTED_PANEL_KEY } });
    if (!control?.enabled) return null;
    const state = selectedStateSchema.parse(control.payload);
    // Yield to existing work. No cancellation, quota waiver or shared runtime change.
    if (await tx.job.count({ where: { type: { in: ["RATE_COLLECTION", "CATALOG_DISCOVERY"] }, OR: [
      { status: "RUNNING" }, { status: "PENDING", OR: [{ queueName: SELECTED_PANEL_QUEUE }, { runAt: { lte: now } }] },
    ] } })) return null;
    if (await tx.argusExecution.count({ where: { status: { in: [...activeStatuses] } } })) return null;
    const jobs = await tx.job.findMany({ where: { queueName: SELECTED_PANEL_QUEUE }, orderBy: { createdAt: "desc" } });
    const matching = jobs.filter(j => selectedJobSchema.parse(j.payload).manifestHash === state.manifestHash);
    const runs = await tx.collectionRun.findMany({ where: { jobId: { in: matching.map(j => j.id) }, status: "SUCCEEDED" }, orderBy: { finishedAt: "desc" } });
    const progress: MemberProgress[] = state.manifest.members.map(member => {
      const own = runs.filter(r => (r.scope as { memberId?: string }).memberId === member.id);
      const identity = own.find(r => (r.scope as { phase?: string }).phase === "identity");
      const quote = own.find(r => (r.scope as { phase?: string }).phase === "quote");
      const prior = state.bindings.find(b => b.memberId === member.id);
      return { memberId: member.id, lastQuoteAt: quote?.finishedAt ?? null, identityAt: identity?.finishedAt ?? (prior ? new Date(prior.verifiedAt) : null),
        unitExternalId: (identity?.scope as { evaluated?: { externalId?: string } } | undefined)?.evaluated?.externalId ?? prior?.unitExternalId ?? null };
    });
    const tasks = nextSelectedTasks(state, progress, new Set(matching.map(j => j.idempotencyKey!)), now);
    for (const task of tasks) {
      const source = await tx.dataSource.findUnique({ where: { key: task.sourceId } });
      if (!source || source.isDemo || !source.environments.includes("PRODUCTION") || source.concurrencyLimit !== 1
        || source.lifecycle === "BLOCKED" || !["HEALTHY", "DEGRADED"].includes(source.operationalStatus)) continue;
      const executions = await tx.argusExecution.findMany({ where: { dataSourceId: source.id, submittedAt: { gte: nzStartOfDay(now) } }, select: { parentJobId: true } });
      const reserved = jobs.filter(j => j.sourceId === task.sourceId && j.createdAt >= nzStartOfDay(now) && !executions.some(e => e.parentJobId === j.id));
      if (executions.length + reserved.length >= Math.min(6, source.dailyBudget)) continue;
      return tx.job.create({ data: { type: "RATE_COLLECTION", queueName: SELECTED_PANEL_QUEUE, sourceId: task.sourceId, maxAttempts: 1,
        payload: json(task), idempotencyKey: selectedTaskKey(task), runAt: now, createdAt: now } });
    }
    return null;
  });
}

export async function selectedCapturePermission(parent: Job, input: ArgusCaptureInput, dataSourceId: string, now = new Date()) {
  const task = selectedJobSchema.parse(parent.payload);
  const control = await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
  const state = selectedStateSchema.parse(control.payload), member = state.manifest.members.find(c => c.id === task.memberId);
  if (!control.enabled || task.manifestHash !== state.manifestHash || !member?.enabled || state.held.some(h => h.memberId === member.id)
    || state.stoppedSources.includes(member.source) || parent.queueName !== SELECTED_PANEL_QUEUE || parent.type !== "RATE_COLLECTION"
    || parent.maxAttempts !== 1 || parent.idempotencyKey !== selectedTaskKey(task) || task.sourceId !== member.source || parent.sourceId !== member.source
    || nzDateKey(now) < state.manifest.start || task.checkIn <= nzDateKey(now)
    || !selectedAnchors(parent.createdAt).includes(task.checkIn)
    || task.round !== (task.phase === "quote" ? selectedWeek(parent.createdAt) : nzDateKey(parent.createdAt))) throw Error("SELECTED_PANEL_PERMISSION_CLOSED");
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { id: dataSourceId } });
  if (source.key !== member.source || source.isDemo || !source.environments.includes("PRODUCTION") || source.concurrencyLimit !== 1
    || source.lifecycle === "BLOCKED" || !["HEALTHY", "DEGRADED"].includes(source.operationalStatus)) throw Error("SELECTED_SOURCE_BLOCKED");
  if (JSON.stringify(input) !== JSON.stringify(selectedInput(member, task, parent.id))) throw Error("SELECTED_INPUT_CHANGED");
  if (task.phase === "quote") {
    const runs = await prisma.collectionRun.findMany({ where: { status: "SUCCEEDED", scope: { path: ["selectedPanel"], equals: SELECTED_PANEL_KEY } }, orderBy: { finishedAt: "desc" } });
    let identity = runs.find(r => { const s = r.scope as { memberId?: string; manifestHash?: string; phase?: string }; return s.memberId === member.id && s.manifestHash === state.manifestHash && s.phase === "identity"; });
    if (!identity) {
      const seed = state.bindings.find(b => b.memberId === member.id);
      if (seed) {
        const prior = await prisma.collectionRun.findUnique({ where: { id: seed.sourceRunId } });
        const delivered = prior ? await prisma.argusExecution.count({ where: { collectionRunId: prior.id, deliveryVerifiedAt: { not: null } } }) : 0;
        if (prior?.status === "SUCCEEDED" && delivered && prior.dataSourceId === source.id
          && (prior.scope as { evaluated?: { externalId?: string } }).evaluated?.externalId === seed.unitExternalId) identity = prior;
      }
    }
    if (!identity?.finishedAt || now.getTime() - identity.finishedAt.getTime() >= 28 * 86_400_000
      || (identity.scope as { evaluated?: { externalId?: string } }).evaluated?.externalId !== task.unitExternalId) throw Error("SELECTED_IDENTITY_NOT_VERIFIED");
  } else if (task.unitExternalId !== null) throw Error("INVALID_IDENTITY_TASK");
  const daily = await prisma.argusExecution.count({ where: { dataSourceId, submittedAt: { gte: nzStartOfDay(now) } } });
  if (daily >= Math.min(6, source.dailyBudget)) throw new DeferredJobError("Waiting for the normal source daily allowance", nzStartOfDay(new Date(now.getTime() + 86_400_000)));
}

function evaluationCandidate(member: SelectedMember, unitExternalId: string, twoAdultEvidence: string) {
  return observationCandidateSchema.parse({ id: member.id, name: member.name, source: member.source.toUpperCase(), sourceListingId: member.sourceListingId,
    sourceUrl: member.sourceUrl, market: "Christchurch City", nights: member.nights, cadence: "ONCE_PER_WEEK", accommodationType: member.accommodationType,
    capacityGuests: null, twoAdultStayEvidenceRef: twoAdultEvidence, unit: { kind: "SOURCE_ROOM_ID", key: unitExternalId, description: member.name, reviewed: true },
    evidenceRefs: member.evidenceRefs, evidenceObservedOn: "2026-10-14", identityConflicts: [], geography: { locality: member.locality, physicalUnitKey: null, precision: "SOURCE_SCOPED" },
    possibleDuplicateGroup: null, concentrationGroup: member.physicalGroup, quoteGaps: [], executionGaps: [], followUpGaps: [], reserve: { status: "GAP", candidateIds: [], reason: "No automatic substitution" } });
}
export async function handleSelectedPanelJob(job: Job, environment: Environment) {
  if (environment.NODE_ENV !== "production" || new URL(environment.ARGUS_API_BASE_URL).hostname !== "api.argus.nz") throw Error("PRODUCTION_TARGET_REQUIRED");
  const task = selectedJobSchema.parse(job.payload);
  const control = await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
  const state = selectedStateSchema.parse(control.payload), member = state.manifest.members.find(c => c.id === task.memberId);
  if (!member || task.manifestHash !== state.manifestHash) throw Error("MANIFEST_CHANGED");
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: member.source } });
  let run = await prisma.collectionRun.findFirst({ where: { jobId: job.id } });
  if (!run) run = await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "RUNNING", startedAt: new Date(),
    scope: json({ selectedPanel: SELECTED_PANEL_KEY, manifestHash: state.manifestHash, memberId: member.id, phase: task.phase, task, comparison: "RAW_ONLY", captureReserved: false }) } });
  const { captureBrowserTaskWithDurableArgus, acknowledgePersistedArgusResults } = await import("../services/argus-orchestrator");
  try {
    const input = selectedInput(member, task, job.id);
    const response = await captureBrowserTaskWithDurableArgus(environment, input, { parentJobId: job.id, collectionRunId: run.id, dataSourceId: source.id });
    if (!response.ok) {
      if (response.httpStatus === 429 && !await prisma.argusExecution.count({ where: { parentJobId: job.id } })) {
        const current = await prisma.collectionRun.findUniqueOrThrow({ where: { id: run.id } });
        if (!(current.scope as { captureReserved?: boolean }).captureReserved) throw new DeferredJobError("Waiting for shared execution capacity", new Date(Date.now() + 60_000));
        throw Error("SOURCE_RATE_LIMIT");
      }
      throw Error("SELECTED_CAPTURE_FAILED");
    }
    if (!response.payload.ok) throw Error("SELECTED_CAPTURE_FAILED");
    let evaluated: unknown;
    if (task.phase === "identity") {
      const resolved = resolveSelectedUnit(member, response.payload.extracted);
      const previous = await prisma.collectionRun.findMany({ where: { status: "SUCCEEDED", scope: { path: ["selectedPanel"], equals: SELECTED_PANEL_KEY } }, orderBy: { finishedAt: "desc" } });
      const prior = previous.find(r => { const s = r.scope as { manifestHash?: string; memberId?: string; phase?: string }; return s.manifestHash === state.manifestHash && s.memberId === member.id && s.phase === "identity"; });
      if (prior && (prior.scope as { evaluated?: { externalId?: string } }).evaluated?.externalId !== resolved.externalId) throw Error("REVIEWED_UNIT_CHANGED");
      evaluated = resolved;
    } else {
      // Reuse the shared raw-quote evaluator after independent provider/listing/room validation.
      const data = otaCollectRatesExtractionSchema.parse(response.payload.extracted);
      if (data.provider !== member.source || data.sourceListingId !== selectedListingId(member)) throw Error("LISTING_IDENTITY_MISMATCH");
      evaluated = evaluateCapturedObservation(evaluationCandidate(member, task.unitExternalId!, run.id), task.unitExternalId!, task.checkIn, data, run.id);
    }
    await persistObservationEvidence(job.id, run.id, source.id, input.traceId, false, SELECTED_PANEL_KEY);
    await prisma.collectionRun.update({ where: { id: run.id }, data: { scope: json({ ...(run.scope as object), evaluated, captureReserved: true }) } });
    await acknowledgePersistedArgusResults(environment, job.id);
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: 1, finishedAt: new Date() } });
  } catch (error) {
    if (error instanceof DeferredJobError) throw error;
    const execution = await prisma.argusExecution.findFirst({ where: { parentJobId: job.id } });
    const reason = execution?.errorCategory ?? (error instanceof Error ? error.message : "SELECTED_CAPTURE_FAILED");
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
      const c = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } }), s = selectedStateSchema.parse(c.payload);
      if (!s.held.some(h => h.memberId === member.id)) s.held.push({ memberId: member.id, reason });
      if (/CHALLENGE|CAPTCHA|LOGIN|RATE_LIMIT|BLOCKED|ACCESS_DENIED/.test(reason)) s.stoppedSources = [...new Set([...s.stoppedSources, member.source])];
      await tx.scheduleDefinition.update({ where: { id: c.id }, data: { payload: json(s) } });
    });
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: reason.slice(0, 200), finishedAt: new Date() } });
    if (execution?.result && ["COMPLETED", "FAILED", "CANCELLED"].includes(execution.status)) {
      try { await persistObservationEvidence(job.id, run.id, source.id, execution.traceId, true, SELECTED_PANEL_KEY); await acknowledgePersistedArgusResults(environment, job.id); } catch { /* Preserve unverified delivery for review. */ }
    }
    throw error;
  }
}
