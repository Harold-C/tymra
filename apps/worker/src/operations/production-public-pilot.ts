import { createHash } from "node:crypto";

import { prisma, type Prisma } from "@tymra/db";
import { nzDateKey, nzStartOfDay } from "@tymra/domain";
import { ARGUS_PUBLIC_MARKET_SOURCES, argusPublicMarketSource } from "@tymra/providers/argus-public-market-adapters";
import { SKI_SEASON_SOURCES } from "@tymra/providers/ski-season-adapter";
import { nzCoverageKeysForAreaText } from "@tymra/providers/nz-market-coverage";
import { parseMetServiceCapAlert, parseMetServiceCapFeed } from "@tymra/providers/public/metservice-cap";
import { publicDataAdapters } from "@tymra/providers/public/registry";

import { registrySourceSeedRecords } from "../../../../packages/db/prisma/seed-sources";
import { normaliseSportySchoolSportEvents, sportySchoolSportExtractionSchema } from "../collection/school-sport-ticketek";
import { publicSkiSeasonExtractionSchema } from "../collection/ski-season-argus";
import { FIRST_PUBLIC_SCHEDULES } from "./production-public-schedules";
import { nextCollectionOutsideOfficeHours } from "./collection-office-hours";

const firstSourceKeys = new Set<string>(FIRST_PUBLIC_SCHEDULES.map((schedule) => schedule.sourceId));

// Browser and bespoke collectors need their own bounds and release gates.
export const ARGUS_MARKET_PILOT_SOURCE_KEYS: string[] = [
  ...ARGUS_PUBLIC_MARKET_SOURCES.map((source) => source.sourceId),
  "school_sport_nz", "school_sport_canterbury", "ticketek_events", "dunedinnz_events",
  "auckland_airport_monthly", "mot_airline_performance", "fx_rates", "eventfinda", "ticketmaster", "council_calendars", "christchurch_council_events",
  "ski_seasons_nz",
];
const browserPilotKeys = new Set(ARGUS_MARKET_PILOT_SOURCE_KEYS);
export const PUBLIC_PILOT_SOURCE_KEYS: string[] = registrySourceSeedRecords()
  .filter((source) => source.providerType === "PUBLIC"
    && !firstSourceKeys.has(source.key)
    && !browserPilotKeys.has(source.key)
    && !/ARGUS|BROWSER/.test(source.accessMethod)
    && publicDataAdapters[source.key]?.metadata.adapterKey === source.adapterKey)
  .map((source) => source.key);
const pilotKeys = new Set([...PUBLIC_PILOT_SOURCE_KEYS, ...ARGUS_MARKET_PILOT_SOURCE_KEYS]);
const extendedWindowSourceKeys = new Set(["ara_academic_dates", "canterbury_major_annual_events", "christchurch_council_events", "christchurch_cruise", "christchurch_sports", "taranakienz_events"]);

export function publicPilotWindowDays(sourceId: string) {
  if (sourceId === "christchurch_airport_monthly") return 366;
  return extendedWindowSourceKeys.has(sourceId) ? 90 : 31;
}

export function publicPilotRange(sourceId: string, now: Date) {
  const day = nzStartOfDay(now);
  if (sourceId === "christchurch_airport_monthly") {
    return { from: new Date(day.getTime() - 365 * 86_400_000), to: new Date(day.getTime() + 86_400_000) };
  }
  return { from: day, to: new Date(day.getTime() + publicPilotWindowDays(sourceId) * 86_400_000) };
}

export function publicPilotRequestLimit(sourceId: string) {
  if (sourceId === "queenstown_airport_monthly") return 6;
  if (["queenstownnz_events", "southlandnz_events", "wellington_airport_monthly"].includes(sourceId)) return 2;
  if (sourceId === "ski_seasons_nz") return 3;
  if (["rto_calendars", "christchurch_sports", "christchurch_council_events", "council_calendars", "canterbury_major_annual_events"].includes(sourceId)) return 3;
  if (["christchurch_cruise", "metservice", "venues_otautahi_events"].includes(sourceId) || argusPublicMarketSource(sourceId)?.kind === "venue") return 2;
  return 1;
}

