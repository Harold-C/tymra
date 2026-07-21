import { randomUUID } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import { hashPersonalIdentifier, prisma, type Prisma } from "@tymra/db";
import { z } from "zod";

import { runCollectionControlAction } from "./collection-control";

export const collectionIncidentActionSchema = z.object({
  action: z.enum(["ACKNOWLEDGE", "RETRY", "PAUSE_SOURCE", "RESOLVE", "DISMISS"]),
  reason: z.string().trim().min(3).max(1_000),
});

export async function runCollectionIncidentAction(incidentId: string, adminId: string, inputValue: unknown) {
  const input = collectionIncidentActionSchema.parse(inputValue);
  const incident = await prisma.collectionIncident.findUnique({
    where: { id: incidentId },
    include: { collectionRun: { include: { dataSource: true, job: true } } },
  });
  if (!incident) throw new CollectionIncidentActionError("INCIDENT_NOT_FOUND");
  if (incident.status === "RESOLVED" || incident.status === "DISMISSED") throw new CollectionIncidentActionError("INCIDENT_CLOSED");
  const environment = getEnvironment();

  if (input.action === "ACKNOWLEDGE") {
    await prisma.collectionIncident.update({ where: { id: incident.id }, data: { status: "IN_PROGRESS", acknowledgedAt: incident.acknowledgedAt ?? new Date(), resolutionAction: "ACKNOWLEDGE", resolutionReason: input.reason } });
  } else if (input.action === "PAUSE_SOURCE") {
    await runCollectionControlAction(adminId, { action: "set_source_enabled", sourceKey: incident.collectionRun.dataSource.key, enabled: false }, environment);
    await prisma.collectionIncident.update({ where: { id: incident.id }, data: { status: "IN_PROGRESS", acknowledgedAt: incident.acknowledgedAt ?? new Date(), resolutionAction: "PAUSE_SOURCE", resolutionReason: input.reason } });
  } else if (input.action === "RETRY") {
    if (incident.retryJobId) throw new CollectionIncidentActionError("RETRY_ALREADY_QUEUED");
    const scheduleKey = await retryScheduleKey(incident.collectionRun);
    if (!scheduleKey) throw new CollectionIncidentActionError("RETRY_WORKFLOW_NOT_FOUND");
    const result = await runCollectionControlAction(adminId, { action: "enqueue", scheduleKey }, environment);
    if (!("jobId" in result) || typeof result.jobId !== "string") throw new CollectionIncidentActionError("RETRY_ENQUEUE_FAILED");
    await prisma.collectionIncident.update({ where: { id: incident.id }, data: { status: "IN_PROGRESS", acknowledgedAt: incident.acknowledgedAt ?? new Date(), retryJobId: result.jobId, resolutionAction: "RETRY", resolutionReason: input.reason } });
  } else {
    await prisma.collectionIncident.update({
      where: { id: incident.id },
      data: { status: input.action === "RESOLVE" ? "RESOLVED" : "DISMISSED", resolutionAction: input.action, resolutionReason: input.reason, resolvedAt: new Date() },
    });
  }

  await prisma.auditEvent.create({
    data: {
      actorAdminId: adminId,
      eventType: "collection_incident_action",
      entityType: "CollectionIncident",
      entityId: incident.id,
      payload: { action: input.action, reason: input.reason, collectionRunId: incident.collectionRunId },
      eventHash: hashPersonalIdentifier(`collection-incident:${incident.id}:${input.action}:${randomUUID()}`, environment.ACCESS_KEY_SECRET),
      isDemo: incident.isDemo,
    },
  });
  return prisma.collectionIncident.findUniqueOrThrow({ where: { id: incident.id } });
}

async function retryScheduleKey(run: { dataSource: { key: string }; job: { type: string; payload: Prisma.JsonValue } | null; scope: Prisma.JsonValue }) {
  const runScope = jsonObject(run.scope);
  const jobPayload = jsonObject(run.job?.payload ?? {});
  const phase = stringValue(jobPayload.phase) || stringValue(runScope.phase) || stringValue(runScope.requestedPhase);
  const schedules = await prisma.scheduleDefinition.findMany({
    where: {
      jobType: { in: ["PUBLIC_DATA_COLLECTION", "EVENT_COLLECTION", "WEATHER_COLLECTION", "TRANSPORT_COLLECTION"] },
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
