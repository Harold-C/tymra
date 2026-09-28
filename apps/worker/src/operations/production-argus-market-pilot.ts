import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Environment } from "@tymra/config";
import { prisma, type Prisma } from "@tymra/db";
import { publicDataAdapters } from "@tymra/providers";

import { registrySourceSeedRecords } from "../../../../packages/db/prisma/seed-sources";
import { getArgusJobResult } from "../clients/argus-client";
import { ARGUS_MARKET_PILOT_SOURCE_KEYS, argusPilotAcceptanceStart, enableProductionPublicPilot, isProductionPublicPilotSchedule, PUBLIC_PILOT_SOURCE_KEYS, verifiedSchoolSportCanterburyZeroPass } from "./production-public-pilot";
import { FIRST_PUBLIC_SCHEDULES, isFirstPublicSchedule } from "./production-public-schedules";

const browserKeys = new Set(ARGUS_MARKET_PILOT_SOURCE_KEYS);
const knownKeys = new Set([
  ...FIRST_PUBLIC_SCHEDULES.map((schedule) => schedule.sourceId),
  ...PUBLIC_PILOT_SOURCE_KEYS,
  ...ARGUS_MARKET_PILOT_SOURCE_KEYS,
  "christchurch_university_dates",
]);

export async function bootstrapProductionArgusMarketPilot(sourceKey: string, nodeEnv: string, argusReady: boolean) {
  if (nodeEnv !== "production" || !argusReady || !browserKeys.has(sourceKey)) {
    throw new Error("Argus market pilot requires one approved public source and a ready production Argus");
  }
  const record = registrySourceSeedRecords().find((source) => source.key === sourceKey);
  const adapter = publicDataAdapters[sourceKey];
  if (!record || record.providerType !== "PUBLIC" || record.isDemo
    || record.accessMethod !== (sourceKey === "council_calendars" ? "OFFICIAL_PUBLIC_HTML_PAGINATED"
      : sourceKey === "fx_rates" ? "OFFICIAL_PUBLIC_HTML_BROWSER"
      : "PUBLIC_WEB_ARGUS_READ_ONLY")
    || adapter?.metadata.adapterKey !== record.adapterKey) {
    throw new Error("Argus market source registry and deployed adapter do not match");
  }
  return prisma.$transaction(async (transaction) => {
    const schedules = await transaction.scheduleDefinition.findMany();
    if (schedules.some((schedule) => !isFirstPublicSchedule(schedule) && !isProductionPublicPilotSchedule(schedule))) {
      throw new Error("Unexpected production schedule exists");
    }
    const sources = await transaction.dataSource.findMany({ select: { key: true } });
    if (sources.some((source) => !knownKeys.has(source.key)) || sources.some((source) => source.key === sourceKey)) {
      throw new Error("Unexpected or duplicate production source exists");
    }
    if (await transaction.job.count({ where: { status: { in: ["PENDING", "RUNNING"] } } })) {
      throw new Error("Argus market pilot requires an idle Tymra queue");
    }
    const source = await transaction.dataSource.create({
      data: {
        key: record.key, name: record.name, providerType: record.providerType, sourceType: record.sourceType,
        lifecycle: "RESEARCH", supportedDomains: [...record.supportedDomains], adapterKey: record.adapterKey,
        environments: ["PRODUCTION"], accessMethod: record.accessMethod,
        retentionPolicy: { rawHours: 72, parserFailureHours: 168 },
        concurrencyLimit: 1, dailyBudget: record.dailyBudget,
        operationalStatus: "DEGRADED", healthSummary: { mode: "argus-market-production-trial", verified: false },
        metadata: { boundedProductionCanary: true, browserPilot: true, pilotAcceptanceStartedAt: new Date().toISOString() },
        status: "UNKNOWN", healthStatus: "DEGRADED", enabled: true,
        acquisitionMethod: record.accessMethod, retentionDays: 365, owner: "Tymra production", isDemo: false,
        capabilities: { create: ["COLLECT_PUBLIC_SIGNALS", "HEALTH_CHECK"].map((capability) => ({
          capability: capability as "COLLECT_PUBLIC_SIGNALS" | "HEALTH_CHECK", version: 1, contractVersion: "source-capability-v1",
        })) },
      } satisfies Prisma.DataSourceCreateInput,
      select: { id: true, key: true, enabled: true, operationalStatus: true },
    });
    return { source, scheduleEnabled: false, mutationPerformed: true };
  });
}

