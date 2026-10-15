import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { prisma, Prisma } from "@tymra/db";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedManifestSchema, selectedHash } from "./selected-panel-plan";
import { OBSERVATION_PILOT_KEY, OBSERVATION_QUEUE } from "./observation-pilot";
import { nextCollectionOutsideOfficeHours } from "./collection-office-hours";

const environment = getEnvironment();
if (environment.NODE_ENV !== "production" || new URL(environment.ARGUS_API_BASE_URL).hostname !== "api.argus.nz") throw Error("Production target required");
const [operation, file] = process.argv.slice(2);
try {
  if (operation !== "activate" || !file) throw Error("Use activate <reviewed-manifest.json>");
  const manifest = selectedManifestSchema.parse(JSON.parse(await readFile(file, "utf8"))), manifestHash = selectedHash(manifest);
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${SELECTED_PANEL_KEY}))`;
    if (await tx.scheduleDefinition.findUnique({ where: { key: SELECTED_PANEL_KEY } })) throw Error("Formal plan already exists; inspect its state instead of rearming");
    const beforeSchedules = await tx.scheduleDefinition.findMany({ orderBy: { key: "asc" }, select: { key: true, enabled: true, payload: true, jobType: true, queueName: true, cronExpression: true } });
    const beforeSources = await tx.dataSource.findMany({ orderBy: { key: "asc" } });
    if (await tx.job.count({ where: { queueName: { in: [OBSERVATION_QUEUE, SELECTED_PANEL_QUEUE] }, status: { in: ["PENDING", "RUNNING"] } } })) throw Error("Selected queues must be idle during replacement");
    const old = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: OBSERVATION_PILOT_KEY } });
    const oldState = old.payload as { canaryEnabled?: boolean; repairs?: { enabled: boolean }[] };
    if (oldState.canaryEnabled || oldState.repairs?.some(r => r.enabled)) throw Error("Close one-off permissions first");
    const historicalJobs = await tx.job.findMany({ where: { queueName: OBSERVATION_QUEUE } });
    const oldRuns = await tx.collectionRun.findMany({ where: { jobId: { in: historicalJobs.map(j => j.id) }, status: "SUCCEEDED" }, orderBy: { finishedAt: "desc" } });
    const delivered = await tx.argusExecution.findMany({ where: { collectionRunId: { in: oldRuns.map(r => r.id) }, deliveryVerifiedAt: { not: null } } });
    const bindings: { memberId: string; unitExternalId: string; sourceRunId: string; verifiedAt: string }[] = [];
    for (const member of manifest.members.filter(m => m.enabled && m.expectedUnitId)) {
      const source = beforeSources.find(s => s.key === member.source);
      const prior = oldRuns.find(r => r.dataSourceId === source?.id && delivered.some(e => e.collectionRunId === r.id)
        && (r.scope as { evaluated?: { externalId?: string } }).evaluated?.externalId === member.expectedUnitId);
      if (prior?.finishedAt) bindings.push({ memberId: member.id, unitExternalId: member.expectedUnitId!, sourceRunId: prior.id, verifiedAt: prior.finishedAt.toISOString() });
    }
    const stoppedSources = [...new Set(manifest.members.filter(m => m.enabled).flatMap(m => {
      const source = beforeSources.find(s => s.key === m.source);
      return !source || source.isDemo || source.lifecycle === "BLOCKED" || source.operationalStatus === "BLOCKED" ? [m.source] : [];
    }))];
    await tx.scheduleDefinition.update({ where: { id: old.id }, data: { enabled: false, nextRunAt: null } });
    const control = await tx.scheduleDefinition.create({ data: { key: SELECTED_PANEL_KEY, jobType: "RATE_COLLECTION", queueName: SELECTED_PANEL_QUEUE,
      cronExpression: "daily", enabled: true, nextRunAt: nextCollectionOutsideOfficeHours(new Date()), payload: { manifest, manifestHash, bindings, held: [], stoppedSources } as unknown as Prisma.InputJsonValue } });
    const afterSchedules = await tx.scheduleDefinition.findMany({ orderBy: { key: "asc" }, select: { key: true, enabled: true, payload: true, jobType: true, queueName: true, cronExpression: true } });
    const afterSources = await tx.dataSource.findMany({ orderBy: { key: "asc" } });
    const unrelated = (rows: typeof beforeSchedules) => rows.filter(s => ![OBSERVATION_PILOT_KEY, SELECTED_PANEL_KEY].includes(s.key));
    if (selectedHash(unrelated(beforeSchedules)) !== selectedHash(unrelated(afterSchedules)) || selectedHash(beforeSources) !== selectedHash(afterSources)) throw Error("Unrelated controls changed");
    const payload = { manifestHash, members: manifest.members.length, enabledMembers: manifest.members.filter(m => m.enabled).length,
      totalExecutionLimit: null, automaticRetries: false, supersededSchedule: OBSERVATION_PILOT_KEY,
      historicAcceptanceJobs: historicalJobs.length, historicAcceptanceExecutions: 42 + historicalJobs.length,
      priorBindingsReused: bindings.length, nextRunAt: control.nextRunAt?.toISOString(), stoppedSources,
      unchangedOtherSchedulesHash: selectedHash(unrelated(afterSchedules)), unchangedSourcesHash: selectedHash(afterSources),
      authorization: "Direct user authorization to cancel the old 195 ceiling and use the complete selected roster" };
    const audit = await tx.auditEvent.create({ data: { eventType: "selected_sample_collection_enabled", entityType: "ScheduleDefinition", entityId: control.id,
      payload: payload as unknown as Prisma.InputJsonValue, eventHash: createHmac("sha256", environment.ACCESS_KEY_SECRET).update(JSON.stringify(payload)).digest("hex") } });
    return { ...payload, enabled: true, auditId: audit.id, legacyDisabled: true };
  }, { timeout: 20000, isolationLevel: "RepeatableRead" });
  console.log(JSON.stringify(result));
} finally { await prisma.$disconnect(); }