export function zeroBusinessPublicPilotPassAccepted(sourceId: string, artifacts: readonly {
  contentHash: string;
  payload: unknown;
}[], scope: unknown, existingBusinessRecords: number) {
  if (!["linz", "metservice"].includes(sourceId) || !artifacts.length) return false;
  const validArtifacts = artifacts.filter((artifact) => artifact.contentHash === createHash("sha256").update(JSON.stringify(canonicalPilotJson(artifact.payload))).digest("hex"));
  if (validArtifacts.length !== artifacts.length) return false;
  if (sourceId === "linz") return existingBusinessRecords === 0 && validArtifacts.every((artifact) => {
    const payload = artifact.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    const record = payload as Record<string, unknown>;
    const place = record.place;
    const placeId = typeof place === "object" && place !== null && !Array.isArray(place)
      ? (place as Record<string, unknown>).id ?? (place as Record<string, unknown>).feat_id : null;
    return record.provider === "LINZ New Zealand Gazetteer" && typeof record.query === "string" && record.query.length > 0
      && typeof place === "object" && place !== null && !Array.isArray(place)
      && ((typeof placeId === "string" && placeId.length > 0) || (typeof placeId === "number" && Number.isFinite(placeId)));
  });
  if (validArtifacts.length < 1 || validArtifacts.length > 2) return false;
  const feed = validArtifacts.find((artifact) => {
    const payload = artifact.payload;
    return payload && typeof payload === "object" && !Array.isArray(payload) && (payload as Record<string, unknown>).kind === "cap_feed";
  })?.payload as Record<string, unknown> | undefined;
  if (!feed || feed.sourceUrl !== "https://alerts.metservice.com/cap/rss" || typeof feed.rawXml !== "string") return false;
  const items = feed.feed && typeof feed.feed === "object" && !Array.isArray(feed.feed)
    ? (feed.feed as Record<string, unknown>).items : null;
  if (!Array.isArray(items)) return false;
  try {
    const parsed = parseMetServiceCapFeed(feed.rawXml);
    if (parsed.items.length !== items.length) return false;
  } catch { return false; }
  if (items.length === 0 && validArtifacts.length === 1) return true;
  const counters = scope && typeof scope === "object" && !Array.isArray(scope) ? (scope as Record<string, unknown>).counters : null;
  if (existingBusinessRecords < 1 || !isPilotRecord(counters)) return false;
  if (validArtifacts.length === 1) return counters.requestsAvoided === items.length;
  const detail = validArtifacts.find((artifact) => isPilotRecord(artifact.payload) && artifact.payload.kind === "cap_alert")?.payload;
  if (!isPilotRecord(detail) || typeof detail.rawXml !== "string" || typeof detail.sourceUrl !== "string") return false;
  try {
    const parsedFeed = parseMetServiceCapFeed(feed.rawXml);
    const alert = parseMetServiceCapAlert(detail.rawXml);
    const region = alert.infos[0]?.areas.map((area) => area.areaDesc).join("; ");
    return parsedFeed.items.length === items.length
      && pilotPayloadMatchesParsed(parsedFeed, feed.feed)
      && pilotPayloadMatchesParsed(alert, detail.alert)
      && parsedFeed.items.some((item) => item.link === detail.sourceUrl
        && pilotPayloadMatchesParsed(item, detail.feedItem))
      && typeof region === "string" && region.length > 0 && nzCoverageKeysForAreaText(region).length === 0
      && counters.requests === 2 && typeof counters.requestsAvoided === "number" && counters.requestsAvoided >= 1;
  } catch { return false; }
}

