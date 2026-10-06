import { randomUUID } from "node:crypto";
import { prisma, Prisma, sourceHasCapability, type WorkerAnalysisRequest } from "@tymra/db";
import { nzStartOfDay } from "@tymra/domain";
import { AdapterError, type AdapterContext, type PublicDataAdapter, type PublicEvent, type PublicSignal } from "@tymra/providers/types";
import { publicSignalCollectionPlanForAddress } from "@tymra/providers/nz-market-coverage";
import { argusPublicMarketSource } from "@tymra/providers/argus-public-market-adapters";
import { boundProductionCanaryResults } from "../../../operations/release-safety";
import { assertFirstPublicGeoNetReferences, boundFirstPublicResults, firstPublicReferenceRecordLimit, firstPublicSchedule } from "../../../operations/production-public-schedules";
import { redactPublicArtifact } from "../../../operations/public-artifact-redaction";
import { withRedisLock } from "@tymra/queue";
import { LINCOLN_KEY_DATES_URL, lincolnKeyDatesUrls } from "../../../collection/lincoln-university-key-dates";
import { isArgusEventSourceId } from "../../../collection/school-sport-ticketek";
import { ARGUS_MARKET_PILOT_SOURCE_KEYS, publicPilotRange, publicPilotRequestLimit, publicPilotSchedulePayload, publicPilotWindowDays } from "../../../operations/production-public-pilot";
import { DeferredJobError } from "../../../jobs/deferred-job";
import { sourceCollectionBlockers, type SourceAccessState } from "../../../operations/source-access";
import { CollectSourceOptions } from "../contracts";
import { WorkerRequestError } from "../errors";
import { emptyPublicCollectionCounters, defaultPublicRecordLimit, uniqueByExternalId, sourceConfigurationSnapshot, stableId, stableHash, jsonRecord, eventSignal } from "../helpers";
import { sourceScheduleSnapshot } from "./persistence-helpers";
import type { WorkerContext } from "../context";

