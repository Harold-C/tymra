import { createHash } from "node:crypto";

import { prisma, type Prisma } from "@tymra/db";
import { ARGUS_PUBLIC_MARKET_SOURCES, publicDataAdapters } from "@tymra/providers";

import { registrySourceSeedRecords } from "../../../../packages/db/prisma/seed-sources";
import { FIRST_PUBLIC_SCHEDULES } from "./production-public-schedules";

const firstSourceKeys = new Set<string>(FIRST_PUBLIC_SCHEDULES.map((schedule) => schedule.sourceId));

// Browser and bespoke collectors need their own bounds and release gates.
export const PUBLIC_PILOT_SOURCE_KEYS: string[] = registrySourceSeedRecords()
  .filter((source) => source.providerType === "PUBLIC"
    && !firstSourceKeys.has(source.key)
    && !/ARGUS|BROWSER/.test(source.accessMethod)
    && publicDataAdapters[source.key]?.metadata.adapterKey === source.adapterKey)
  .map((source) => source.key);

export const ARGUS_MARKET_PILOT_SOURCE_KEYS: string[] = [
  ...ARGUS_PUBLIC_MARKET_SOURCES.map((source) => source.sourceId),
  "school_sport_nz", "school_sport_canterbury", "ticketek_events", "dunedinnz_events",
  "auckland_airport_monthly", "mot_airline_performance", "fx_rates", "ticketmaster",
];
const browserPilotKeys = new Set(ARGUS_MARKET_PILOT_SOURCE_KEYS);
const pilotKeys = new Set([...PUBLIC_PILOT_SOURCE_KEYS, ...ARGUS_MARKET_PILOT_SOURCE_KEYS]);

export function publicPilotSchedulePayload(sourceId: string) {
  if (!pilotKeys.has(sourceId)) throw new Error(`Source is outside the approved public pilot: ${sourceId}`);
  const marketScope = sourceId === "dunedinnz_events" ? "dunedin"
    : sourceId === "school_sport_nz" || sourceId === "school_sport_canterbury" ? "christchurch"
      : "new-zealand";
  return { sourceId, marketScope, limit: 2, productionCanary: true };
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
  if (nodeEnv !== "production" || !pilotKeys.has(sourceId)) throw new Error("Public pilot requires an approved production source");
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
    select: { id: true, jobId: true, successCount: true, scope: true },
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
  if (sourceId === "eventfinda") {
    const artifacts = await transaction.rawArtifact.findMany({
      where: { collectionRunId: { in: runs.map((run) => run.id) }, artifactType: "HTML", deletedAt: null },
      select: { collectionRunId: true, contentHash: true, payload: true },
    });
    if (runs.some((run) => !artifacts.some((artifact) => artifact.collectionRunId === run.id))
      || artifacts.some((artifact) => typeof (artifact.payload as Record<string, unknown> | null)?.html !== "string"
        || createHash("sha256").update(JSON.stringify((artifact.payload as Record<string, unknown>).html)).digest("hex") !== artifact.contentHash)) {
      throw new Error("Eventfinda pilot HTTP evidence is incomplete or has a hash mismatch");
    }
  }
  if (browserPilotKeys.has(sourceId)) {
    if (!await transaction.sourceEvent.count({ where: { dataSourceId: source.id } })
      && !await transaction.sourceMarketSignal.count({ where: { dataSourceId: source.id } })) {
      throw new Error("Argus pilot has no persisted business record");
    }
    const jobIds = runs.map((run) => run.jobId).filter((id): id is string => Boolean(id));
    if (jobIds.length !== 2 || (metadata as Record<string, unknown>).browserPilot !== true) throw new Error("Argus pilot requires two queued passes");
    const jobs = await transaction.job.findMany({ where: { id: { in: jobIds } }, select: { status: true, attemptCount: true, maxAttempts: true } });
    if (jobs.length !== 2 || jobs.some((job) => job.status !== "SUCCEEDED" || job.attemptCount !== 1 || job.maxAttempts !== 1)) {
      throw new Error("Argus pilot Jobs did not finish safely in one attempt");
    }
    const executions = await transaction.argusExecution.findMany({ where: { parentJobId: { in: jobIds } }, select: { parentJobId: true, status: true, result: true } });
    if (executions.length < 2 || jobIds.some((id) => !executions.some((execution) => execution.parentJobId === id))
      || executions.some((execution) => execution.status !== "COMPLETED" || execution.result === null)) {
      throw new Error("Argus pilot result delivery is incomplete");
    }
    const artifacts = await transaction.rawArtifact.findMany({ where: { collectionRunId: { in: runs.map((run) => run.id) }, deletedAt: null }, select: { collectionRunId: true, storageRef: true } });
    if (runs.some((run) => !artifacts.some((artifact) => artifact.collectionRunId === run.id && artifact.storageRef.startsWith("tymra-evidence:")))
      || artifacts.some((artifact) => artifact.storageRef.startsWith("argus-evidence:"))) {
      throw new Error("Argus pilot evidence has not been retained locally");
    }
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