export function verifiedMetServiceIncrementalPasses(
  runs: readonly { id: string; successCount: number; scope: unknown }[],
  artifacts: readonly { collectionRunId: string; contentHash: string; payload: unknown }[],
  signals: readonly { lastCollectionRunId: string; externalId: string }[],
) {
  if (runs.length !== 2 || runs.some((run) => run.successCount < 1)) return false;
  const identifiers: string[] = [];
  for (const run of runs) {
    const records = artifacts.filter((artifact) => artifact.collectionRunId === run.id);
    if (records.length !== 2 || records.some((artifact) => artifact.contentHash
      !== createHash("sha256").update(JSON.stringify(canonicalPilotJson(artifact.payload))).digest("hex"))) return false;
    const feed = records.find((artifact) => isPilotRecord(artifact.payload) && artifact.payload.kind === "cap_feed")?.payload;
    const detail = records.find((artifact) => isPilotRecord(artifact.payload) && artifact.payload.kind === "cap_alert")?.payload;
    if (!isPilotRecord(feed) || !isPilotRecord(detail)
      || feed.sourceUrl !== "https://alerts.metservice.com/cap/rss"
      || typeof feed.rawXml !== "string" || typeof detail.rawXml !== "string"
      || typeof detail.sourceUrl !== "string") return false;
    try {
      const parsedFeed = parseMetServiceCapFeed(feed.rawXml);
      const parsedAlert = parseMetServiceCapAlert(detail.rawXml);
      if (!pilotPayloadMatchesParsed(parsedFeed, feed.feed)
        || !pilotPayloadMatchesParsed(parsedAlert, detail.alert)
        || !parsedFeed.items.some((item) => item.link === detail.sourceUrl
          && pilotPayloadMatchesParsed(item, detail.feedItem))) return false;
      const runSignals = signals.filter((signal) => signal.lastCollectionRunId === run.id);
      if (runSignals.length !== run.successCount || runSignals.some((signal) => signal.externalId !== `cap-alert:${parsedAlert.identifier}`
        && !signal.externalId.startsWith(`cap-alert:${parsedAlert.identifier}:market:`))) return false;
      identifiers.push(parsedAlert.identifier);
    } catch { return false; }
  }
  const latest = runs[0]!;
  const counters = isPilotRecord(latest.scope) ? latest.scope.counters : null;
  return new Set(identifiers).size === 2 && isPilotRecord(counters)
    && typeof counters.requestsAvoided === "number" && counters.requestsAvoided >= 1
    && typeof counters.requests === "number" && counters.requests <= 2;
}

function isPilotRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pilotPayloadMatchesParsed(parsed: unknown, stored: unknown): boolean {
  if (parsed === null) return stored === null || (isPilotRecord(stored) && Object.keys(stored).length === 0);
  if (Array.isArray(parsed)) return Array.isArray(stored) && parsed.length === stored.length
    && parsed.every((value, index) => pilotPayloadMatchesParsed(value, stored[index]));
  if (isPilotRecord(parsed)) return isPilotRecord(stored) && Object.keys(parsed).length === Object.keys(stored).length
    && Object.entries(parsed).every(([key, value]) => Object.hasOwn(stored, key) && pilotPayloadMatchesParsed(value, stored[key]));
  return parsed === stored;
}

export function verifiedSchoolSportCanterburyZeroPass(sourceId: string, scope: unknown, argusResult: unknown, existingBusinessRecords: number) {
  if (sourceId !== "school_sport_canterbury" || existingBusinessRecords !== 0
    || !scope || typeof scope !== "object" || Array.isArray(scope)
    || !argusResult || typeof argusResult !== "object" || Array.isArray(argusResult)) return false;
  const effective = (scope as Record<string, unknown>).effective;
  if (!effective || typeof effective !== "object" || Array.isArray(effective)) return false;
  const { from, to } = effective as Record<string, unknown>;
  if (typeof from !== "string" || typeof to !== "string") return false;
  const range = { from: new Date(from), to: new Date(to) };
  if (!Number.isFinite(range.from.getTime()) || !Number.isFinite(range.to.getTime()) || range.to <= range.from) return false;
  const envelope = argusResult as Record<string, unknown>;
  if (envelope.status !== "COMPLETED" || !Array.isArray(envelope.items) || envelope.items.length !== 1) return false;
  const item = envelope.items[0];
  if (!item || typeof item !== "object" || Array.isArray(item) || item.status !== "COMPLETED") return false;
  const result = item.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const delivery = result as Record<string, unknown>;
  if (delivery.ok !== true || delivery.status !== "success"
    || delivery.connector_id !== "sporty-school-sport-public" || delivery.workflow_id !== "collect_events") return false;
  const parsed = sportySchoolSportExtractionSchema.safeParse(delivery.data);
  if (!parsed.success) return false;
  const extraction = parsed.data;
  const fromDay = nzDateKey(range.from);
  const toDay = nzDateKey(range.to);
  if (extraction.sourceOrganisation !== "School Sport Canterbury" || extraction.totalOccurrences < 1
    || !extraction.window || extraction.window.startsOn !== fromDay || extraction.window.endsOn !== toDay
    || !extraction.canonicalUrl.startsWith("https://www.sporty.co.nz/sscanterbury/")
    || extraction.occurrences.some((occurrence) => occurrence.startsAt === null
      || occurrence.startsAt < fromDay || occurrence.startsAt > toDay
      || occurrence.venue || occurrence.address || occurrence.locality || occurrence.region
      || occurrence.canterburyHosted !== null)) return false;
  return normaliseSportySchoolSportEvents(extraction, "school_sport_canterbury", range, 2).length === 0;
}

function canonicalPilotJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalPilotJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalPilotJson(item)]));
  return value;
}

export function verifiedThreeResortSkiRun(
  scope: unknown,
  artifacts: readonly { contentHash: string; payload: unknown }[],
) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return false;
  const counters = (scope as Record<string, unknown>).counters;
  if (!counters || typeof counters !== "object" || Array.isArray(counters)) return false;
  const values = counters as Record<string, unknown>;
  if (values.discovered !== 3 || values.references !== 3 || values.visitedReferences !== 3
    || values.requests !== 3 || values.records !== 3 || values.signals !== 3
    || values.persisted !== 3 || values.duplicatesSkipped !== 0 || artifacts.length !== 3) return false;
  const records = artifacts.map((artifact) => {
    if (artifact.contentHash !== createHash("sha256").update(JSON.stringify(canonicalPilotJson(artifact.payload))).digest("hex")) return null;
    if (!artifact.payload || typeof artifact.payload !== "object" || Array.isArray(artifact.payload)) return null;
    const payload = artifact.payload as Record<string, unknown>;
    const parsed = publicSkiSeasonExtractionSchema.safeParse(payload.connectorData);
    const source = parsed.success ? SKI_SEASON_SOURCES.find((item) => item.resortId === parsed.data.resortId) : null;
    if (!parsed.success || payload.sourceUrl !== parsed.data.sourceUrl
      || payload.resort !== parsed.data.resortName
      || !source || payload.marketKey !== source.marketKey || payload.region !== source.region
      || payload.opensAt !== nzStartOfDay(parsed.data.opensOn).toISOString()
      || payload.closesAt !== nzStartOfDay(parsed.data.closesOn).toISOString()) return null;
    return parsed.data;
  });
  if (records.some((record) => record === null)) return false;
  const valid = records.filter((record): record is NonNullable<typeof record> => record !== null);
  return new Set(valid.map((record) => record.resortId)).size === SKI_SEASON_SOURCES.length
    && new Set(valid.map((record) => record.seasonYear)).size === 1
    && SKI_SEASON_SOURCES.every((source) => valid.some((record) => record.resortId === source.resortId && record.sourceUrl === source.url));
}

