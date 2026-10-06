import { prisma } from "@tymra/db";
import { nzDateKey } from "@tymra/domain";
import { NZ_MAJOR_ACCOMMODATION_MARKETS, assessNzMarketOperationalCoverage, publicSignalSourceIdsForMarket, resolveNzMarketKey } from "@tymra/providers/nz-market-coverage";
import { jsonObject } from "./payload";

export async function refreshMarketCoverage() {
  const measuredAt = new Date();
  const since72h = new Date(measuredAt.getTime() - 72 * 3_600_000);
  const since216h = new Date(measuredAt.getTime() - 216 * 3_600_000);
  const [properties, units, listings, panelMemberships, recentObservations, recentRuns, recentSignals, coverageRows, dataSources] = await Promise.all([
    prisma.property.findMany({ where: { status: "ACTIVE", mergedIntoId: null }, select: { id: true, city: true, region: true, territorialAuthority: true, rto: true } }),
    prisma.sellableUnit.findMany({ where: { status: "ACTIVE", mergedIntoId: null, property: { status: "ACTIVE", mergedIntoId: null } }, select: { id: true, property: { select: { city: true, region: true, territorialAuthority: true, rto: true } } } }),
    prisma.listing.findMany({ where: { listingStatus: "ACTIVE", isDemo: false }, select: { id: true, property: { select: { region: true } }, dataSourceId: true } }),
    prisma.panelMembership.findMany({ where: { active: true }, select: { marketKey: true, membershipType: true, lastSuccessfulAt: true, coverage24h: true, coverage72h: true } }),
    prisma.rateObservation.findMany({ where: { isDemo: false, collectedAt: { gte: since216h } }, select: { collectedAt: true, property: { select: { region: true } } } }),
    prisma.collectionRun.findMany({ where: { createdAt: { gte: since216h } }, select: { status: true, scope: true, createdAt: true, finishedAt: true, dataSource: { select: { key: true } } } }),
    prisma.sourceMarketSignal.findMany({ where: { lastSeenAt: { gte: since216h } }, select: { marketKey: true, dataSource: { select: { key: true } } } }),
    prisma.marketCoverage.findMany({ select: { key: true, region: true } }),
    prisma.dataSource.findMany({ select: { key: true, enabled: true, operationalStatus: true } }),
  ]);
  const coverageByKey = new Map(coverageRows.map((row) => [row.key, row]));
  const operationalReport = assessNzMarketOperationalCoverage(dataSources.map((source) => {
    const sourceRuns = recentRuns.filter((run) => run.dataSource.key === source.key);
    const runs72h = sourceRuns.filter((run) => run.createdAt >= since72h);
    const marketKeys = marketKeysForOperationalEvidence(source.key, recentSignals);
    return {
      sourceId: source.key,
      lastSuccessAt: latestDate(sourceRuns.filter((run) => run.status === "SUCCEEDED").map((run) => run.finishedAt ?? run.createdAt)),
      successfulRuns72h: runs72h.filter((run) => run.status === "SUCCEEDED").length,
      failedRuns72h: runs72h.filter((run) => run.status === "FAILED").length,
      successfulRunDays: new Set(sourceRuns.filter((run) => run.status === "SUCCEEDED").map((run) => nzDateKey(run.createdAt))).size,
      enabled: source.enabled,
      available: sourceAvailableForOperationalCoverage(source),
      ...(marketKeys.length ? { marketKeys } : {}),
    };
  }), measuredAt);
  for (const market of NZ_MAJOR_ACCOMMODATION_MARKETS) {
    const sourceIds = new Set(publicSignalSourceIdsForMarket(market.key));
    const marketRuns = recentRuns.filter((run) => run.createdAt >= since72h && (() => {
      if (!sourceIds.has(run.dataSource.key)) return false;
      const scope = jsonObject(run.scope);
      return scope.marketScope === market.key || scope.marketScope === "new-zealand";
    })());
    const successfulRuns = marketRuns.filter((run) => run.status === "SUCCEEDED").length;
    const lastHealthAt = latestDate(marketRuns.flatMap((run) => run.finishedAt ?? run.createdAt));
    const existing = coverageByKey.get(market.key);
    const operational = operationalReport.markets.find((item) => item.key === market.key)!;
    await prisma.marketCoverage.updateMany({
      where: { key: market.key },
      data: {
        knownPropertyCount: properties.filter((property) => resolveNzMarketKey(property) === market.key).length,
        knownUnitCount: units.filter((unit) => resolveNzMarketKey(unit.property) === market.key).length,
        collectionSuccessRate: marketRuns.length ? successfulRuns / marketRuns.length : 0,
        sourceFailureRate: marketRuns.length ? (marketRuns.length - successfulRuns) / marketRuns.length : 0,
        lastHealthAt,
        region: {
          ...jsonObject(existing?.region),
          publicSignalOperations: {
            windowHours: 72,
            minimumSuccessfulRunDays: 2,
            requiredSourceCount: sourceIds.size,
            runCount: marketRuns.length,
            successfulRunCount: successfulRuns,
            measuredAt: measuredAt.toISOString(),
            stable: operational.stable,
            layers: operational.layers,
            healthySources: operational.healthySources,
            staleOrMissingSources: operational.staleOrMissingSources,
          },
        },
      },
    });
  }
  for (const [regionKey, regionName] of NZ_REGION_COVERAGE) {
    const key = `region-${regionKey}`;
    const propertiesInRegion = properties.filter((property) => canonicalRegionKey(property.region) === regionKey);
    const unitsInRegion = units.filter((unit) => canonicalRegionKey(unit.property.region) === regionKey);
    const listingsInRegion = listings.filter((listing) => canonicalRegionKey(listing.property.region) === regionKey);
    const panel = panelMemberships.filter((member) => member.marketKey === key);
    const observations = recentObservations.filter((observation) => canonicalRegionKey(observation.property.region) === regionKey);
    const newestObservation = latestDate(observations.map((observation) => observation.collectedAt));
    const ageHours = newestObservation ? Math.max(0, (measuredAt.getTime() - newestObservation.getTime()) / 3_600_000) : null;
    const status = !dataSources.some((source) => source.enabled && source.operationalStatus === "HEALTHY")
      ? "SOURCE_UNAVAILABLE"
      : observations.length && panel.length ? "SUPPORTED"
        : propertiesInRegion.length || listingsInRegion.length ? "PARTIAL_COVERAGE"
          : "PILOT";
    const coverageGaps = [
      ...(propertiesInRegion.length ? [] : ["NO_DIRECTORY_IDENTITIES"]),
      ...(panel.length ? [] : ["NO_REPRESENTATIVE_OTA_PANEL"]),
      ...(observations.length ? [] : ["NO_RECENT_OTA_OBSERVATIONS"]),
    ];
    const gapPriorityScore = (status === "SOURCE_UNAVAILABLE" ? 50 : 0)
      + (propertiesInRegion.length ? 0 : 40)
      + (panel.length ? 0 : 30)
      + (observations.length ? 0 : 30);
    await prisma.marketCoverage.upsert({
      where: { key },
      create: { key, name: regionName, status, region: { country: "NZ", level: "REGION", regionName }, acceptNewChecks: true },
      update: {
        status,
        knownPropertyCount: propertiesInRegion.length,
        knownUnitCount: unitsInRegion.length,
        knownListingCount: listingsInRegion.length,
        activePanelCount: panel.length,
        anchorPanelCount: panel.filter((member) => member.membershipType === "ANCHOR").length,
        rotatingPanelCount: panel.filter((member) => member.membershipType === "ROTATING").length,
        coverage24h: panel.length ? panel.reduce((sum, member) => sum + member.coverage24h, 0) / panel.length : 0,
        coverage72h: panel.length ? panel.reduce((sum, member) => sum + member.coverage72h, 0) / panel.length : 0,
        geographicCoverage: propertiesInRegion.length ? Math.min(1, new Set(propertiesInRegion.map((property) => property.territorialAuthority).filter(Boolean)).size / 3) : 0,
        sampleComposition: { accommodationUnits: unitsInRegion.length, otaListings: listingsInRegion.length, sources: new Set(listingsInRegion.map((listing) => listing.dataSourceId)).size },
        freshness: { state: ageHours === null ? "UNKNOWN" : ageHours <= 24 ? "FRESH" : ageHours <= 72 ? "AGING" : "STALE", ageHours, limitHours: 72, policyVersion: "coverage-freshness-v1", calculatedAt: measuredAt.toISOString() },
        coverageGaps,
        gapPriorityScore,
        lastSuccessfulAt: newestObservation,
        lastHealthAt: measuredAt,
        acceptNewChecks: true,
      },
    });
  }
}

