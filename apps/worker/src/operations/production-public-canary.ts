import { prisma, type Prisma } from "@tymra/db";
import { publicDataAdapters } from "@tymra/providers";

import { registrySourceSeedRecords } from "../../../../packages/db/prisma/seed-sources";
import { isProductionPublicPilotSchedule, PUBLIC_PILOT_SOURCE_KEYS } from "./production-public-pilot";
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
    if (otherSources.some((source) => source.key !== "christchurch_university_dates" && !allowedSources.has(source.key))) {
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
