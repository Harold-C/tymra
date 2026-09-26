import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Environment } from "@tymra/config";
import { prisma, type Prisma } from "@tymra/db";
import { publicDataAdapters } from "@tymra/providers";

import { registrySourceSeedRecords } from "../../../../packages/db/prisma/seed-sources";
import { getArgusJobResult } from "../clients/argus-client";
import { ARGUS_MARKET_PILOT_SOURCE_KEYS, enableProductionPublicPilot, isProductionPublicPilotSchedule, PUBLIC_PILOT_SOURCE_KEYS } from "./production-public-pilot";
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
    || record.accessMethod !== (sourceKey === "fx_rates" ? "OFFICIAL_PUBLIC_HTML_BROWSER"
      : sourceKey === "ticketmaster" ? "PUBLIC_HTTP_LISTING_ARGUS_DETAIL" : "PUBLIC_WEB_ARGUS_READ_ONLY")
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
        metadata: { boundedProductionCanary: true, browserPilot: true },
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

export async function enableProductionArgusMarketPilot(sourceKey: string, environment: Environment) {
  if (environment.NODE_ENV !== "production" || !browserKeys.has(sourceKey)) throw new Error("Argus market pilot requires one approved production source");
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
  const runs = await prisma.collectionRun.findMany({ where: { dataSourceId: source.id, status: "SUCCEEDED", isDemo: false }, orderBy: { finishedAt: "desc" }, take: 2, select: { id: true } });
  if (runs.length !== 2) throw new Error("Argus market pilot has not completed two positive passes");
  const runIds = runs.map((run) => run.id);
  const executions = await prisma.argusExecution.findMany({ where: { collectionRunId: { in: runIds } }, select: { argusJobId: true, collectionRunId: true, status: true } });
  if (executions.length < 2 || runIds.some((id) => !executions.some((execution) => execution.collectionRunId === id))
    || executions.some((execution) => execution.status !== "COMPLETED")) throw new Error("Argus market pilot Jobs are incomplete");
  const artifacts = await prisma.rawArtifact.findMany({ where: { collectionRunId: { in: runIds }, deletedAt: null }, select: { collectionRunId: true, storageRef: true, contentHash: true } });
  if (artifacts.some((artifact) => artifact.storageRef.startsWith("argus-evidence:"))
    || runIds.some((id) => !artifacts.some((artifact) => artifact.collectionRunId === id && artifact.storageRef.startsWith("tymra-evidence:")))) {
    throw new Error("Argus market pilot evidence has not been fully copied");
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