export async function collectSource(this: WorkerContext, sourceId: string, marketScope = "new-zealand", analysisRequestId?: string, options: CollectSourceOptions = {}) {
  if (this.environment.NODE_ENV === "production" && !options.jobId
    && (argusPublicMarketSource(sourceId) || isArgusEventSourceId(sourceId)
      || ["council_calendars", "fx_rates", "ticketmaster", "auckland_airport_monthly", "mot_airline_performance", "christchurch_university_dates", "ski_seasons_nz"].includes(sourceId))) {
    throw new WorkerRequestError("DURABLE_JOB_REQUIRED", "Production Argus collection requires a queued Tymra Job before evidence ACK", 409);
  }
  if (options.lincolnOnly && (sourceId !== "christchurch_university_dates" || !options.jobId
    || options.from?.getTime() !== nzStartOfDay("2026-01-01").getTime()
    || options.to?.getTime() !== nzStartOfDay("2027-01-01").getTime()
    || options.limit !== 2)) {
    throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Lincoln-only acceptance requires the queued 2026 collection with a two-record limit", 422);
  }
  const rollingLincoln = options.rollingLincoln === true;
  if (rollingLincoln && (this.environment.NODE_ENV !== "production" || sourceId !== "christchurch_university_dates"
    || marketScope !== "christchurch" || !options.jobId || options.lincolnOnly || options.from || options.to
    || options.dryRun || options.localAcceptance || options.productionCanary || options.boundedPublicSchedule
    || options.limit !== 200)) {
    throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Rolling Lincoln collection requires its approved queued weekly bounds", 422);
  }
  const registeredSource = await prisma.dataSource.findUnique({ where: { key: sourceId }, select: { id: true } });
  if (!registeredSource) throw new WorkerRequestError("SOURCE_NOT_FOUND", `SourceRegistry is missing ${sourceId}`, 404);
  if (!await sourceHasCapability(registeredSource.id, "COLLECT_PUBLIC_SIGNALS")) {
    throw new WorkerRequestError("SOURCE_CAPABILITY_MISSING", `${sourceId} is not registered for COLLECT_PUBLIC_SIGNALS`, 409);
  }
  if (sourceId === "eventfinda") return this.collectEventfindaSource(marketScope, analysisRequestId, options);
  if (sourceId === "ticketmaster") return this.collectTicketmasterSource(marketScope, analysisRequestId, options);
  if (sourceId === "fx_rates") return this.collectRbnzFxSource(marketScope, analysisRequestId, options);
  if (isArgusEventSourceId(sourceId)) return this.collectArgusEventSource(sourceId, marketScope, analysisRequestId, options);
  const adapter = this.publicAdapters[sourceId];
  if (!adapter) throw new WorkerRequestError("SOURCE_NOT_FOUND", `No public adapter exists for ${sourceId}`, 404);
  const localAcceptance = options.localAcceptance === true;
  const productionCanary = options.productionCanary === true;
  const boundedPublicSchedule = options.boundedPublicSchedule === true;
  const scheduleSpec = boundedPublicSchedule ? firstPublicSchedule(sourceId) : undefined;
  if (boundedPublicSchedule && (this.environment.NODE_ENV !== "production" || !options.jobId || !scheduleSpec
    || marketScope !== scheduleSpec.marketScope
    || options.from || options.to || options.dryRun || localAcceptance || productionCanary || options.limit !== scheduleSpec.limit)) {
    throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "First public schedule must use its approved production bounds", 422);
  }
  const pilotLimit = sourceId === "christchurch_cruise" ? 100 : sourceId === "ski_seasons_nz" ? 3 : null;
  if (productionCanary && (this.environment.NODE_ENV !== "production" || localAcceptance || options.dryRun
    || !options.limit || (pilotLimit === null ? options.limit > 2 : options.limit !== pilotLimit))) {
    throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Production canary requires the source-specific approved result limit", 422);
  }
  const source = await prisma.dataSource.findUniqueOrThrow({
    where: { key: sourceId },
    select: {
      id: true, key: true, name: true, enabled: true, environments: true, dailyBudget: true,
      lifecycle: true, operationalStatus: true, healthStatus: true,
      metadata: true,
    },
  });
  const browserPilot = productionCanary && ARGUS_MARKET_PILOT_SOURCE_KEYS.includes(sourceId)
    && options.jobId !== undefined && jsonRecord(source.metadata).browserPilot === true
    && jsonRecord(source.metadata).boundedProductionCanary === true;
  if (productionCanary && ARGUS_MARKET_PILOT_SOURCE_KEYS.includes(sourceId) && !browserPilot) {
    throw new WorkerRequestError("SOURCE_UNAVAILABLE", "Argus market canary requires an approved queued production pilot", 409);
  }
  if (this.environment.NODE_ENV === "production" && jsonRecord(source.metadata).lincolnAcceptanceOnly === true && !options.lincolnOnly && !rollingLincoln) {
    throw new WorkerRequestError("SOURCE_UNAVAILABLE", "Lincoln acceptance source requires the bounded Lincoln-only job", 409);
  }
  if (boundedPublicSchedule && jsonRecord(source.metadata).boundedProductionCanary !== true) {
    throw new WorkerRequestError("SOURCE_UNAVAILABLE", "First public schedule source is not approved", 409);
  }
  this.assertLocalAcceptanceAllowed(source, localAcceptance);
  const pilotRange = productionCanary ? publicPilotRange(sourceId, new Date()) : null;
  const requestedFrom = options.from ?? pilotRange?.from ?? (rollingLincoln ? nzStartOfDay(new Date()) : new Date());
  const requestedTo = options.to ?? pilotRange?.to ?? new Date(requestedFrom.getTime() + (rollingLincoln ? 365 : boundedPublicSchedule ? 31 : 90) * 86_400_000);
  const localBounds = {
    maxRequests: sourceId === "doc_alerts" ? 14 : sourceId === "queenstown_airport_monthly" ? 6 : ["christchurch_airport", "wellington_airport"].includes(sourceId) ? 4 : ["ski_seasons_nz", "university_calendars", "council_calendars", "canterbury_major_annual_events", "venues_otautahi_events", "eventbrite_events", "humanitix_events", "christchurch_sports", "christchurch_council_events", "waikatonz_events", "queenstownnz_events", "tauponz_events", "southlandnz_events", "taranakienz_events", "manawatunz_events"].includes(sourceId) ? 3 : ["geonet", "christchurch_racing", "christchurch_university_dates", "christchurch_cruise"].includes(sourceId) ? 2 : 1,
    maxRecords: argusPublicMarketSource(sourceId)?.kind === "venue" ? 200
      : argusPublicMarketSource(sourceId) ? 500
      : sourceId === "mbie_tourism_flows" ? 250
      : sourceId === "mbie" || sourceId === "mbie_mrte" ? 100
        : sourceId === "mbie_ivs" ? 10
          : sourceId === "university_calendars" ? 50
            : sourceId === "doc_alerts" ? 300
              : sourceId === "interislander_alerts" ? 20
                : sourceId === "christchurch_cruise" ? 100
                  : sourceId === "ski_seasons_nz" ? 3
                  : ["queenstown_airport_monthly", "auckland_airport_monthly"].includes(sourceId) ? 13
                    : sourceId === "mot_airline_performance" ? 100 : 2,
    maxWindowDays: ["cruise", "university"].includes(argusPublicMarketSource(sourceId)?.kind ?? "") ? 366 : publicPilotWindowDays(sourceId),
    maxBytes: sourceId === "venue_calendars" ? 6_000_000 : 2_000_000,
    concurrency: 1,
    timeoutMs: sourceId === "council_calendars" || argusPublicMarketSource(sourceId) ? 120_000 : ["university_calendars", "doc_alerts"].includes(sourceId) ? 30_000 : 10_000,
  } as const;
  const from = requestedFrom;
  const to = localAcceptance || productionCanary || boundedPublicSchedule
    ? new Date(Math.min(requestedTo.getTime(), from.getTime() + localBounds.maxWindowDays * 86_400_000))
    : requestedTo;
  const limit = rollingLincoln ? undefined : localAcceptance
    ? localBounds.maxRecords
    : options.limit === undefined ? undefined : Math.min(5_000, Math.max(1, Math.trunc(options.limit)));
  if (to <= from || to.getTime() - from.getTime() > 366 * 86_400_000) throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Collection range must be positive and no longer than 366 days", 422);
  const productionBounds = {
    maxRequests: Math.max(1, adapter.metadata.dailyBudget),
    maxRecords: limit ?? defaultPublicRecordLimit(sourceId),
    maxWindowDays: 366,
    maxBytes: 5_000_000,
    concurrency: Math.max(1, adapter.metadata.concurrencyLimit),
    timeoutMs: 120_000,
  } as const;
  const effectiveBounds = rollingLincoln
    ? { ...localBounds, maxRequests: 3, maxRecords: 200, maxWindowDays: 366, timeoutMs: 300_000, concurrency: 1 }
    : localAcceptance ? localBounds : productionCanary
    ? { ...localBounds, maxRequests: publicPilotRequestLimit(sourceId), maxRecords: publicPilotSchedulePayload(sourceId).limit, timeoutMs: sourceId === "council_calendars" ? 120_000 : 30_000 }
    : boundedPublicSchedule && scheduleSpec
      ? { ...localBounds, maxRequests: scheduleSpec.maxRequests, maxRecords: scheduleSpec.limit, maxWindowDays: 31, timeoutMs: sourceId === "rto_calendars" ? 180_000 : 30_000, concurrency: 1 }
    : productionBounds;
  const collectionState = sourceId === "metservice" ? await this.metServiceCollectionState(source.id) : undefined;
  const christchurchScan = boundedPublicSchedule && sourceId === "rto_calendars" ? await this.previousChristchurchScan(source.id) : undefined;
  const context: AdapterContext = {
    ...this.publicAdapterContext(),
    localAcceptance,
    collectionLimits: effectiveBounds,
    collectionRange: { from, to },
    ...(localAcceptance || productionCanary || boundedPublicSchedule || rollingLincoln ? { signal: AbortSignal.timeout(effectiveBounds.timeoutMs) } : {}),
    ...(collectionState ? { collectionState } : {}),
    ...(christchurchScan ? { christchurchScan } : {}),
  };
  const configurationBefore = sourceConfigurationSnapshot(source);
  const schedulesBefore = await sourceScheduleSnapshot(sourceId);
  const initialScope = {
    localAcceptance, productionCanary, boundedPublicSchedule, rollingLincoln, sourceId, marketScope,
    requested: { from: requestedFrom.toISOString(), to: requestedTo.toISOString(), limit: options.limit ?? null },
    effective: { from: from.toISOString(), to: to.toISOString(), limit: effectiveBounds.maxRecords },
    limits: effectiveBounds,
    dryRun: options.dryRun ?? false,
    counters: emptyPublicCollectionCounters(),
    configurationBefore,
    schedulesBefore,
  };
  const run = await this.resumeOrCreateBrowserCollectionRun(
    options.jobId,
    source.id,
    analysisRequestId,
    initialScope,
    new Date(),
    context.correlationId,
    this.environment.NODE_ENV === "test",
  );
  const counters = emptyPublicCollectionCounters();
  try {
    if (!localAcceptance) this.assertSourceCollectionAllowed(source, browserPilot);
      const result = await withRedisLock(`source:${sourceId}`, rollingLincoln ? 600_000 : sourceId === "ski_seasons_nz" && productionCanary ? 600_000
        : sourceId === "rto_calendars" && boundedPublicSchedule ? 600_000
        : sourceId === "council_calendars" && productionCanary ? 180_000 : 60_000, async () => {
      if (rollingLincoln) {
        const usedToday = await prisma.rawArtifact.count({ where: {
          dataSourceId: source.id, artifactType: "HTML", createdAt: { gte: nzStartOfDay(new Date()) },
          collectionRunId: { not: run.id },
        } });
        if (source.dailyBudget !== 3 || usedToday + effectiveBounds.maxRequests > source.dailyBudget) {
          throw new AdapterError("DAILY_BUDGET_EXHAUSTED", "Rolling Lincoln daily browser budget has been reached", false);
        }
      }
      const adapterReferences = options.lincolnOnly ? [] : await adapter.discover({ marketScope, from, to, limit }, context);
      const lincolnReferences = sourceId === "christchurch_university_dates"
        ? options.lincolnOnly ? [LINCOLN_KEY_DATES_URL] : lincolnKeyDatesUrls(from, to)
        : [];
      const discovered = sourceId === "christchurch_university_dates"
        ? [...lincolnReferences, ...adapterReferences]
        : adapterReferences;
      counters.discovered = discovered.length;
      const uniqueReferences = [...new Set(discovered)];
      counters.duplicatesSkipped += discovered.length - uniqueReferences.length;
      const references = localAcceptance || productionCanary || boundedPublicSchedule ? uniqueReferences.slice(0, effectiveBounds.maxRequests) : uniqueReferences;
      if (boundedPublicSchedule && sourceId === "geonet") assertFirstPublicGeoNetReferences(references);
      counters.references = references.length;
      const rawById = new Map<string, Awaited<ReturnType<PublicDataAdapter["fetch"]>>[number]>();
      for (const reference of references) {
        if (productionCanary && counters.requests >= effectiveBounds.maxRequests) break;
        counters.visitedReferences += 1;
        const records = sourceId === "council_calendars"
          ? await this.executeOurAucklandBrowserTask(
              source.id,
              run.id,
              reference,
              effectiveBounds.maxRecords,
              options.dryRun === true,
              options.jobId,
            )
          : sourceId === "christchurch_university_dates" && lincolnReferences.includes(reference)
            ? await this.executeLincolnKeyDatesBrowserTask(source.id, run.id, reference, context, options.dryRun === true, options.jobId)
            : sourceId === "ski_seasons_nz"
              ? await this.executeSkiSeasonArgusTask(source.id, run.id, reference, context, options.dryRun === true, options.jobId)
            : sourceId === "auckland_airport_monthly" || sourceId === "mot_airline_performance"
              ? await this.executeAviationArgusTask(sourceId, source.id, run.id, reference, context, options.dryRun === true, options.jobId)
            : sourceId === "christchurch_council_events"
              ? await this.executeCouncilArgusTask(source.id, run.id, reference, context, options.dryRun === true, options.jobId)
            : argusPublicMarketSource(sourceId)
              ? await this.executePublicMarketArgusTask(sourceId, source.id, run.id, context, options.dryRun === true, options.jobId)
            : await adapter.fetch(reference, boundedPublicSchedule && sourceId === "geonet"
              ? { ...context, collectionLimits: { ...effectiveBounds, maxRecords: firstPublicReferenceRecordLimit(sourceId, reference, scheduleSpec!.limit) } }
              : productionCanary
                ? { ...context, collectionLimits: { ...effectiveBounds, maxRequests: effectiveBounds.maxRequests - counters.requests } }
                : context);
        counters.requests += sourceId === "rto_calendars" && boundedPublicSchedule && context.christchurchScan?.progress
          ? context.christchurchScan.progress.pages.length
          : Math.max(1, records.reduce((sum, record) => sum + (record.networkRequestCount ?? 0), 0));
        if (productionCanary && counters.requests > effectiveBounds.maxRequests) {
          throw new AdapterError("REQUEST_BUDGET_EXHAUSTED", `${sourceId} exceeded the bounded public-pilot request limit`, false);
        }
        counters.requestsAvoided += records.reduce((sum, record) => sum + (record.networkRequestsAvoided ?? 0), 0);
        for (const record of records) {
          if (rawById.has(record.externalId)) counters.duplicatesSkipped += 1;
          else rawById.set(record.externalId, record);
          if (limit && rawById.size >= limit) break;
        }
        if (limit && rawById.size >= limit && !(boundedPublicSchedule && sourceId === "geonet")) break;
      }
      const raw = [...rawById.values()];
      counters.records = raw.length;
      if (!options.dryRun) {
        for (const record of raw) {
          const payload = redactPublicArtifact(record.payload, sourceId === "rto_calendars");
          const id = stableId("raw-artifact", `${run.id}:${record.externalId}`);
          await prisma.$transaction(async (transaction) => {
            const artifact = await transaction.rawArtifact.upsert({ where: { id }, create: { id, collectionRunId: run.id, dataSourceId: source.id, artifactType: "NETWORK_RESPONSE", storageRef: `postgres:RawArtifact:${id}`, contentHash: stableHash(payload), payload, containsSensitiveData: false, parserFailure: false, expiresAt: new Date(Date.now() + this.environment.RAW_ARTIFACT_TTL_HOURS * 3_600_000) }, update: {} });
            // PostgreSQL JSONB can round floating-point values. Hash the stored payload that readers will receive.
            const persistedHash = artifact.payload === null ? artifact.contentHash : stableHash(artifact.payload);
            if (persistedHash !== artifact.contentHash) {
              await transaction.rawArtifact.update({ where: { id }, data: { contentHash: persistedHash } });
            }
          });
          counters.rawArtifacts += 1;
        }
      }
      let signals: PublicSignal[];
      let events: PublicEvent[];
      try {
        const normalisedSignals = await adapter.normalise(raw, context);
        const normalisedEvents = adapter.normaliseEvents ? await adapter.normaliseEvents(raw, context) : [];
        const uniqueEvents = uniqueByExternalId(normalisedEvents, counters);
        const uniqueSignals = uniqueByExternalId(normalisedSignals, counters);
        if (boundedPublicSchedule && sourceId === "mbie" && uniqueSignals.length > scheduleSpec!.limit) {
          throw new AdapterError("PARSING_ERROR", "MBIE ADP signals exceed the approved result ceiling", false);
        }
        const bounded = productionCanary ? boundProductionCanaryResults(uniqueEvents, uniqueSignals, options.limit!)
          : boundedPublicSchedule ? boundFirstPublicResults(uniqueEvents, uniqueSignals, scheduleSpec!.limit, sourceId)
          : { events: uniqueEvents, signals: uniqueSignals };
        events = bounded.events;
        signals = bounded.signals;
      } catch (error) {
        if (!options.dryRun) {
          await prisma.rawArtifact.updateMany({ where: { collectionRunId: run.id }, data: { parserFailure: true, expiresAt: new Date(Date.now() + this.environment.RAW_ARTIFACT_FAILURE_TTL_HOURS * 3_600_000) } });
        }
        throw error;
      }
      counters.signals = signals.length;
      counters.events = events.length;
      let derivedEventSignalCount = events.flatMap(eventSignal).length;
      if (!options.dryRun) {
        const persistedEvents = await this.persistNormalisedEvents(events, source.id, run.id);
        derivedEventSignalCount = 0;
        for (const event of events) {
          const persisted = persistedEvents.get(event.externalId)!;
          derivedEventSignalCount += eventSignal(persisted.normalisedEvent).length;
          if (persisted.unchanged) counters.unchangedSkipped += 1;
        }
        for (const signal of signals) {
          const persisted = await this.persistNormalisedSignal(signal, source.id, run.id, marketScope);
          if (persisted.unchanged) counters.unchangedSkipped += 1;
        }
      }
      counters.persisted = events.length + signals.length;
      return { references: references.length, records: raw.length, events: events.length, signals: signals.length + derivedEventSignalCount };
    });
    const configurationAfter = sourceConfigurationSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
    const schedulesAfter = await sourceScheduleSnapshot(sourceId);
    const scope = { ...initialScope, counters, ...(christchurchScan?.progress ? { christchurchScan: christchurchScan.progress } : {}), configurationAfter, configurationUnchanged: stableHash(configurationBefore) === stableHash(configurationAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) };
    const successCount = result.events + result.signals;
    await prisma.$transaction([
      prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount, scope, finishedAt: new Date() } }),
      ...(localAcceptance ? [] : [prisma.dataSource.update({ where: { id: source.id }, data: { lastSuccessAt: new Date(), healthStatus: "HEALTHY", operationalStatus: "HEALTHY", errorRate: 0 } })]),
    ]);
    await this.syncCollectionIncidentSafely(run.id);
    return { runId: run.id, localAcceptance, dryRun: options.dryRun ?? false, ...result, counters };
  } catch (error) {
    if (error instanceof DeferredJobError) throw error;
    counters.failures += 1;
    const configurationAfter = sourceConfigurationSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
    const schedulesAfter = await sourceScheduleSnapshot(sourceId);
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: counters.failures, errorCode: error instanceof AdapterError ? error.code : "COLLECTION_FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown public source failure", scope: { ...initialScope, counters, configurationAfter, configurationUnchanged: stableHash(configurationBefore) === stableHash(configurationAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) }, finishedAt: new Date() } });
    await this.syncCollectionIncidentSafely(run.id);
    throw error;
  }
}