export function publicPilotSchedulePayload(sourceId: string) {
  if (!pilotKeys.has(sourceId)) throw new Error(`Source is outside the approved public pilot: ${sourceId}`);
  const marketScope = sourceId === "dunedinnz_events" ? "dunedin"
    : sourceId === "christchurch_cruise" ? "christchurch"
    : sourceId === "school_sport_nz" || sourceId === "school_sport_canterbury" ? "christchurch"
      : "new-zealand";
  return { sourceId, marketScope, limit: sourceId === "christchurch_cruise" ? 100 : sourceId === "ski_seasons_nz" ? 3 : 2, productionCanary: true };
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

export function argusPilotAcceptanceStart(metadata: unknown): Date | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).pilotAcceptanceStartedAt;
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : date;
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
  const acceptanceStart = browserPilotKeys.has(sourceId) ? argusPilotAcceptanceStart(metadata) : null;
  if (browserPilotKeys.has(sourceId) && !acceptanceStart) throw new Error("Argus pilot has no fresh acceptance window");
  const runs = await transaction.collectionRun.findMany({
    where: { dataSourceId: source.id, isDemo: false, ...(acceptanceStart ? { createdAt: { gte: acceptanceStart } } : {}) },
    orderBy: { finishedAt: "desc" }, take: 2,
    select: { id: true, jobId: true, status: true, successCount: true, scope: true },
  });
  if (runs.length !== 2 || runs.some((run) => {
    const scope = run.scope;
    return run.status !== "SUCCEEDED" || typeof scope !== "object" || scope === null || Array.isArray(scope)
      || (scope as Record<string, unknown>).productionCanary !== true
      || (scope as Record<string, unknown>).configurationUnchanged !== true
      || (scope as Record<string, unknown>).schedulesUnchanged !== true;
  })) throw new Error("Two successful bounded production passes are required");
  if (sourceId === "metservice" && runs.every((run) => run.successCount > 0)) {
    const runIds = runs.map((run) => run.id);
    const signals = await transaction.sourceMarketSignal.findMany({
      where: { dataSourceId: source.id, lastCollectionRunId: { in: runIds } },
      select: { lastCollectionRunId: true, externalId: true },
    });
    if (runs.every((run) => signals.some((signal) => signal.lastCollectionRunId === run.id))) {
      const artifacts = await transaction.rawArtifact.findMany({
        where: { collectionRunId: { in: runIds }, artifactType: "NETWORK_RESPONSE", deletedAt: null, parserFailure: false },
        select: { collectionRunId: true, contentHash: true, payload: true },
      });
      if (!verifiedMetServiceIncrementalPasses(runs, artifacts, signals)) {
        throw new Error("MetService incremental pilot evidence does not reconcile to distinct CAP alerts");
      }
    }
  }
  if (sourceId === "canterbury_major_annual_events" && runs.some((run) => {
    const counters = (run.scope as Record<string, unknown>).counters;
    if (!counters || typeof counters !== "object" || Array.isArray(counters)) return true;
    const values = counters as Record<string, unknown>;
    return values.discovered !== 2 || values.references !== 2 || values.visitedReferences !== 2
      || typeof values.requests !== "number" || !Number.isInteger(values.requests)
      || values.requests < 2 || values.requests > publicPilotRequestLimit(sourceId);
  })) throw new Error("Canterbury annual-event pilot did not visit both official event pages within budget");
  if (sourceId === "ski_seasons_nz") {
    const currentYear = await transaction.sourceMarketSignal.findMany({
      where: { dataSourceId: source.id }, select: { externalId: true },
    });
    const seasonIds = new Set(currentYear.map((signal) => signal.externalId));
    if (seasonIds.size !== 3 || !SKI_SEASON_SOURCES.every((resort) => [...seasonIds].some((id) => id.startsWith(`ski-season:${resort.resortId}:`)))) {
      throw new Error("Ski pilot has not persisted all three official resorts");
    }
    for (const run of runs) {
      const artifacts = await transaction.rawArtifact.findMany({
        where: { collectionRunId: run.id, artifactType: "NETWORK_RESPONSE", deletedAt: null, parserFailure: false },
        select: { payload: true, contentHash: true },
      });
      if (!verifiedThreeResortSkiRun(run.scope, artifacts)) {
        throw new Error("Each ski pilot pass must retain all three official seasons within budget");
      }
    }
  }
  const businessRecords = await transaction.sourceEvent.count({ where: { dataSourceId: source.id } })
    + await transaction.sourceMarketSignal.count({ where: { dataSourceId: source.id } });
  if (sourceId === "christchurch_cruise") {
    const [lyttelton, akaroa] = await Promise.all(["lyttelton", "akaroa"].map((port) => transaction.sourceEvent.count({
      where: { dataSourceId: source.id, externalId: { startsWith: `cruise:${port}:` } },
    })));
    if (!lyttelton || !akaroa) throw new Error("Cruise pilot has not persisted both Lyttelton and Akaroa calls");
    for (const run of runs) {
      const artifacts = await transaction.rawArtifact.findMany({
        where: { collectionRunId: run.id, artifactType: "NETWORK_RESPONSE", deletedAt: null, parserFailure: false },
        select: { payload: true, contentHash: true },
      });
      const ports = new Set(artifacts.flatMap((artifact) => {
        if (artifact.contentHash !== createHash("sha256").update(JSON.stringify(canonicalPilotJson(artifact.payload))).digest("hex")) return [];
        const payload = artifact.payload;
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
        const value = (payload as Record<string, unknown>).value;
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const event = value as Record<string, unknown>;
        const metadata = event.metadata;
        if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)
          || (metadata as Record<string, unknown>).scheduleSource !== "New Zealand Cruise Association") return [];
        return event.city === "Lyttelton" && (metadata as Record<string, unknown>).sourcePortLabel === "Christchurch" ? ["Lyttelton"]
          : event.city === "Akaroa" && (metadata as Record<string, unknown>).sourcePortLabel === "Akaroa" ? ["Akaroa"] : [];
      }));
      if (!ports.has("Lyttelton") || !ports.has("Akaroa")) throw new Error("Each cruise pilot pass must retain verified calls from both ports");
    }
  }
  let verifiedSchoolZeroPasses = 0;
  for (const run of runs) {
    if (run.successCount > 0 && businessRecords > 0) continue;
    if (run.successCount === 0 && run.jobId && sourceId === "school_sport_canterbury") {
      const execution = await transaction.argusExecution.findFirst({
        where: { parentJobId: run.jobId, collectionRunId: run.id, dataSourceId: source.id, status: "COMPLETED" },
        select: { result: true },
      });
      if (verifiedSchoolSportCanterburyZeroPass(sourceId, run.scope, execution?.result, businessRecords)) {
        verifiedSchoolZeroPasses += 1;
        continue;
      }
    }
    const artifacts = await transaction.rawArtifact.findMany({
      where: { collectionRunId: run.id, artifactType: "NETWORK_RESPONSE", deletedAt: null, parserFailure: false },
      select: { contentHash: true, payload: true },
    });
    if (run.successCount !== 0 || !zeroBusinessPublicPilotPassAccepted(sourceId, artifacts, run.scope, businessRecords)) {
      throw new Error("Pilot pass has no verified business or source-specific reference result");
    }
  }
  if (await transaction.rawArtifact.count({ where: { collectionRunId: { in: runs.map((run) => run.id) }, parserFailure: true } })) {
    throw new Error("Pilot passes contain parser failures");
  }
  if (browserPilotKeys.has(sourceId)) {
    if (businessRecords === 0 && !(sourceId === "school_sport_canterbury" && verifiedSchoolZeroPasses === 2)) {
      throw new Error("Argus pilot has no persisted business record");
    }
    const jobIds = runs.map((run) => run.jobId).filter((id): id is string => Boolean(id));
    if (jobIds.length !== 2 || (metadata as Record<string, unknown>).browserPilot !== true) throw new Error("Argus pilot requires two queued passes");
    const jobs = await transaction.job.findMany({ where: { id: { in: jobIds } }, select: { status: true, attemptCount: true, maxAttempts: true } });
    if (jobs.length !== 2 || jobs.some((job) => job.status !== "SUCCEEDED" || job.attemptCount !== 1 || job.maxAttempts !== 1)) {
      throw new Error("Argus pilot Jobs did not finish safely in one attempt");
    }
    const executions = await transaction.argusExecution.findMany({ where: { parentJobId: { in: jobIds } }, select: { parentJobId: true, status: true, result: true } });
    if (executions.length < 2
      || jobIds.some((id) => !executions.some((execution) => execution.parentJobId === id))
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
    enabled: true, nextRunAt: nextCollectionOutsideOfficeHours(new Date(Date.now() + 7 * 86_400_000)),
  } });
  return { sourceId, schedule: { key: schedule.key, enabled: schedule.enabled, nextRunAt: schedule.nextRunAt }, acceptedRuns: runs.map((run) => run.id), mutationPerformed: true };
}
