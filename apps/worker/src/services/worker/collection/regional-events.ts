import { createHash } from "node:crypto";
import { prisma } from "@tymra/db";
import { nzDateKey } from "@tymra/domain";
import { AdapterError, type PublicEvent } from "@tymra/providers/types";
import { withRedisLock } from "@tymra/queue";
import { isRbnzFxExtraction, normaliseRbnzFxSignals } from "../../../collection/rbnz-fx";
import { DUNEDINNZ_EVENTS_SOURCE_ID, normaliseSportySchoolSportEvents, normaliseTicketekEvents, SCHOOL_SPORT_CANTERBURY_SOURCE_ID, SCHOOL_SPORT_NZ_SOURCE_ID, sportySchoolSportExtractionSchema, sportySourceDefinition, TICKETEK_LISTING_URL, TICKETEK_SOURCE_ID, ticketekDetailExtractionSchema, ticketekListingExtractionSchema, type ArgusEventSourceId } from "../../../collection/school-sport-ticketek";
import { publicPilotSchedulePayload } from "../../../operations/production-public-pilot";
import { isRegionalArgusEventSourceId, normaliseRegionalArgusEvents, regionalArgusEventExtractionSchema, regionalArgusSourceDefinition } from "../../../collection/regional-argus-events";
import { DeferredJobError } from "../../../jobs/deferred-job";
import { settleCancelledCollectionRun } from "../../argus-orchestrator";
import { CollectSourceOptions } from "../contracts";
import { WorkerRequestError } from "../errors";
import { emptyPublicCollectionCounters, sourceConfigurationSnapshot, stableHash, jsonRecord } from "../helpers";
import { sourceScheduleSnapshot } from "./persistence-helpers";
import type { WorkerContext } from "../context";