export function assertLocalAcceptanceAllowed(this: WorkerContext, source: { name: string; enabled: boolean; environments: string[]; operationalStatus: string }, localAcceptance: boolean) {
  if (!localAcceptance) return;
  if (this.environment.NODE_ENV !== "development") throw new AdapterError("CONFIGURATION_ERROR", "Local source acceptance is available only in development", false);
  if (source.operationalStatus === "BLOCKED") throw new AdapterError("SOURCE_UNAVAILABLE", `${source.name} is explicitly blocked`, false);
  if (!source.environments.includes("DEVELOPMENT")) throw new AdapterError("CONFIGURATION_ERROR", `${source.name} does not allow the DEVELOPMENT environment`, false);
}

export function assertSourceCollectionAllowed(this: WorkerContext, source: SourceAccessState & { name: string }, allowDegradedInProduction = false) {
  const blockers = sourceCollectionBlockers(source, this.environment.NODE_ENV, { allowDegradedInProduction, allowDevelopmentValidation: this.environment.NODE_ENV === "development" });
  if (!blockers.length) return;
  const unavailable = blockers.length === 1 && blockers[0] === "source is not operationally available";
  if (this.environment.NODE_ENV === "development") return;
  if (unavailable) throw new AdapterError("SOURCE_UNAVAILABLE", `${source.name} is ${source.operationalStatus.toLowerCase()}`, true);
  throw new AdapterError("SOURCE_UNAVAILABLE", `${source.name} cannot be collected: ${blockers.join("; ")}`, false);
}

