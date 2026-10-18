import { prisma, Prisma, retainSampleReferencePackages, type Job, type CollectionRun } from "@tymra/db";
import type { Environment } from "@tymra/config";
import { addNzCalendarDays, nzStartOfDay, nzDateKey, observationCandidateSchema } from "@tymra/domain";
import { otaResolveListingExtractionSchema, otaCollectRatesExtractionSchema } from "@tymra/providers/ota-argus-contracts";
import type { ArgusCaptureInput } from "../clients/argus-client";
import { DeferredJobError } from "../jobs/deferred-job";
import { persistObservationEvidence } from "./observation-production";
import { evaluateCapturedObservation } from "./observation-evaluation";
import { assertSelectedManualReview, selectedManualBatch } from "./selected-panel-review";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedStateSchema, selectedJobSchema, selectedTaskKey, selectedHash, selectedListingId, selectedCycle, selectedMemberAnchors, selectedDailyLimit, nextSelectedTasks, selectedTaskMatchesState, selectedMemberExecutionHash, selectedWindowTime, type SelectedMember, type SelectedTask, type MemberProgress } from "./selected-panel-plan";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const activeStatuses = ["SUBMITTED", "RUNNING", "WAITING_FOR_MANUAL", "CANCEL_REQUESTED"] as const;
// Daily history grows quickly. Do not load retained wire/HTML for progress or identity checks.
async function selectedProgressRuns(client: Pick<Prisma.TransactionClient, "$queryRaw">, now = new Date()) {
  return client.$queryRaw<Pick<CollectionRun, "id" | "jobId" | "dataSourceId" | "finishedAt" | "scope">[]>(Prisma.sql`
    SELECT id, "jobId", "dataSourceId", "finishedAt", jsonb_build_object(
      'selectedPanel', scope->'selectedPanel', 'manifestHash', scope->'manifestHash', 'memberId', scope->'memberId',
      'phase', scope->'phase', 'task', scope->'task', 'observedAt', scope#>'{evaluated,0,raw,observedAt}',
      'evaluated', CASE WHEN scope->>'phase' = 'identity' THEN scope->'evaluated' ELSE NULL END) AS scope
    FROM "CollectionRun" WHERE status = 'SUCCEEDED' AND scope->>'selectedPanel' = ${SELECTED_PANEL_KEY}
      AND "finishedAt" >= ${new Date(now.getTime() - 28 * 86_400_000)} ORDER BY "finishedAt" DESC`);
}
export function selectedInput(member: SelectedMember, task: SelectedTask, parentId: string): ArgusCaptureInput {
  const stay = { checkIn: task.checkIn, checkOut: addNzCalendarDays(task.checkIn, member.nights), adults: 2, children: 0 as const, units: 1, currency: "NZD" as const };
  return { traceId: `selected-${selectedHash([parentId, task]).slice(0, 30)}`, connectorId: `${member.source}-public` as ArgusCaptureInput["connectorId"],
    workflowId: task.phase === "identity" ? "resolve_listing" : "collect_rates", url: member.sourceUrl,
    maxRecords: task.phase === "identity" && member.source === "booking" ? 50 : 20, maxAttempts: 1, timeoutMs: 60000,
    ...(task.phase === "identity" && member.source === "booking" ? { includeUnknownSharing: true } : {}),
    ...(task.phase === "quote" ? { ...stay, unitExternalId: task.unitExternalId! } : ["booking", "expedia", "trip"].includes(member.source) ? { identityStay: stay } : {}) };
}
export function resolveSelectedUnit(member: SelectedMember, extracted: unknown, prior?: { externalId: string; unit: { officialName: string; capacity: number | null; areaSquareMetres?: number | null; bedTypes: string[] } }) {
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
  // Trip's supplier room IDs can represent different meal/payment offers of
  // one physical card. Only an explicit same-property source card can link
  // these variants; equal names alone remain ambiguous.
  const group = member.source === "trip" && !member.expectedUnitId && !member.signature && member.entireBedrooms === null
    && matches.length > 0 ? matches[0].sourceRoomGroupExternalId : undefined;
  if (group && group.startsWith(`${data.sourceListingId}:room-group:`)
    && matches.every(unit => unit.sourceRoomGroupExternalId === group && unit.officialName === matches[0].officialName
      && unit.entireOrShared === matches[0].entireOrShared && unit.unitType === matches[0].unitType)) {
    const first = matches[0];
    const common = <K extends "capacity" | "bedrooms" | "bathrooms" | "areaSquareMetres">(key: K) =>
      matches.every(unit => unit[key] === first[key]) ? first[key] : null;
    return { externalId: group, unit: { ...first, externalId: group, identityQuality: "partial" as const,
      capacity: common("capacity"), bedrooms: common("bedrooms"), bathrooms: common("bathrooms"), areaSquareMetres: common("areaSquareMetres"),
      bedTypes: first.bedTypes.filter(bed => matches.every(unit => unit.bedTypes.includes(bed))),
      amenities: first.amenities.filter(amenity => matches.every(unit => unit.amenities.includes(amenity))) },
      observedSourceUnitExternalIds: matches.map(unit => unit.externalId), observedAt: data.observedAt };
  }
  if (matches.length !== 1) throw Error(matches.length ? "UNIT_IDENTITY_AMBIGUOUS" : "SELECTED_ROOM_NOT_RETURNED");
  const unit = matches[0];
  const nameKey = `expedia:${member.sourceListingId}:unit:${unit.officialName.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 100)}`;
  if (member.source === "expedia" && prior?.externalId === nameKey && unit.externalId !== prior.externalId
    && name(prior.unit.officialName) === name(unit.officialName) && prior.unit.capacity === unit.capacity
    && prior.unit.areaSquareMetres === unit.areaSquareMetres && selectedHash(prior.unit.bedTypes) === selectedHash(unit.bedTypes)) {
    return { externalId: prior.externalId, unit: { ...unit, externalId: prior.externalId, identityQuality: "partial" as const },
      observedSourceUnitExternalId: unit.externalId, observedAt: data.observedAt };
  }
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
    const jobs = await tx.job.findMany({ where: { queueName: SELECTED_PANEL_QUEUE, createdAt: { gte: new Date(now.getTime() - 28 * 86_400_000) } }, orderBy: { createdAt: "desc" } });
    const matching = jobs.filter(j => selectedTaskMatchesState(state, selectedJobSchema.parse(j.payload)));
    const matchingIds = new Set(matching.map(j => j.id));
    const runs = (await selectedProgressRuns(tx, now)).filter(r => !!r.jobId && matchingIds.has(r.jobId));
    const progress: MemberProgress[] = state.manifest.members.map(member => {
      const own = runs.filter(r => (r.scope as { memberId?: string }).memberId === member.id);
      const identity = own.find(r => (r.scope as { phase?: string }).phase === "identity");
      const quote = own.find(r => (r.scope as { phase?: string }).phase === "quote");
      const prior = state.bindings.find(b => b.memberId === member.id);
      return { memberId: member.id, lastQuoteAt: quote?.finishedAt ?? null, identityAt: identity?.finishedAt ?? (prior ? new Date(prior.verifiedAt) : null),
        unitExternalId: (identity?.scope as { evaluated?: { externalId?: string } } | undefined)?.evaluated?.externalId ?? prior?.unitExternalId ?? null,
        windows: own.flatMap(r => { const scope = r.scope as { phase?: string; task?: SelectedTask; observedAt?: unknown }; return scope.phase === "quote" && r.finishedAt && scope.task
          ? [{ checkIn: scope.task.checkIn, finishedAt: selectedWindowTime(r.finishedAt, scope.observedAt, state.cadence?.version === "dual-window-daily-v1") }] : []; }) };
    });
    const tasks = nextSelectedTasks(state, progress, new Set(matching.map(j => j.idempotencyKey!)), now);
    const sources = await tx.dataSource.findMany({ where: { key: { in: [...new Set(tasks.map(t => t.sourceId))] } } });
    const dailyExecutions = await tx.argusExecution.findMany({ where: { dataSourceId: { in: sources.map(s => s.id) }, submittedAt: { gte: nzStartOfDay(now) } }, select: { dataSourceId: true, parentJobId: true } });
    for (const task of tasks) {
      const source = sources.find(s => s.key === task.sourceId);
      if (!source || source.isDemo || !source.environments.includes("PRODUCTION") || source.concurrencyLimit !== 1
        || source.lifecycle === "BLOCKED" || !["HEALTHY", "DEGRADED"].includes(source.operationalStatus)) continue;
      const dedicated = !!state.cadence && task.sourceId === "booking";
      const executions = dailyExecutions.filter(e => e.dataSourceId === source.id && (!dedicated || jobs.some(j => j.id === e.parentJobId)));
      const reserved = jobs.filter(j => j.sourceId === task.sourceId && j.createdAt >= nzStartOfDay(now) && !executions.some(e => e.parentJobId === j.id));
      if (executions.length + reserved.length >= selectedDailyLimit(state, task.sourceId, source.dailyBudget, now)) continue;
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
  const manualBatch = selectedManualBatch(parent);
  if (manualBatch) await assertSelectedManualReview(parent, task, control.id, now);
  if (!manualBatch && state.cadence?.version === "dual-window-daily-v1" && task.phase === "quote"
    && task.round >= state.cadence.dailyStartsOn! && task.round !== nzDateKey(now)) throw Error("SELECTED_DAILY_WINDOW_EXPIRED");
  if (!control.enabled || !selectedTaskMatchesState(state, task) || !member?.enabled || (!manualBatch && state.held.some(h => h.memberId === member.id))
    || state.stoppedSources.includes(member.source) || parent.queueName !== SELECTED_PANEL_QUEUE || parent.type !== "RATE_COLLECTION"
    || parent.maxAttempts !== 1 || (!manualBatch && parent.idempotencyKey !== selectedTaskKey(task)) || task.sourceId !== member.source || parent.sourceId !== member.source
    || nzDateKey(now) < state.manifest.start || task.checkIn <= nzDateKey(now)
    || !selectedMemberAnchors(member, selectedCycle(state, parent.createdAt)).includes(task.checkIn)
    || task.round !== (task.phase === "quote" ? selectedCycle(state, parent.createdAt).round : nzDateKey(parent.createdAt))) throw Error("SELECTED_PANEL_PERMISSION_CLOSED");
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { id: dataSourceId } });
  if (source.key !== member.source || source.isDemo || !source.environments.includes("PRODUCTION") || source.concurrencyLimit !== 1
    || source.lifecycle === "BLOCKED" || !["HEALTHY", "DEGRADED"].includes(source.operationalStatus)) throw Error("SELECTED_SOURCE_BLOCKED");
  if (JSON.stringify(input) !== JSON.stringify(selectedInput(member, task, parent.id))) throw Error("SELECTED_INPUT_CHANGED");
  if (task.phase === "quote") {
    const runs = await selectedProgressRuns(prisma, now);
    let identity = runs.find(r => { const s = r.scope as { memberId?: string; manifestHash?: string; phase?: string }; return s.memberId === member.id && s.manifestHash === selectedMemberExecutionHash(state, member) && s.phase === "identity"; });
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
  const dedicatedJobs = state.cadence && member.source === "booking" ? await prisma.job.findMany({ where: { queueName: SELECTED_PANEL_QUEUE, sourceId: "booking", createdAt: { gte: new Date(now.getTime() - 28 * 86_400_000) } }, select: { id: true } }) : null;
  const daily = await prisma.argusExecution.count({ where: { dataSourceId, submittedAt: { gte: nzStartOfDay(now) }, ...(dedicatedJobs ? { parentJobId: { in: dedicatedJobs.map(j => j.id) } } : {}) } });
  if (daily >= selectedDailyLimit(state, member.source, source.dailyBudget, now)) throw new DeferredJobError("Waiting for the source plan daily allowance", nzStartOfDay(new Date(now.getTime() + 86_400_000)));
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
  if (!member || !selectedTaskMatchesState(state, task)) throw Error("MANIFEST_CHANGED");
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: member.source } });
  let run = await prisma.collectionRun.findFirst({ where: { jobId: job.id } });
  if (!run) run = await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "RUNNING", startedAt: new Date(),
    scope: json({ selectedPanel: SELECTED_PANEL_KEY, manifestHash: task.manifestHash, controlManifestHash: state.manifestHash, memberId: member.id, phase: task.phase, task, comparison: "RAW_ONLY", captureReserved: false }) } });
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
      const previous = await selectedProgressRuns(prisma);
      const prior = previous.find(r => { const s = r.scope as { manifestHash?: string; memberId?: string; phase?: string }; return s.manifestHash === selectedMemberExecutionHash(state, member) && s.memberId === member.id && s.phase === "identity"; });
      const resolved = resolveSelectedUnit(member, response.payload.extracted, (prior?.scope as { evaluated?: Parameters<typeof resolveSelectedUnit>[2] } | undefined)?.evaluated);
      if (prior && (prior.scope as { evaluated?: { externalId?: string } }).evaluated?.externalId !== resolved.externalId) throw Error("REVIEWED_UNIT_CHANGED");
      evaluated = resolved;
    } else {
      // Reuse the shared raw-quote evaluator after independent provider/listing/room validation.
      const data = otaCollectRatesExtractionSchema.parse(response.payload.extracted);
      if (data.provider !== member.source || data.sourceListingId !== selectedListingId(member)) throw Error("LISTING_IDENTITY_MISMATCH");
      evaluated = evaluateCapturedObservation(evaluationCandidate(member, task.unitExternalId!, run.id), task.unitExternalId!, task.checkIn, data, run.id);
    }
    await persistObservationEvidence(job.id, run.id, source.id, input.traceId, false, SELECTED_PANEL_KEY);
    const retainedRun = await prisma.collectionRun.findUniqueOrThrow({ where: { id: run.id } });
    await prisma.collectionRun.update({ where: { id: run.id }, data: { scope: json({ ...(retainedRun.scope as object), evaluated, captureReserved: true }) } });
    await acknowledgePersistedArgusResults(environment, job.id);
    if (task.phase === "quote" && member.source === "booking") await retainSampleReferencePackages(run.id, member.sourceUrl, member.nights);
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: 1, finishedAt: new Date() } });
  } catch (error) {
    if (error instanceof DeferredJobError) throw error;
    const execution = await prisma.argusExecution.findFirst({ where: { parentJobId: job.id } });
    const reason = execution?.errorCategory ?? (error instanceof Error ? error.message : "SELECTED_CAPTURE_FAILED");
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key = ${SELECTED_PANEL_KEY} FOR UPDATE`;
      const c = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } }), s = selectedStateSchema.parse(c.payload);
      // An unstarted prior-day window is a recorded gap, not a source failure or a retry.
      if (reason !== "SELECTED_DAILY_WINDOW_EXPIRED" && !s.held.some(h => h.memberId === member.id)) s.held.push({ memberId: member.id, reason });
      if (/CHALLENGE|CAPTCHA|LOGIN|RATE_LIMIT|BLOCKED|ACCESS_DENIED|SOURCE_DAILY_BUDGET_EXHAUSTED|SOURCE_CIRCUIT_OPEN/.test(reason)) s.stoppedSources = [...new Set([...s.stoppedSources, member.source])];
      await tx.scheduleDefinition.update({ where: { id: c.id }, data: { payload: json(s) } });
    });
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: reason.slice(0, 200), finishedAt: new Date() } });
    if (execution?.result && ["COMPLETED", "FAILED", "CANCELLED"].includes(execution.status)) {
      try { await persistObservationEvidence(job.id, run.id, source.id, execution.traceId, true, SELECTED_PANEL_KEY); await acknowledgePersistedArgusResults(environment, job.id); } catch { /* Preserve unverified delivery for review. */ }
    }
    throw error;
  }
}
