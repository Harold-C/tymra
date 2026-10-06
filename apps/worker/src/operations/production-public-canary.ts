import { prisma, type Prisma } from "@tymra/db";
import { publicDataAdapters } from "@tymra/providers/public/registry";

import { registrySourceSeedRecords } from "../../../../packages/db/prisma/seed-sources";
import { ARGUS_MARKET_PILOT_SOURCE_KEYS, isProductionPublicPilotSchedule, PUBLIC_PILOT_SOURCE_KEYS } from "./production-public-pilot";
import { isFirstPublicSchedule } from "./production-public-schedules";

export const APPROVED_PUBLIC_CANARY_SOURCES: string[] = ["public_holidays_nz", "rto_calendars", "mbie", "geonet", "stats_nz", ...PUBLIC_PILOT_SOURCE_KEYS];
const allowedSources = new Set<string>(APPROVED_PUBLIC_CANARY_SOURCES);

export async function bootstrapProductionPublicCanary(sourceKey: string, nodeEnv: string) {
  if (nodeEnv !== "production") throw new Error("Public canary bootstrap requires production");
  if (!allowedSources.has(sourceKey)) throw new Error("Source is outside the approved public canary batch");

  const record = registrySourceSeedRecords().find((candidate) => candidate.key === sourceKey);
  const adapter = publicDataAdapters[sourceKey];
  if (!record || record.providerType !== "PUBLIC" || record.isDemo || !adapter || adapter.metadata.adapterKey !== record.adapterKey) {
    throw new Error("Approved source registry and deployed adapter do not match");
  }

  return prisma.$transaction(async (transaction) => {
    const schedules = await transaction.scheduleDefinition.findMany();
    if (schedules.some((schedule) => !isFirstPublicSchedule(schedule) && !isProductionPublicPilotSchedule(schedule))) {
      throw new Error("Public canary bootstrap found an unexpected schedule");
    }
    if (await transaction.dataSource.findUnique({ where: { key: sourceKey }, select: { id: true } })) {
      throw new Error("Source already exists; public canary bootstrap will not overwrite it");
    }
    const otherSources = await transaction.dataSource.findMany({ select: { key: true } });
    if (otherSources.some((source) => source.key !== "christchurch_university_dates"
      && !allowedSources.has(source.key) && !ARGUS_MARKET_PILOT_SOURCE_KEYS.includes(source.key))) {
      throw new Error("Unexpected production source exists; review the registry before bootstrapping");
    }

    const source = await transaction.dataSource.create({
      data: {
        key: record.key,
        name: record.name,
        providerType: record.providerType,
        sourceType: record.sourceType,
        lifecycle: "RESEARCH",
        supportedDomains: [...record.supportedDomains],
        adapterKey: record.adapterKey,
        environments: ["PRODUCTION"],
        accessMethod: record.accessMethod,
        retentionPolicy: { rawHours: 72, parserFailureHours: 168 },
        concurrencyLimit: record.concurrencyLimit,
        dailyBudget: record.dailyBudget,
        operationalStatus: "UNCONFIGURED",
        healthSummary: { mode: "bounded-production-canary", verified: false },
        metadata: { boundedProductionCanary: true },
        status: "UNKNOWN",
        healthStatus: "DOWN",
        enabled: false,
        acquisitionMethod: record.accessMethod,
        retentionDays: 365,
        owner: "Tymra production",
        isDemo: false,
        capabilities: {
          create: ["COLLECT_PUBLIC_SIGNALS", "HEALTH_CHECK"].map((capability) => ({
            capability: capability as "COLLECT_PUBLIC_SIGNALS" | "HEALTH_CHECK",
            version: 1,
            contractVersion: "source-capability-v1",
          })),
        },
      } satisfies Prisma.DataSourceCreateInput,
      select: { id: true, key: true, enabled: true, environments: true, isDemo: true },
    });
    return { source, schedulesEnabled: schedules.filter((schedule) => schedule.enabled).length, mutationPerformed: true };
  });
}

export async function validateSuspendedProductionPublicCanary(sourceKey: string, nodeEnv: string) {
  return prisma.$transaction((transaction) => validateSuspendedProductionPublicCanaryTransaction(transaction, sourceKey, nodeEnv));
}

export async function validateSuspendedProductionPublicCanaryTransaction(transaction: Prisma.TransactionClient, sourceKey: string, nodeEnv: string) {
  if (nodeEnv !== "production" || !PUBLIC_PILOT_SOURCE_KEYS.includes(sourceKey)) throw new Error("Direct public retest requires one approved production source");
  const record = registrySourceSeedRecords().find((candidate) => candidate.key === sourceKey);
  const adapter = publicDataAdapters[sourceKey];
  const source = await transaction.dataSource.findUnique({ where: { key: sourceKey } });
  const metadata = source?.metadata;
  const legacyCruiseContract = sourceKey === "christchurch_cruise" && source?.adapterKey === "public:christchurch_cruise:powerbi-v1"
    && source.accessMethod === "OFFICIAL_PUBLIC_HTML_DISCOVERED_JSON"
    && JSON.stringify(source.supportedDomains) === JSON.stringify(["www.christchurchnz.com", "app.powerbi.com", "wabi-south-east-asia-api.analysis.windows.net"]);
  if (!record || !adapter || !source || source.providerType !== "PUBLIC" || source.isDemo
    || (!legacyCruiseContract && (source.adapterKey !== record.adapterKey || source.accessMethod !== record.accessMethod))
    || adapter.metadata.adapterKey !== record.adapterKey || source.enabled || source.lifecycle !== "SUSPENDED"
    || source.operationalStatus === "BLOCKED"
    || !source.environments.includes("PRODUCTION")
    || typeof metadata !== "object" || metadata === null || Array.isArray(metadata)
    || (metadata as Record<string, unknown>).boundedProductionCanary !== true) {
    throw new Error("Suspended direct public source does not match the approved registry and pilot state");
  }
  if (await transaction.scheduleDefinition.findUnique({ where: { key: `pilot-public-${sourceKey}-weekly` } })) throw new Error("Retest source already has a schedule");
  if (await transaction.job.count({ where: { status: { in: ["PENDING", "RUNNING"] } } })) throw new Error("Direct public retest requires an idle Tymra queue");
  if (legacyCruiseContract) {
    const [successfulRuns, events, signals] = await Promise.all([
      transaction.collectionRun.count({ where: { dataSourceId: source.id, status: "SUCCEEDED" } }),
      transaction.sourceEvent.count({ where: { dataSourceId: source.id } }),
      transaction.sourceMarketSignal.count({ where: { dataSourceId: source.id } }),
    ]);
    if (successfulRuns || events || signals) throw new Error("Legacy cruise source has accepted business history; automatic contract replacement is forbidden");
    const updated = await transaction.dataSource.updateMany({
      where: { id: source.id, enabled: false, lifecycle: "SUSPENDED", adapterKey: "public:christchurch_cruise:powerbi-v1", accessMethod: "OFFICIAL_PUBLIC_HTML_DISCOVERED_JSON" },
      data: { adapterKey: record.adapterKey, accessMethod: record.accessMethod, acquisitionMethod: record.accessMethod,
        supportedDomains: [...record.supportedDomains], dailyBudget: adapter.metadata.dailyBudget },
    });
    if (updated.count !== 1) throw new Error("Legacy cruise source changed during guarded contract replacement");
    return { sourceId: source.id, key: sourceKey, mutationPerformed: true };
  }
  return { sourceId: source.id, key: sourceKey, mutationPerformed: false };
}