export async function metServiceCollectionState(this: WorkerContext, dataSourceId: string): Promise<NonNullable<AdapterContext["collectionState"]>> {
  const signals = await prisma.sourceMarketSignal.findMany({
    where: { dataSourceId },
    select: { evidenceRef: true, metadata: true },
  });
  const knownReferenceVersions: Record<string, string> = {};
  for (const signal of signals) {
    const metadata = jsonRecord(signal.metadata);
    const signalMetadata = jsonRecord(metadata.signal);
    const feedItem = jsonRecord(signalMetadata.feedItem);
    const reference = typeof signal.evidenceRef === "string" ? signal.evidenceRef : "";
    const guid = typeof feedItem.guid === "string" ? feedItem.guid : "";
    const pubDate = typeof feedItem.pubDate === "string" ? feedItem.pubDate : "";
    if (reference && (guid || pubDate)) knownReferenceVersions[reference] = `${guid}|${pubDate}`;
  }
  return { knownReferenceVersions };
}

export async function previousChristchurchScan(this: WorkerContext, dataSourceId: string): Promise<NonNullable<AdapterContext["christchurchScan"]>> {
  const previous = await prisma.collectionRun.findFirst({
    where: { dataSourceId, status: "SUCCEEDED", isDemo: false, scope: { path: ["christchurchScan", "version"], equals: 1 } },
    orderBy: { finishedAt: "desc" },
    select: { scope: true },
  });
  const saved = jsonRecord(jsonRecord(previous?.scope).christchurchScan);
  if (saved.version !== 1 || typeof saved.fullScanAt !== "string"
    || typeof saved.nextPage !== "number" || typeof saved.firstWindowPage !== "number" || typeof saved.boundaryPage !== "number") return {};
  return { previous: { nextPage: saved.nextPage, firstWindowPage: saved.firstWindowPage, boundaryPage: saved.boundaryPage, fullScanAt: saved.fullScanAt } };
}