export const NZ_REGION_COVERAGE = [
  ["northland", "Northland"], ["auckland", "Auckland"], ["waikato", "Waikato"], ["bay-of-plenty", "Bay of Plenty"],
  ["gisborne", "Gisborne"], ["hawkes-bay", "Hawke's Bay"], ["taranaki", "Taranaki"], ["manawatu-whanganui", "Manawatū-Whanganui"],
  ["wellington", "Wellington"], ["tasman", "Tasman"], ["nelson", "Nelson"], ["marlborough", "Marlborough"],
  ["west-coast", "West Coast"], ["canterbury", "Canterbury"], ["otago", "Otago"], ["southland", "Southland"],
  ["chatham-islands", "Chatham Islands"],
] as const;

export function canonicalRegionKey(value: string | null) {
  const key = (value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return key === "hawke-s-bay" ? "hawkes-bay" : key;
}

export function marketKeysForOperationalEvidence(
  sourceId: string,
  recentSignals: readonly { marketKey: string; dataSource: { key: string } }[],
) {
  return [...new Set(recentSignals
    .filter((signal) => signal.dataSource.key === sourceId)
    .map((signal) => signal.marketKey))];
}

export function sourceAvailableForOperationalCoverage(source: {
  enabled?: boolean;
  operationalStatus: string;
}) {
  return source.enabled === true && !["BLOCKED", "DOWN", "UNCONFIGURED"].includes(source.operationalStatus);
}

export function latestDate(values: Date[]) {
  return values.length ? new Date(Math.max(...values.map((value) => value.getTime()))) : null;
}