export async function collectArgusEventSource(this: WorkerContext, sourceId: ArgusEventSourceId, marketScope: string, analysisRequestId?: string, options: CollectSourceOptions = {}) {
  if ((sourceId === SCHOOL_SPORT_NZ_SOURCE_ID || sourceId === SCHOOL_SPORT_CANTERBURY_SOURCE_ID) && marketScope !== "christchurch") {
    throw new WorkerRequestError("INVALID_MARKET_SCOPE", "School Sport demand collection currently promotes explicitly located Canterbury events only", 422);
  }
  if (sourceId === TICKETEK_SOURCE_ID && !["new-zealand", "christchurch"].includes(marketScope)) {
    throw new WorkerRequestError("INVALID_MARKET_SCOPE", "Ticketek collection currently supports New Zealand or Christchurch scope only", 422);
  }
  if (sourceId === DUNEDINNZ_EVENTS_SOURCE_ID && marketScope !== "dunedin") {
    throw new WorkerRequestError("INVALID_MARKET_SCOPE", "DunedinNZ collection requires the dunedin market scope", 422);
  }
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: sourceId } });
  const localAcceptance = options.localAcceptance === true;
  const productionCanary = options.productionCanary === true;
  const metadata = jsonRecord(source.metadata);
  if (productionCanary && (this.environment.NODE_ENV !== "production" || !options.jobId || localAcceptance
    || options.dryRun || options.from || options.to || options.phase || options.maxDetails
    || options.limit !== 2 || marketScope !== publicPilotSchedulePayload(sourceId).marketScope
    || metadata.browserPilot !== true || metadata.boundedProductionCanary !== true)) {
    throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Argus event canary requires the approved queued two-record production pilot", 422);
  }
  if (localAcceptance) this.assertLocalAcceptanceAllowed(source, true);
  else this.assertSourceCollectionAllowed(source, productionCanary);

  const now = new Date();
  const requestedFrom = options.from ?? now;
  const regionalArgusSource = isRegionalArgusEventSourceId(sourceId);
  const requestedTo = options.to ?? new Date(requestedFrom.getTime() + (sourceId === TICKETEK_SOURCE_ID || regionalArgusSource ? 90 : 62) * 86_400_000);
  const maxWindowDays = sourceId === TICKETEK_SOURCE_ID || regionalArgusSource ? 366 : 62;
  const to = new Date(Math.min(requestedTo.getTime(), requestedFrom.getTime() + maxWindowDays * 86_400_000));
  if (to <= requestedFrom) throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Collection range must be positive", 422);
  const maxRecords = localAcceptance
    ? Math.min(options.limit ?? (sourceId === TICKETEK_SOURCE_ID ? 10 : 20), sourceId === TICKETEK_SOURCE_ID ? 10 : 20)
    : Math.min(options.limit ?? (sourceId === TICKETEK_SOURCE_ID ? 20 : 100), sourceId === TICKETEK_SOURCE_ID ? 20 : 100);
  // National rows need regional filtering before the business-record limit applies.
  const maxListingRecords = sourceId === SCHOOL_SPORT_NZ_SOURCE_ID ? 100 : maxRecords;
  const maxDetails = productionCanary ? 0 : sourceId === TICKETEK_SOURCE_ID
    ? Math.min(options.maxDetails ?? (localAcceptance ? 1 : 3), localAcceptance ? 1 : 10)
    : 0;
  const phase = options.phase ?? "full";
  const configurationBefore = sourceConfigurationSnapshot(source);
  const schedulesBefore = await sourceScheduleSnapshot(sourceId);
  const initialScope = {
    sourceId,
    marketScope,
    phase,
    localAcceptance,
    productionCanary,
    dryRun: options.dryRun === true,
    requested: { from: requestedFrom.toISOString(), to: requestedTo.toISOString(), limit: options.limit ?? null },
    effective: { from: requestedFrom.toISOString(), to: to.toISOString(), maxRecords, maxDetails, maxListingRecords },
    configurationBefore,
    schedulesBefore,
  };
  const run = await this.resumeOrCreateBrowserCollectionRun(options.jobId, source.id, analysisRequestId, initialScope, now);
  const counters = emptyPublicCollectionCounters();
  let rateLimited = false;
  try {
    const result = await withRedisLock(`source:${sourceId}`, 60 * 60_000, async () => {
      const events = new Map<string, PublicEvent>();
      if (sourceId === SCHOOL_SPORT_NZ_SOURCE_ID || sourceId === SCHOOL_SPORT_CANTERBURY_SOURCE_ID) {
        const definition = sportySourceDefinition(sourceId);
        const capture = await this.executePriorityArgusEventTask({
          sourceId,
          dataSourceId: source.id,
          collectionRunId: run.id,
          connectorId: "sporty-school-sport-public",
          workflowId: "collect_events",
          url: definition.url,
          startDate: nzDateKey(requestedFrom),
          endDate: nzDateKey(to),
          maxRecords: maxListingRecords,
          dryRun: options.dryRun === true,
          parentJobId: options.jobId,
        });
        counters.requests += 1;
        const parsed = sportySchoolSportExtractionSchema.safeParse(capture.extracted);
        if (!parsed.success || parsed.data.sourceOrganisation !== definition.sourceOrganisation) {
          if (!options.dryRun) await this.markArgusEvidenceParserFailure(run.id, capture.traceId);
          throw new AdapterError("PARSING_ERROR", `Sporty extractor returned an invalid ${definition.sourceOrganisation} payload: ${parsed.success ? "source organisation mismatch" : parsed.error.issues[0]?.message ?? "schema validation failed"}`, false);
        }
        if (!options.dryRun) await this.persistArgusConnectorPayload(source.id, run.id, capture, sourceId, definition.url);
        counters.records = parsed.data.occurrences.length;
        counters.discovered = parsed.data.series.length;
        for (const event of normaliseSportySchoolSportEvents(parsed.data, sourceId, { from: requestedFrom, to }, maxRecords)) events.set(event.externalId, event);
      } else if (isRegionalArgusEventSourceId(sourceId)) {
        const definition = regionalArgusSourceDefinition(sourceId);
        const capture = await this.executePriorityArgusEventTask({
          sourceId,
          dataSourceId: source.id,
          collectionRunId: run.id,
          connectorId: definition.connectorId,
          workflowId: "collect_events",
          url: definition.url,
          startDate: nzDateKey(requestedFrom),
          endDate: nzDateKey(to),
          maxRecords,
          dryRun: options.dryRun === true,
          parentJobId: options.jobId,
        });
        counters.requests += 1;
        const parsed = regionalArgusEventExtractionSchema.safeParse(capture.extracted);
        if (!parsed.success || parsed.data.market !== definition.market) {
          if (!options.dryRun) await this.markArgusEvidenceParserFailure(run.id, capture.traceId);
          throw new AdapterError("PARSING_ERROR", `Regional event extractor returned an invalid ${definition.market} payload: ${parsed.success ? "market mismatch" : parsed.error.issues[0]?.message ?? "schema validation failed"}`, false);
        }
        if (!options.dryRun) await this.persistArgusConnectorPayload(source.id, run.id, capture, sourceId, definition.url);
        counters.records = parsed.data.events.length;
        counters.discovered = parsed.data.totalEvents;
        for (const event of normaliseRegionalArgusEvents(parsed.data, sourceId, { from: requestedFrom, to }, maxRecords)) events.set(event.externalId, event);
      } else {
        let listing: ReturnType<typeof ticketekListingExtractionSchema.parse> | null = null;
        if (phase === "discovery" || phase === "full") {
          const capture = await this.executePriorityArgusEventTask({
            sourceId,
            dataSourceId: source.id,
            collectionRunId: run.id,
            connectorId: "ticketek-public",
            workflowId: "collect_listing",
            url: TICKETEK_LISTING_URL,
            maxRecords,
            dryRun: options.dryRun === true,
            parentJobId: options.jobId,
          });
          counters.requests += 1;
          const parsed = ticketekListingExtractionSchema.safeParse(capture.extracted);
          if (!parsed.success) {
            if (!options.dryRun) await this.markArgusEvidenceParserFailure(run.id, capture.traceId);
            throw new AdapterError("PARSING_ERROR", `Ticketek listing returned an invalid payload: ${parsed.error.issues[0]?.message ?? "schema validation failed"}`, false);
          }
          listing = parsed.data;
          if (!options.dryRun) {
            await this.persistArgusConnectorPayload(source.id, run.id, capture, sourceId, TICKETEK_LISTING_URL);
            for (const series of listing.series) {
              const urlHash = createHash("sha256").update(series.canonicalUrl).digest("hex");
              const seriesOccurrences = listing.occurrences.filter((item) => item.seriesId === series.seriesId);
              const cancelled = series.status === "CANCELLED" || (seriesOccurrences.length > 0 && seriesOccurrences.every((item) => item.status === "CANCELLED"));
              await prisma.sourceCrawlTarget.upsert({
                where: { dataSourceId_urlHash: { dataSourceId: source.id, urlHash } },
                create: { dataSourceId: source.id, url: series.canonicalUrl, urlHash, kind: "EVENT_DETAIL", status: cancelled ? "COMPLETE" : "PENDING", priority: 50, active: !cancelled, lastSeenAt: now, nextFetchAt: cancelled ? null : now, metadata: { seriesId: series.seriesId, listing: series, entryUrl: TICKETEK_LISTING_URL } },
                update: { url: series.canonicalUrl, status: cancelled ? "COMPLETE" : "PENDING", active: !cancelled, lastSeenAt: now, missedDiscoveryCount: 0, nextFetchAt: cancelled ? null : now, metadata: { seriesId: series.seriesId, listing: series, entryUrl: TICKETEK_LISTING_URL } },
              });
            }
          }
          counters.discovered = listing.series.length;
          counters.records += listing.occurrences.length;
          for (const event of normaliseTicketekEvents(listing, { from: requestedFrom, to }, maxRecords)) events.set(event.externalId, event);
        }

        if ((phase === "details" || phase === "full") && maxDetails > 0) {
          const detailTargets = listing
            ? listing.series.filter((series) => series.status !== "CANCELLED" && listing!.occurrences.some((occurrence) => occurrence.seriesId === series.seriesId && occurrence.status !== "CANCELLED")).slice(0, maxDetails).map((series) => series.canonicalUrl)
            : (await prisma.sourceCrawlTarget.findMany({ where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, status: { in: ["PENDING", "FAILED"] } }, orderBy: [{ priority: "asc" }, { lastSeenAt: "desc" }], take: maxDetails, select: { url: true } })).map((target) => target.url);
          for (const detailUrl of detailTargets) {
            try {
              counters.requests += 1;
              const capture = await this.executePriorityArgusEventTask({
                sourceId,
                dataSourceId: source.id,
                collectionRunId: run.id,
                connectorId: "ticketek-public",
                workflowId: "collect_detail",
                url: detailUrl,
                entryUrl: TICKETEK_LISTING_URL,
                dryRun: options.dryRun === true,
                parentJobId: options.jobId,
              });
              const parsed = ticketekDetailExtractionSchema.safeParse(capture.extracted);
              if (!parsed.success) {
                if (!options.dryRun) await this.markArgusEvidenceParserFailure(run.id, capture.traceId);
                throw new AdapterError("PARSING_ERROR", `Ticketek detail returned an invalid payload: ${parsed.error.issues[0]?.message ?? "schema validation failed"}`, false);
              }
              if (!options.dryRun) {
                await this.persistArgusConnectorPayload(source.id, run.id, capture, sourceId, detailUrl);
                await prisma.sourceCrawlTarget.updateMany({ where: { dataSourceId: source.id, url: detailUrl }, data: { status: "COMPLETE", lastFetchedAt: new Date(), nextFetchAt: new Date(Date.now() + 24 * 3_600_000), contentHash: stableHash(parsed.data), consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null } });
              }
              counters.records += parsed.data.occurrences.length;
              for (const event of normaliseTicketekEvents(parsed.data, { from: requestedFrom, to }, maxRecords)) events.set(event.externalId, event);
            } catch (error) {
              if (error instanceof DeferredJobError) throw error;
              counters.failures += 1;
              const code = error instanceof AdapterError ? error.code : "SOURCE_UNAVAILABLE";
              const challenged = code === "RATE_LIMITED";
              if (!options.dryRun) {
                await prisma.sourceCrawlTarget.updateMany({
                  where: { dataSourceId: source.id, url: detailUrl },
                  data: {
                    status: challenged ? "RATE_LIMITED" : "FAILED",
                    nextFetchAt: new Date(Date.now() + (challenged ? 6 : 1) * 3_600_000),
                    consecutiveFailures: { increment: 1 },
                    lastErrorCode: code,
                    lastErrorAt: new Date(),
                  },
                });
              }
              if (challenged) {
                rateLimited = true;
                break;
              }
            }
          }
        }
      }

      counters.events = events.size;
      counters.references = counters.requests;
      if (!options.dryRun) {
        const persisted = await this.persistNormalisedEvents([...events.values()], source.id, run.id);
        for (const item of persisted.values()) if (item.unchanged) counters.unchangedSkipped += 1;
        counters.rawArtifacts = await prisma.rawArtifact.count({ where: { collectionRunId: run.id } });
      }
      counters.persisted = events.size;
      return { events: events.size, records: counters.records, requests: counters.requests };
    });
    const configurationAfter = sourceConfigurationSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
    const schedulesAfter = await sourceScheduleSnapshot(sourceId);
    const status = counters.failures > 0 ? "PARTIAL" : "SUCCEEDED";
    await prisma.$transaction([
      prisma.collectionRun.update({ where: { id: run.id }, data: { status, successCount: result.events, failureCount: counters.failures, errorCode: rateLimited ? "RATE_LIMITED" : counters.failures ? "PARTIAL_FAILURE" : null, errorSummary: rateLimited ? "Ticketek detail collection stopped after an access challenge; listing events were retained" : null, scope: { ...initialScope, counters, rateLimited, configurationAfter, configurationUnchanged: stableHash(configurationBefore) === stableHash(configurationAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) }, finishedAt: new Date() } }),
      ...(localAcceptance ? [] : [prisma.dataSource.update({ where: { id: source.id }, data: { lastSuccessAt: new Date(), healthStatus: "HEALTHY", operationalStatus: "HEALTHY", errorRate: 0 } })]),
    ]);
    await this.syncCollectionIncidentSafely(run.id);
    return { runId: run.id, localAcceptance, dryRun: options.dryRun === true, ...result, counters };
  } catch (error) {
    if (error instanceof DeferredJobError) throw error;
    counters.failures += 1;
    if (!options.dryRun) counters.rawArtifacts = await prisma.rawArtifact.count({ where: { collectionRunId: run.id } });
    const configurationAfter = sourceConfigurationSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
    const schedulesAfter = await sourceScheduleSnapshot(sourceId);
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: error instanceof AdapterError ? error.code : error instanceof WorkerRequestError ? error.code : "COLLECTION_FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown Argus event collection failure", scope: { ...initialScope, counters, configurationAfter, configurationUnchanged: stableHash(configurationBefore) === stableHash(configurationAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) }, finishedAt: new Date() } });
    if (options.jobId) await settleCancelledCollectionRun(options.jobId);
    await this.syncCollectionIncidentSafely(run.id);
    throw error;
  }
}

