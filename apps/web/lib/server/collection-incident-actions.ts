import { getEnvironment } from "@tymra/config";
import { prisma, type Prisma } from "@tymra/db";
import { collectionRecoveryScopeMatches, serviceCollectionJobTypes, verifyCollectionRecovery } from "@tymra/domain";
import { z } from "zod";

import { runCollectionControlAction } from "./collection-control";
import { writeServiceAudit } from "./service-recovery";

export const collectionIncidentActionSchema = z.object({
  action: z.enum(["ACKNOWLEDGE", "RETRY", "PAUSE_SOURCE", "RESOLVE", "DISMISS"]),
  reason: z.string().trim().min(3).max(1_000),
});

export async function runCollectionIncidentAction(incidentId: string, adminId: string, inputValue: unknown) {
  const input = collectionIncidentActionSchema.parse(inputValue);
  return prisma.$transaction(async (transaction) => {
  await transaction.$queryRaw`SELECT id FROM "CollectionIncident" WHERE id = ${incidentId} FOR UPDATE`;
  const incident = await transaction.collectionIncident.findUnique({
    where: { id: incidentId },
    include: { collectionRun: { include: { dataSource: true, job: true } } },
  });
  if (!incident) throw new CollectionIncidentActionError("INCIDENT_NOT_FOUND");
  if (incident.status === "RESOLVED" || incident.status === "DISMISSED") throw new CollectionIncidentActionError("INCIDENT_CLOSED");
  const environment = getEnvironment();
  let verification: Prisma.InputJsonObject = {};

  if (input.action === "ACKNOWLEDGE") {
    await transaction.collectionIncident.update({ where: { id: incident.id }, data: { status: "IN_PROGRESS", acknowledgedAt: incident.acknowledgedAt ?? new Date(), resolutionAction: "ACKNOWLEDGE", resolutionReason: input.reason } });
  } else if (input.action === "PAUSE_SOURCE") {
    await runCollectionControlAction(adminId, { action: "set_source_enabled", sourceKey: incident.collectionRun.dataSource.key, enabled: false, reason: input.reason, commandId: `incident-pause:${incident.id}` }, environment);
    await transaction.collectionIncident.update({ where: { id: incident.id }, data: { status: "IN_PROGRESS", acknowledgedAt: incident.acknowledgedAt ?? new Date(), resolutionAction: "PAUSE_SOURCE", resolutionReason: input.reason } });
  } else if (input.action === "RETRY") {
    const previous = incident.retryJobId ? await transaction.job.findUnique({ where: { id: incident.retryJobId } }) : null;
    if (previous && ["PENDING", "RUNNING", "SUCCEEDED"].includes(previous.status)) return incident;
    const scheduleKey = await retryScheduleKey(incident.collectionRun);
    if (!scheduleKey) throw new CollectionIncidentActionError("RETRY_WORKFLOW_NOT_FOUND");
    const result = await runCollectionControlAction(adminId, { action: "enqueue", scheduleKey, reason: input.reason, commandId: `incident-retry:${incident.id}:after:${incident.retryJobId ?? "initial"}` }, environment);
    if (!result || typeof result !== "object" || Array.isArray(result) || !("jobId" in result) || typeof result.jobId !== "string") throw new CollectionIncidentActionError("RETRY_ENQUEUE_FAILED");
    await transaction.collectionIncident.update({ where: { id: incident.id }, data: { status: "IN_PROGRESS", acknowledgedAt: incident.acknowledgedAt ?? new Date(), retryJobId: result.jobId, resolutionAction: "RETRY", resolutionReason: input.reason } });
  } else {
    if (input.action === "RESOLVE") {
      if (!incident.retryJobId) throw new CollectionIncidentActionError("RECOVERY_EVIDENCE_REQUIRED");
      const job = await transaction.job.findUnique({ where: { id: incident.retryJobId }, include: { collectionRuns: true } });
      const sameScope = (scope: Prisma.JsonValue) => {
        return collectionRecoveryScopeMatches(jsonObject(incident.collectionRun.job?.payload ?? {}), jsonObject(incident.collectionRun.scope), jsonObject(job?.payload ?? {}), jsonObject(scope));
      };
      const matchingRuns = job?.collectionRuns.filter(run => sameScope(run.scope)) ?? [];
      if (job?.collectionRuns.some(run => run.status !== "SUCCEEDED" || run.errorCode || run.failureCount > 0)) throw new CollectionIncidentActionError("RECOVERY_PIPELINE_INCOMPLETE");
      const executions = job ? await transaction.argusExecution.findMany({ where: { parentJobId: job.id } }) : [];
      if (executions.some(row => row.status !== "COMPLETED" || !row.deliveryVerifiedAt)) throw new CollectionIncidentActionError("ARGUS_DELIVERY_UNVERIFIED");
      if (incident.collectionRun.dataSource.providerType === "OTA" && (!executions.length || job?.collectionRuns.some(run => run.dataSourceId === incident.collectionRun.dataSourceId && !executions.some(row => row.collectionRunId === run.id)))) throw new CollectionIncidentActionError("ARGUS_DELIVERY_UNVERIFIED");
      const proof = verifyCollectionRecovery({ incidentCreatedAt: incident.createdAt, sourceId: incident.collectionRun.dataSourceId, jobStatus: job?.status ?? null, runs: matchingRuns });
      if (!proof.verified) throw new CollectionIncidentActionError(proof.reason);
      verification = { verification: proof.reason, recoveryJobId: job!.id, recoveryRunIds: job!.collectionRuns.filter((run) => run.dataSourceId === incident.collectionRun.dataSourceId && run.status === "SUCCEEDED").map((run) => run.id), verifiedAt: new Date().toISOString() };
    } else {
      if (["P0", "P1"].includes(incident.severity)) throw new CollectionIncidentActionError("INCIDENT_NOT_DISMISSIBLE");
      verification = { healthUnchanged: true, historicalEvidenceRetained: true };
    }
    await transaction.collectionIncident.update({
      where: { id: incident.id },
      data: { status: input.action === "RESOLVE" ? "RESOLVED" : "DISMISSED", resolutionAction: input.action, resolutionReason: input.reason, resolvedAt: new Date() },
    });
  }

  const updated = await transaction.collectionIncident.findUniqueOrThrow({ where: { id: incident.id } });
  await writeServiceAudit(transaction, adminId, "collection_incident_action", "CollectionIncident", incident.id, {
    action: input.action, reason: input.reason, collectionRunId: incident.collectionRunId,
    before: { status: incident.status }, after: { status: updated.status }, ...verification,
  }, incident.isDemo);
  return updated;
  }, { timeout: 15_000 });
}

async function retryScheduleKey(run: { dataSource: { key: string }; job: { type: string; payload: Prisma.JsonValue } | null; scope: Prisma.JsonValue }) {
  const runScope = jsonObject(run.scope);
  const jobPayload = jsonObject(run.job?.payload ?? {});
  const phase = stringValue(jobPayload.phase) || stringValue(runScope.phase) || stringValue(runScope.requestedPhase);
  const schedules = await prisma.scheduleDefinition.findMany({
    where: {
      jobType: { in: [...serviceCollectionJobTypes] },
    },
    orderBy: { key: "asc" },
  });
  return schedules.find((schedule) => {
    if (run.job?.type && schedule.jobType !== run.job.type) return false;
    const payload = jsonObject(schedule.payload);
    if (stringValue(payload.sourceId) !== run.dataSource.key) return false;
    return phase ? stringValue(payload.phase) === phase : true;
  })?.key ?? null;
}

function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}
function stringValue(value: Prisma.JsonValue | undefined) { return typeof value === "string" ? value : ""; }

export class CollectionIncidentActionError extends Error {
  constructor(public readonly code: string) { super(code); }
}