export async function rearmSuspendedProductionArgusMarketPilot(sourceKey: string, nodeEnv: string, argusReady: boolean) {
  if (nodeEnv !== "production" || !argusReady || !browserKeys.has(sourceKey)) throw new Error("Argus market retest requires one approved public source and a ready production Argus");
  const record = registrySourceSeedRecords().find((candidate) => candidate.key === sourceKey);
  const adapter = publicDataAdapters[sourceKey];
  return prisma.$transaction(async (transaction) => {
    const source = await transaction.dataSource.findUnique({ where: { key: sourceKey } });
    const metadata = source?.metadata;
    const legacyCouncilPilot = isLegacyCouncilDirectPilot(sourceKey, metadata);
    const legacySkiPilot = isLegacySkiDirectPilot(sourceKey, source, metadata);
    const legacyChristchurchCouncilPilot = isLegacyChristchurchCouncilDirectPilot(sourceKey, source);
    const legacyDirectPilot = legacyCouncilPilot || legacySkiPilot || legacyChristchurchCouncilPilot;
    if (!record || !adapter || !source || source.providerType !== "PUBLIC" || source.isDemo
      || (!legacySkiPilot && !legacyChristchurchCouncilPilot && source.adapterKey !== record.adapterKey)
      || adapter.metadata.adapterKey !== record.adapterKey
      || (!legacySkiPilot && !legacyChristchurchCouncilPilot && source.accessMethod !== record.accessMethod)
      || source.enabled || source.lifecycle !== "SUSPENDED"
      || source.operationalStatus === "BLOCKED" || !source.environments.includes("PRODUCTION")
      || typeof metadata !== "object" || metadata === null || Array.isArray(metadata)
      || (metadata.browserPilot !== true && !legacyDirectPilot) || metadata.boundedProductionCanary !== true) {
      throw new Error("Suspended Argus market source does not match the approved registry and pilot state");
    }
    if (legacyChristchurchCouncilPilot && (await transaction.collectionRun.count({ where: { dataSourceId: source.id, status: "SUCCEEDED" } })
      || await transaction.sourceEvent.count({ where: { dataSourceId: source.id } })
      || await transaction.sourceMarketSignal.count({ where: { dataSourceId: source.id } }))) {
      throw new Error("Legacy Christchurch Council source has accepted business history; browser conversion requires review");
    }
    if ((legacyCouncilPilot || legacySkiPilot) && await transaction.collectionRun.count({ where: { dataSourceId: source.id } })) {
      throw new Error("Legacy direct source already has a collection run; browser conversion requires review");
    }
    const schedules = await transaction.scheduleDefinition.findMany();
    if (schedules.some((schedule) => !isFirstPublicSchedule(schedule) && !isProductionPublicPilotSchedule(schedule))
      || schedules.some((schedule) => schedule.key === `pilot-public-${sourceKey}-weekly`)) throw new Error("Argus market retest found an unexpected or existing source schedule");
    if (await transaction.job.count({ where: { status: { in: ["PENDING", "RUNNING"] } } })) throw new Error("Argus market retest requires an idle Tymra queue");
    const acceptanceMetadata = { ...metadata, boundedProductionCanary: true, browserPilot: true, pilotAcceptanceStartedAt: new Date().toISOString() };
    const updated = await transaction.dataSource.update({ where: { id: source.id }, data: {
      enabled: true, lifecycle: "RESEARCH", operationalStatus: "DEGRADED", healthStatus: "DEGRADED", lastReviewedAt: new Date(),
      metadata: acceptanceMetadata,
      ...(legacyDirectPilot ? {
        ...(legacySkiPilot || legacyChristchurchCouncilPilot ? {
          adapterKey: record.adapterKey,
          accessMethod: record.accessMethod,
          acquisitionMethod: record.accessMethod,
          supportedDomains: [...record.supportedDomains],
          dailyBudget: adapter.metadata.dailyBudget,
        } : {}),
      } : {}),
    }, select: { id: true, key: true, enabled: true, operationalStatus: true } });
    return { source: updated, scheduleEnabled: false, mutationPerformed: true };
  });
}