export async function resumeOrCreateBrowserCollectionRun(this: WorkerContext, jobId: string | undefined, dataSourceId: string, analysisRequestId: string | undefined, scope: Prisma.InputJsonValue, startedAt: Date, correlationId: string = randomUUID(), isDemo = false) {
  if (jobId) {
    const running = await prisma.collectionRun.findFirst({
      where: { jobId, status: "RUNNING" },
      orderBy: { createdAt: "desc" },
    });
    if (running) return running;
  }
  return prisma.collectionRun.create({
    data: {
      jobId,
      dataSourceId,
      analysisRequestId,
      correlationId,
      mode: "MARKET_COVERAGE",
      status: "RUNNING",
      scope,
      startedAt,
      attemptCount: 1,
      isDemo,
    },
  });
}

export async function collectPublicSignals(this: WorkerContext, request: WorkerAnalysisRequest) {
  await this.setStatus(request, "COLLECTING_MARKET_SIGNALS");
  const property = request.propertyId ? await prisma.property.findUnique({ where: { id: request.propertyId } }) : null;
  const plan = property ? publicSignalCollectionPlanForAddress(property) : [];
  for (const target of plan) {
    try { await this.collectSource(target.sourceId, target.marketScope, request.id); } catch { /* Public signals corroborate price evidence; a source failure cannot invent sold-out inventory. */ }
  }
}

export function adapterContext(this: WorkerContext): AdapterContext {
  return { mode: this.fixtureEnabled() ? "fixture" : "live", correlationId: randomUUID(), locale: "en", currency: "NZD" };
}

export function publicAdapterContext(this: WorkerContext): AdapterContext {
  return { mode: this.environment.PUBLIC_COLLECTION_MODE, correlationId: randomUUID(), locale: "en", currency: "NZD" };
}
