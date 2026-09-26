import { prisma, type Prisma } from "@tymra/db";
import { publicDataAdapters } from "@tymra/providers";

import { registrySourceSeedRecords } from "../../../../packages/db/prisma/seed-sources";
import { FIRST_PUBLIC_SCHEDULES } from "./production-public-schedules";

const firstSourceKeys = new Set<string>(FIRST_PUBLIC_SCHEDULES.map((schedule) => schedule.sourceId));

// Browser and bespoke collectors need their own bounds and release gates.
export const PUBLIC_PILOT_SOURCE_KEYS: string[] = registrySourceSeedRecords()
  .filter((source) => source.providerType === "PUBLIC"
    && !firstSourceKeys.has(source.key)
    && source.key !== "eventfinda"
    && !/ARGUS|BROWSER/.test(source.accessMethod)
    && publicDataAdapters[source.key]?.metadata.adapterKey === source.adapterKey)
  .map((source) => source.key);

const pilotKeys = new Set(PUBLIC_PILOT_SOURCE_KEYS);

export function publicPilotSchedulePayload(sourceId: string) {
  if (!pilotKeys.has(sourceId)) throw new Error(`Source is outside the direct-public pilot: ${sourceId}`);
  return { sourceId, marketScope: "new-zealand", limit: 2, productionCanary: true };
}

export function isProductionPublicPilotSchedule(schedule: {
  key: string;
  jobType: string;
  queueName: string;
  cronExpression: string;
  payload: unknown;
}) {
  const sourceId = schedule.key.match(/^pilot-public-([a-z0-9_]+)-weekly$/)?.[1];
  if (!sourceId || !pilotKeys.has(sourceId)
    || schedule.jobType !== "PUBLIC_DATA_COLLECTION"
    || schedule.queueName !== "public-data-collection"
    || schedule.cronExpression !== "weekly") return false;
  const expected = publicPilotSchedulePayload(sourceId);
  const payload = schedule.payload;
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    && Object.keys(payload).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, value]) => (payload as Record<string, unknown>)[key] === value);
}

export async function enableProductionPublicPilot(sourceId: string, nodeEnv: string) {
  return prisma.$transaction((transaction) => enableProductionPublicPilotTransaction(transaction, sourceId, nodeEnv));
}

export async function enableProductionPublicPilotTransaction(transaction: Prisma.TransactionClient, sourceId: string, nodeEnv: string) {
  if (nodeEnv !== "production" || !pilotKeys.has(sourceId)) throw new Error("Direct-public pilot requires an approved production source");
  const source = await transaction.dataSource.findUnique({ where: { key: sourceId } });
  const metadata = source?.metadata;
  if (!source || !source.enabled || source.operationalStatus !== "HEALTHY" || source.isDemo
    || source.providerType !== "PUBLIC" || !source.environments.includes("PRODUCTION")
    || typeof metadata !== "object" || metadata === null || Array.isArray(metadata)
    || (metadata as Record<string, unknown>).boundedProductionCanary !== true) {
    throw new Error("Source has not passed the public-pilot activation gate");
  }
  const runs = await transaction.collectionRun.findMany({
    where: { dataSourceId: source.id, status: "SUCCEEDED", isDemo: false },
    orderBy: { finishedAt: "desc" }, take: 2,
    select: { id: true, successCount: true, scope: true },
  });
  if (runs.length !== 2 || runs.some((run) => {
    const scope = run.scope;
    return run.successCount < 1 || typeof scope !== "object" || scope === null || Array.isArray(scope)
      || (scope as Record<string, unknown>).productionCanary !== true
      || (scope as Record<string, unknown>).configurationUnchanged !== true
      || (scope as Record<string, unknown>).schedulesUnchanged !== true;
  })) throw new Error("Two successful bounded production passes are required");
  if (await transaction.rawArtifact.count({ where: { collectionRunId: { in: runs.map((run) => run.id) }, parserFailure: true } })) {
    throw new Error("Pilot passes contain parser failures");
  }
  const key = `pilot-public-${sourceId}-weekly`;
  if (await transaction.scheduleDefinition.findUnique({ where: { key } })) throw new Error("Pilot schedule already exists");
  const schedule = await transaction.scheduleDefinition.create({ data: {
    key, jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection",
    cronExpression: "weekly", payload: publicPilotSchedulePayload(sourceId),
    enabled: true, nextRunAt: new Date(Date.now() + 7 * 86_400_000),
  } });
  return { sourceId, schedule: { key: schedule.key, enabled: schedule.enabled, nextRunAt: schedule.nextRunAt }, acceptedRuns: runs.map((run) => run.id), mutationPerformed: true };
}