export function isLegacyCouncilDirectPilot(sourceKey: string, metadata: unknown) {
  return sourceKey === "council_calendars" && typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    && Object.keys(metadata).length === 1 && (metadata as Record<string, unknown>).boundedProductionCanary === true;
}

export function isLegacyChristchurchCouncilDirectPilot(
  sourceKey: string,
  source: { adapterKey: string | null; accessMethod: string | null; supportedDomains: unknown } | null,
) {
  return sourceKey === "christchurch_council_events"
    && source?.adapterKey === "public:christchurch_council_events:official-html-pagination-v1"
    && source.accessMethod === "OFFICIAL_PUBLIC_HTML_PAGINATED"
    && JSON.stringify(source.supportedDomains) === JSON.stringify(["www.ccc.govt.nz"]);
}

export function isLegacySkiDirectPilot(
  sourceKey: string,
  source: { adapterKey: string | null; accessMethod: string | null } | null,
  metadata: unknown,
) {
  return sourceKey === "ski_seasons_nz" && source?.adapterKey === "public:nz-ski-seasons:official-html-v1"
    && source.accessMethod === "OFFICIAL_PUBLIC_HTML"
    && typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    && Object.keys(metadata).length === 1
    && (metadata as Record<string, unknown>).boundedProductionCanary === true;
}

export function nextArgusMarketPilotPass(runsNewestFirst: readonly {
  status: string;
  successCount: number;
  scope: unknown;
  zeroBusinessVerified?: boolean;
  job: { status: string; attemptCount: number; maxAttempts: number } | null;
}[]) {
  let passed = 0;
  for (const run of runsNewestFirst) {
    const scope = run.scope;
    if (run.status !== "SUCCEEDED" || (run.successCount < 1 && !run.zeroBusinessVerified) || !run.job
      || run.job.status !== "SUCCEEDED" || run.job.attemptCount !== 1 || run.job.maxAttempts !== 1
      || typeof scope !== "object" || scope === null || Array.isArray(scope)
      || (scope as Record<string, unknown>).productionCanary !== true) break;
    passed += 1;
  }
  if (passed >= 2) throw new Error("Argus market pilot already has two eligible recent passes");
  return passed + 1;
}