export async function collectRbnzFxSource(this: WorkerContext, marketScope: string, analysisRequestId?: string, options: CollectSourceOptions = {}) {
  if (marketScope !== "new-zealand") throw new WorkerRequestError("INVALID_MARKET_SCOPE", "RBNZ B1 collection supports New Zealand only", 422);
  const localAcceptance = options.localAcceptance === true;
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "fx_rates" } });
  const productionCanary = options.productionCanary === true;
  const metadata = jsonRecord(source.metadata);
  if (productionCanary && (this.environment.NODE_ENV !== "production" || !options.jobId || localAcceptance
    || options.dryRun || options.from || options.to || options.limit !== 2
    || metadata.browserPilot !== true || metadata.boundedProductionCanary !== true)) {
    throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "RBNZ FX canary requires the approved queued two-record production pilot", 422);
  }
  this.assertLocalAcceptanceAllowed(source, localAcceptance);
  if (!localAcceptance) this.assertSourceCollectionAllowed(source, productionCanary);
  const now = new Date();
  const requestedFrom = options.from ?? new Date(now.getTime() - 86_400_000);
  const requestedTo = options.to ?? new Date(now.getTime() + 31 * 86_400_000);
  const from = requestedFrom;
  const to = localAcceptance ? new Date(Math.min(requestedTo.getTime(), from.getTime() + 31 * 86_400_000)) : requestedTo;
  if (to <= from) throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "RBNZ B1 collection range must be positive", 422);
  const limits = { maxRequests: 1, maxPages: 1, maxRecords: localAcceptance ? 2 : Math.min(20, Math.max(1, options.limit ?? 20)), maxWindowDays: 31, concurrency: 1, timeoutMs: this.environment.ARGUS_TIMEOUT_MS, maxBytes: 2_000_000 } as const;
  const configurationBefore = sourceConfigurationSnapshot(source);
  const schedulesBefore = await sourceScheduleSnapshot("fx_rates");
  const initialScope = { localAcceptance, productionCanary, sourceId: "fx_rates", marketScope, requested: { from: requestedFrom.toISOString(), to: requestedTo.toISOString(), limit: options.limit ?? null }, effective: { from: from.toISOString(), to: to.toISOString(), limit: limits.maxRecords }, limits, dryRun: options.dryRun === true, configurationBefore, schedulesBefore };
  const run = await this.resumeOrCreateBrowserCollectionRun(options.jobId, source.id, analysisRequestId, initialScope, now);
  const counters = { requests: 0, pages: 0, records: 0, signals: 0, unchangedSignalsSkipped: 0, rawArtifacts: 0, failures: 0 };
  try {
    const result = await withRedisLock("source:fx_rates", 60_000, async () => {
      counters.requests = 1;
      const browserResult = await this.executeRbnzFxBrowserTask(source.id, run.id, options.dryRun === true, options.jobId);
      counters.pages = 1;
      counters.rawArtifacts = options.dryRun ? 0 : browserResult.evidence.length;
      if (!isRbnzFxExtraction(browserResult.extracted)) {
        if (!options.dryRun) await this.markArgusEvidenceParserFailure(run.id, browserResult.traceId);
        throw new AdapterError("PARSING_ERROR", "RBNZ B1 extractor returned an invalid payload", false);
      }
      const signals = normaliseRbnzFxSignals(browserResult.extracted, limits.maxRecords);
      counters.records = signals.length;
      counters.signals = signals.length;
      if (!options.dryRun) {
        for (const signal of signals) {
          const persisted = await this.persistNormalisedSignal(signal, source.id, run.id, marketScope);
          if (persisted.unchanged) counters.unchangedSignalsSkipped += 1;
        }
      }
      return { references: 1, records: signals.length, events: 0, signals: signals.length };
    });
    const configurationAfter = sourceConfigurationSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
    const schedulesAfter = await sourceScheduleSnapshot("fx_rates");
    const scope = { ...initialScope, counters, configurationAfter, configurationUnchanged: stableHash(configurationBefore) === stableHash(configurationAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) };
    await prisma.$transaction([
      prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: result.signals, scope, finishedAt: new Date() } }),
      ...(localAcceptance ? [] : [prisma.dataSource.update({ where: { id: source.id }, data: { lastSuccessAt: new Date(), healthStatus: "HEALTHY", operationalStatus: "HEALTHY", errorRate: 0 } })]),
    ]);
    await this.syncCollectionIncidentSafely(run.id);
    return { runId: run.id, localAcceptance, dryRun: options.dryRun === true, ...result, counters };
  } catch (error) {
    if (error instanceof DeferredJobError) throw error;
    counters.failures += 1;
    const configurationAfter = sourceConfigurationSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
    const schedulesAfter = await sourceScheduleSnapshot("fx_rates");
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: counters.failures, errorCode: error instanceof AdapterError ? error.code : "COLLECTION_FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown RBNZ B1 collection failure", scope: { ...initialScope, counters, configurationAfter, configurationUnchanged: stableHash(configurationBefore) === stableHash(configurationAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) }, finishedAt: new Date() } });
    await this.syncCollectionIncidentSafely(run.id);
    throw error;
  }
}