export async function enableProductionArgusMarketPilot(sourceKey: string, environment: Environment) {
  if (environment.NODE_ENV !== "production" || !browserKeys.has(sourceKey)) throw new Error("Argus market pilot requires one approved production source");
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
  const acceptanceStart = argusPilotAcceptanceStart(source.metadata);
  if (!acceptanceStart) throw new Error("Argus market pilot has no fresh acceptance window");
  const runs = await prisma.collectionRun.findMany({ where: { dataSourceId: source.id, isDemo: false, createdAt: { gte: acceptanceStart } }, orderBy: { finishedAt: "desc" }, take: 2, select: { id: true, status: true, successCount: true, scope: true } });
  if (runs.length !== 2 || runs.some((run) => run.status !== "SUCCEEDED")) throw new Error("Argus market pilot has not completed two successful passes");
  const runIds = runs.map((run) => run.id);
  const executions = await prisma.argusExecution.findMany({ where: { collectionRunId: { in: runIds } }, select: { argusJobId: true, collectionRunId: true, traceId: true, status: true, result: true } });
  const runsNeedingArgus = sourceKey === "ticketmaster"
    ? runs.filter((run) => {
      const counters = (run.scope as Record<string, unknown>).counters;
      return counters && typeof counters === "object" && !Array.isArray(counters)
        && Number((counters as Record<string, unknown>).detailsFetched) > 0;
    }) : runs;
  if ((sourceKey !== "ticketmaster" && executions.length < 2)
    || runsNeedingArgus.some((run) => !executions.some((execution) => execution.collectionRunId === run.id))
    || executions.some((execution) => execution.status !== "COMPLETED")) throw new Error("Argus market pilot Jobs are incomplete");
  if (sourceKey === "ski_seasons_nz" && runIds.some((id) => executions.filter((execution) => execution.collectionRunId === id).length !== 3)) {
    throw new Error("Each ski pilot pass requires three completed fixed-page Argus Jobs");
  }
  const businessRecords = await prisma.sourceEvent.count({ where: { dataSourceId: source.id } })
    + await prisma.sourceMarketSignal.count({ where: { dataSourceId: source.id } });
  if (runs.some((run) => run.successCount < 1 && (run.successCount !== 0
    || !verifiedSchoolSportCanterburyZeroPass(sourceKey, run.scope,
      executions.find((execution) => execution.collectionRunId === run.id)?.result, businessRecords)))) {
    throw new Error("Argus market pilot has no verified business or source-specific zero result");
  }
  const artifacts = await prisma.rawArtifact.findMany({ where: { collectionRunId: { in: runIds }, deletedAt: null }, select: { collectionRunId: true, storageRef: true, contentHash: true, artifactType: true, payload: true } });
  if (sourceKey === "ticketmaster" && (runIds.some((id) => !artifacts.some((artifact) => artifact.collectionRunId === id && artifact.artifactType === "HTML"))
    || artifacts.some((artifact) => artifact.artifactType === "HTML" && (typeof (artifact.payload as Record<string, unknown> | null)?.html !== "string"
      || createHash("sha256").update(JSON.stringify((artifact.payload as Record<string, unknown>).html)).digest("hex") !== artifact.contentHash)))) {
    throw new Error("Ticketmaster listing evidence is incomplete or has a hash mismatch");
  }
  if (artifacts.some((artifact) => artifact.storageRef.startsWith("argus-evidence:"))
    || runsNeedingArgus.some((run) => !artifacts.some((artifact) => artifact.collectionRunId === run.id && artifact.storageRef.startsWith("tymra-evidence:")))) {
    throw new Error("Argus market pilot evidence has not been fully copied");
  }
  if (sourceKey === "ski_seasons_nz" && executions.some((execution) =>
    !artifacts.some((artifact) => artifact.collectionRunId === execution.collectionRunId
      && artifact.storageRef.startsWith(`tymra-evidence:${execution.traceId}/`)))) {
    throw new Error("Each ski resort capture must retain its own copied evidence");
  }
  let verifiedEvidence = 0;
  for (const artifact of artifacts) {
    if (!artifact.storageRef.startsWith("tymra-evidence:")) continue;
    const relativePath = artifact.storageRef.slice("tymra-evidence:".length);
    if (!isArgusPilotEvidencePath(relativePath)) throw new Error("Argus market pilot evidence path is invalid");
    const bytes = await readFile(path.resolve(environment.ARGUS_EVIDENCE_ROOT, relativePath));
    if (createHash("sha256").update(bytes).digest("hex") !== artifact.contentHash) throw new Error("Argus market pilot evidence hash mismatch");
    verifiedEvidence += 1;
  }
  for (const execution of executions) {
    const result = await getArgusJobResult(environment, execution.argusJobId);
    if (result.ok || result.httpStatus !== 410) throw new Error("Argus market pilot result has not been purged after ACK");
  }
  const enabled = await enableProductionPublicPilot(sourceKey, environment.NODE_ENV);
  return { ...enabled, argusJobsPurged: executions.length, verifiedEvidence, mutationPerformed: true };
}

export function isArgusPilotEvidencePath(relativePath: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\/(?:page\.html|screenshot\.png|downloads\/[A-Za-z0-9][A-Za-z0-9._-]{0,199})$/u.test(relativePath);
}
