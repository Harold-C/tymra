import { prisma, Prisma } from "@tymra/db";
import { nzStartOfDay } from "@tymra/domain";
import { AdapterError } from "@tymra/providers/types";
import { dailySourceBudgetExceeded } from "../../../collection/source-budget";
import { withRedisLock } from "@tymra/queue";
import { canonicalTicketmasterUrl, groupTicketmasterListingEvents, isTicketmasterDetailExtraction, isTicketmasterExtraction, isTicketmasterListingExtraction, normaliseTicketmasterEvent, normaliseTicketmasterEvents, ticketmasterChallengeTransition, ticketmasterCircuitStatus, ticketmasterCircuitSuccessMetadata, ticketmasterFailureBackoff, ticketmasterListingCoverage, ticketmasterRefreshPolicy, ticketmasterRequestDelayMs, ticketmasterUrlHash, TICKETMASTER_LISTING_URLS, type TicketmasterListingEvent } from "../../../collection/ticketmaster";
import { DeferredJobError } from "../../../jobs/deferred-job";
import { settleCancelledCollectionRun } from "../../argus-orchestrator";
import { CollectSourceOptions } from "../contracts";
import { WorkerRequestError } from "../errors";
import { sourceConfigurationSnapshot, stableHash, listingPriority, wait, jsonStringArray, jsonRecord, integerMetadata, detailTargetBatchUrls, orderPersistedDetailTargets } from "../helpers";
import { sourceScheduleSnapshot, persistDetailTargetBatch } from "./persistence-helpers";
import type { WorkerContext } from "../context";

export async function collectTicketmasterSource(this: WorkerContext, marketScope: string, analysisRequestId?: string, options: CollectSourceOptions = {}) {
  if (marketScope !== "new-zealand") throw new WorkerRequestError("INVALID_MARKET_SCOPE", "Ticketmaster browser collection currently supports New Zealand only", 422);
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "ticketmaster" } });
  const localAcceptance = options.localAcceptance === true;
  const developmentBootstrap = options.developmentBootstrap === true;
  const productionCanary = options.productionCanary === true;
  const pilotMetadata = jsonRecord(source.metadata);
  if (productionCanary && (this.environment.NODE_ENV !== "production" || !options.jobId || localAcceptance
    || developmentBootstrap || options.dryRun || options.from || options.to || options.phase
    || options.maxPages || options.maxDetails || options.limit !== 2
    || pilotMetadata.browserPilot !== true || pilotMetadata.boundedProductionCanary !== true)) {
    throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Ticketmaster canary requires the approved queued two-record production pilot", 422);
  }
  if (localAcceptance && developmentBootstrap) throw new WorkerRequestError("INVALID_COLLECTION_MODE", "Choose either local acceptance or development bootstrap", 422);
  const guardedDevelopmentRun = localAcceptance || developmentBootstrap;
  this.assertTicketmasterSourceAllowed(source, localAcceptance, developmentBootstrap, productionCanary);
  const now = new Date();
  const requestedPhase = options.phase ?? "full";
  const metadata = jsonRecord(source.metadata);
  const circuit = ticketmasterCircuitStatus(metadata, now);
  const phase = circuit.halfOpen ? "discovery" : requestedPhase;
  const requestedFrom = options.from ?? new Date(now.getTime() - 86_400_000);
  const requestedTo = options.to ?? new Date(now.getTime() + 400 * 86_400_000);
  const from = requestedFrom;
  const to = localAcceptance || productionCanary ? new Date(Math.min(requestedTo.getTime(), from.getTime() + 31 * 86_400_000)) : requestedTo;
  if (to <= from || to.getTime() - from.getTime() > 730 * 86_400_000) throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Ticketmaster collection range must be positive and no longer than 730 days", 422);
  const requestedMaxPages = localAcceptance || productionCanary ? 1 : Math.min(options.maxPages ?? this.environment.TICKETMASTER_DISCOVERY_MAX_PAGES, TICKETMASTER_LISTING_URLS.length);
  const requestedMaxDetails = productionCanary ? 1 : localAcceptance ? Math.min(options.maxDetails ?? options.limit ?? 2, 2) : Math.min(options.maxDetails ?? options.limit ?? this.environment.TICKETMASTER_DETAIL_BATCH_SIZE, 100);
  const maxPages = circuit.halfOpen ? 1 : requestedMaxPages;
  const maxDetails = circuit.halfOpen ? 0 : requestedMaxDetails;
  const maxRecords = localAcceptance || productionCanary ? 2 : Math.min(options.limit ?? 5_000, 5_000);
  const localMaxRequests = (phase === "discovery" || phase === "full" ? maxPages : 0) + (phase === "details" || phase === "full" ? maxDetails * 2 : 0);
  const limits = { maxRequests: localAcceptance || productionCanary || this.environment.NODE_ENV === "development" ? localMaxRequests : this.environment.TICKETMASTER_DAILY_REQUEST_BUDGET, maxPages, maxDetails, maxRecords, maxWindowDays: localAcceptance || productionCanary ? 31 : 730, concurrency: 1, timeoutMs: this.environment.ARGUS_TIMEOUT_MS } as const;
  const configurationBefore = sourceConfigurationSnapshot(source);
  const schedulesBefore = await sourceScheduleSnapshot("ticketmaster");
  const initialScope = { localAcceptance, developmentBootstrap, productionCanary, sourceId: "ticketmaster", marketScope, requestedPhase, phase, halfOpenProbe: circuit.halfOpen, circuitBefore: { ...circuit, cooldownUntil: circuit.cooldownUntil?.toISOString() ?? null }, requested: { from: requestedFrom.toISOString(), to: requestedTo.toISOString(), limit: options.limit ?? null }, effective: { from: from.toISOString(), to: to.toISOString(), limit: maxRecords }, limits, dryRun: options.dryRun === true, configurationBefore, schedulesBefore };
  const run = await this.resumeOrCreateBrowserCollectionRun(options.jobId, source.id, analysisRequestId, initialScope, now);
  const counters = { requests: 0, pages: 0, discovered: 0, records: 0, targetsUpserted: 0, listingEventsAccepted: 0, listingEventsPersisted: 0, detailRequestsAvoided: 0, detailsFetched: 0, unchangedDetails: 0, eventsPersisted: 0, unchangedEventsSkipped: 0, rawArtifacts: 0, failures: 0 };
  let circuitTransitionApplied = false;
  let circuitCooldownUntil = circuit.cooldownUntil;
  try {
    if (circuit.blocked) {
      const reason = circuit.state === "MANUAL_REQUIRED" ? "requires manual review after three persistent challenges" : `is cooling down until ${circuit.cooldownUntil?.toISOString()}`;
      throw new AdapterError("RATE_LIMITED", `Ticketmaster collection ${reason}`, true);
    }
    const collectionResult = await withRedisLock("source:ticketmaster", 60 * 60_000, async () => {
      const usedToday = this.environment.NODE_ENV === "development" ? 0 : await prisma.rawArtifact.count({ where: { dataSourceId: source.id, artifactType: "HTML", createdAt: { gte: nzStartOfDay(now) } } });
      let lastRequestAt = 0;
      let rateLimited = false;
      const discovered = new Map<string, { events: TicketmasterListingEvent[]; discoveredFrom: string[] }>();
      const dryRun = options.dryRun === true;
      const capture = async (url: string, entryUrl?: string) => {
        const sourceRequests = entryUrl ? 2 : 1;
        if (dailySourceBudgetExceeded(this.environment.NODE_ENV, usedToday, counters.requests, sourceRequests, this.environment.TICKETMASTER_DAILY_REQUEST_BUDGET)) throw new AdapterError("DAILY_BUDGET_EXHAUSTED", "Ticketmaster daily request budget has been reached", false);
        if (lastRequestAt) {
          const delay = ticketmasterRequestDelayMs(this.environment.TICKETMASTER_MIN_DELAY_MS, this.environment.TICKETMASTER_DELAY_JITTER_MS);
          await wait(Math.max(0, delay - (Date.now() - lastRequestAt)));
        }
        lastRequestAt = Date.now();
        counters.requests += sourceRequests;
        const browserResult = await this.executeTicketmasterBrowserTask(source.id, run.id, url, dryRun, options.jobId, entryUrl);
        counters.rawArtifacts += dryRun ? 0 : browserResult.evidence.length;
        const extraction = browserResult.extracted;
        if (!isTicketmasterExtraction(extraction)) {
          if (!dryRun) await this.markArgusEvidenceParserFailure(run.id, browserResult.traceId);
          throw new AdapterError("PARSING_ERROR", `Ticketmaster extractor returned an invalid payload for ${url}`, false);
        }
        return { ...browserResult, extracted: extraction };
      };

      if (phase === "discovery" || phase === "full") {
        for (const listingUrl of TICKETMASTER_LISTING_URLS.slice(0, maxPages)) {
          const browserResult = await capture(listingUrl);
          if (!isTicketmasterListingExtraction(browserResult.extracted)) throw new AdapterError("PARSING_ERROR", `Ticketmaster listing returned an unexpected page for ${listingUrl}`, false);
          counters.pages += 1;
          counters.discovered += browserResult.extracted.events.length;
          for (const group of groupTicketmasterListingEvents(browserResult.extracted.events)) {
            const accepted = group.events.filter((listingEvent) => {
              const event = normaliseTicketmasterEvent(listingEvent);
              return event && event.endsAt >= from && event.startsAt <= to;
            });
            if (!accepted.length || (!discovered.has(group.url) && discovered.size >= maxRecords)) continue;
            const current = discovered.get(group.url);
            const merged = groupTicketmasterListingEvents([...(current?.events ?? []), ...accepted])[0]?.events ?? accepted;
            discovered.set(group.url, {
              events: merged,
              discoveredFrom: [...new Set([...(current?.discoveredFrom ?? []), browserResult.extracted.canonicalUrl])],
            });
          }
        }

        const hashes = [...discovered.keys()].map(ticketmasterUrlHash);
        const existingTargets = dryRun || !hashes.length ? [] : await prisma.sourceCrawlTarget.findMany({
          where: { dataSourceId: source.id, urlHash: { in: hashes } },
          select: { urlHash: true, status: true, lastFetchedAt: true, nextFetchAt: true, contentHash: true, metadata: true },
        });
        const existingByHash = new Map(existingTargets.map((target) => [target.urlHash, target]));
        for (const [url, listing] of discovered) {
          const coverage = ticketmasterListingCoverage(listing.events);
          counters.listingEventsAccepted += coverage.events.length;
          if (coverage.complete) counters.detailRequestsAvoided += 1;
          const cancelled = coverage.events.length > 0 && coverage.events.every((event) => event.status === "CANCELLED");
          if (!dryRun && coverage.complete) {
            const boundedEvents = productionCanary ? coverage.events.slice(0, Math.max(0, 2 - counters.eventsPersisted)) : coverage.events;
            const persistedEvents = await this.persistNormalisedEvents(boundedEvents, source.id, run.id);
            counters.unchangedEventsSkipped += [...persistedEvents.values()].filter((persisted) => persisted.unchanged).length;
            counters.listingEventsPersisted += boundedEvents.length;
            counters.eventsPersisted += boundedEvents.length;
          }
          if (!dryRun) {
            const urlHash = ticketmasterUrlHash(url);
            const existing = existingByHash.get(urlHash);
            const detailRequired = !coverage.complete && !cancelled;
            const targetMetadata = {
              ...jsonRecord(existing?.metadata),
              listing: listing.events[0],
              listingEvents: listing.events,
              discoveredFrom: listing.discoveredFrom,
              listingComplete: coverage.complete,
              detailRequired,
              occurrenceCount: listing.events.length,
            };
            await prisma.sourceCrawlTarget.upsert({
              where: { dataSourceId_urlHash: { dataSourceId: source.id, urlHash } },
              create: { dataSourceId: source.id, url, urlHash, kind: "EVENT_DETAIL", status: cancelled ? "CANCELLED" : coverage.complete ? "LISTING_COMPLETE" : "PENDING", priority: cancelled ? 900 : listingPriority(listing.events[0]?.startsAt, now), active: !cancelled, lastSeenAt: now, lastFetchedAt: coverage.complete ? now : null, nextFetchAt: detailRequired ? now : null, contentHash: coverage.complete ? stableHash(listing.events) : null, consecutiveFailures: 0, metadata: targetMetadata },
              update: { url, status: cancelled ? "CANCELLED" : coverage.complete ? "LISTING_COMPLETE" : "PENDING", priority: cancelled ? 900 : listingPriority(listing.events[0]?.startsAt, now), active: !cancelled, lastSeenAt: now, missedDiscoveryCount: 0, lastFetchedAt: coverage.complete ? now : existing?.lastFetchedAt, nextFetchAt: detailRequired ? (localAcceptance ? now : existing?.nextFetchAt ?? now) : null, contentHash: coverage.complete ? stableHash(listing.events) : existing?.contentHash, consecutiveFailures: cancelled || coverage.complete ? 0 : undefined, lastErrorCode: null, lastErrorAt: cancelled || coverage.complete ? null : undefined, metadata: targetMetadata },
            });
            counters.targetsUpserted += 1;
          }
        }
        if (!dryRun && !localAcceptance && counters.pages === TICKETMASTER_LISTING_URLS.length) {
          await prisma.sourceCrawlTarget.updateMany({ where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, lastSeenAt: { lt: now } }, data: { missedDiscoveryCount: { increment: 1 } } });
          await prisma.sourceCrawlTarget.updateMany({ where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, lastSeenAt: { lt: now }, missedDiscoveryCount: { gte: 2 } }, data: { active: false, status: "DISCOVERY_MISSING" } });
        }
      }

      if (phase === "details" || phase === "full") {
        const persistedUrls = detailTargetBatchUrls(run.scope);
        const targets = persistedUrls.length
          ? dryRun
            ? orderPersistedDetailTargets(
                persistedUrls,
                [...discovered.entries()].map(([url, listing]) => ({ id: null, url, contentHash: null, consecutiveFailures: 0, metadata: { listing: listing.events[0], listingEvents: listing.events, discoveredFrom: listing.discoveredFrom } })),
              )
            : orderPersistedDetailTargets(
                persistedUrls,
                await prisma.sourceCrawlTarget.findMany({
                  where: { dataSourceId: source.id, url: { in: persistedUrls } },
                  select: { id: true, url: true, contentHash: true, consecutiveFailures: true, metadata: true },
                }),
              )
          : dryRun && discovered.size
            ? [...discovered.entries()]
                .filter(([, listing]) => !ticketmasterListingCoverage(listing.events).complete)
                .slice(0, maxDetails)
                .map(([url, listing]) => ({ id: null, url, contentHash: null, consecutiveFailures: 0, metadata: { listing: listing.events[0], listingEvents: listing.events, discoveredFrom: listing.discoveredFrom } }))
            : await prisma.sourceCrawlTarget.findMany({
                where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, status: { in: ["PENDING", "FAILED", "RATE_LIMITED", "FETCHED"] }, OR: [{ nextFetchAt: null }, { nextFetchAt: { lte: now } }] },
                orderBy: [{ priority: "asc" }, { nextFetchAt: "asc" }, { firstSeenAt: "asc" }],
                take: maxDetails,
                select: { id: true, url: true, contentHash: true, consecutiveFailures: true, metadata: true },
              });
        if (!persistedUrls.length && options.jobId) {
          await persistDetailTargetBatch(run.id, run.scope, targets.map((target) => target.url));
        }

        for (const target of targets) {
          try {
            const entryUrl = jsonStringArray(jsonRecord(target.metadata).discoveredFrom)[0];
            if (!entryUrl) throw new AdapterError("PARSING_ERROR", `Ticketmaster detail target has no discovery entry URL for ${target.url}`, false);
            const browserResult = await capture(target.url, entryUrl);
            if (!isTicketmasterDetailExtraction(browserResult.extracted) || browserResult.extracted.events.length === 0) {
              if (!dryRun) await this.markArgusEvidenceParserFailure(run.id, browserResult.traceId);
              throw new AdapterError("PARSING_ERROR", `Ticketmaster detail returned no event for ${target.url}`, false);
            }
            const targetUrl = canonicalTicketmasterUrl(target.url);
            const allEvents = normaliseTicketmasterEvents(browserResult.extracted.events)
              .filter((event) => canonicalTicketmasterUrl(event.sourceUrl) === targetUrl);
            if (!allEvents.length) throw new AdapterError("PARSING_ERROR", `Ticketmaster detail could not be normalised for ${target.url}`, false);
            const eligibleEvents = allEvents.filter((event) => event.endsAt >= from && event.startsAt <= to);
            const events = productionCanary ? eligibleEvents.slice(0, Math.max(0, 2 - counters.eventsPersisted)) : eligibleEvents;
            if (!dryRun) {
              const persistedEvents = await this.persistNormalisedEvents(events, source.id, run.id);
              counters.unchangedEventsSkipped += [...persistedEvents.values()].filter((persisted) => persisted.unchanged).length;
              const detailContentHash = stableHash(browserResult.extracted);
              const previousUnchangedCount = integerMetadata(target.metadata, "unchangedDetailFetchCount");
              const detailUnchanged = target.contentHash === detailContentHash;
              const unchangedDetailFetchCount = detailUnchanged ? Math.min(4, previousUnchangedCount + 1) : 0;
              if (detailUnchanged) counters.unchangedDetails += 1;
              const refresh = ticketmasterRefreshPolicy(allEvents, now, unchangedDetailFetchCount);
              const cancelled = allEvents.every((event) => event.status === "CANCELLED");
              await prisma.sourceCrawlTarget.update({
                where: { id: target.id! },
                data: { status: cancelled ? "CANCELLED" : "FETCHED", active: refresh.active, priority: refresh.priority, lastFetchedAt: new Date(), nextFetchAt: refresh.nextFetchAt, contentHash: detailContentHash, httpStatus: 200, consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null, metadata: { ...jsonRecord(target.metadata), ticketmasterEventIds: allEvents.map((event) => event.externalId), occurrenceCount: allEvents.length, lastTitle: allEvents[0].title, terminalStatus: cancelled ? "CANCELLED" : null, detailUnchanged, unchangedDetailFetchCount } },
              });
            }
            counters.detailsFetched += 1;
            counters.eventsPersisted += events.length;
          } catch (error) {
            if (error instanceof DeferredJobError) throw error;
            counters.failures += 1;
            const isRateLimited = error instanceof AdapterError && error.code === "RATE_LIMITED";
            if (!dryRun && target.id) {
              const failures = target.consecutiveFailures + 1;
              await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { status: isRateLimited ? "RATE_LIMITED" : "FAILED", consecutiveFailures: failures, nextFetchAt: ticketmasterFailureBackoff(failures, isRateLimited), lastErrorCode: error instanceof AdapterError ? error.code : "BROWSER_CAPTURE_FAILED", lastErrorAt: new Date() } });
            }
            if (isRateLimited) {
              rateLimited = true;
              if (!dryRun) {
                const transition = ticketmasterChallengeTransition(metadata, new Date());
                circuitTransitionApplied = true;
                circuitCooldownUntil = transition.cooldownUntil;
                await prisma.dataSource.update({ where: { id: source.id }, data: { ...(guardedDevelopmentRun ? {} : { operationalStatus: "DEGRADED" as const, healthStatus: "DEGRADED" as const }), metadata: transition.metadata as Prisma.InputJsonValue } });
              }
              break;
            }
          }
        }
      }
      if (!dryRun) counters.rawArtifacts = await prisma.rawArtifact.count({ where: { collectionRunId: run.id } });
      counters.records = counters.detailsFetched;
      return { rateLimited };
    }, this.environment.REDIS_URL);
    if (!options.dryRun && !collectionResult.rateLimited && (counters.pages > 0 || counters.detailsFetched > 0) && circuit.challengeCount > 0) {
      await prisma.dataSource.update({ where: { id: source.id }, data: { metadata: ticketmasterCircuitSuccessMetadata(metadata, new Date()) as Prisma.InputJsonValue } });
      circuitCooldownUntil = null;
    }
    const configurationAfter = sourceConfigurationSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
    const schedulesAfter = await sourceScheduleSnapshot("ticketmaster");
    const scope = { ...initialScope, counters, rateLimited: collectionResult.rateLimited, configurationAfter, configurationUnchanged: stableHash(configurationBefore) === stableHash(configurationAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) };
    const status = counters.failures ? "PARTIAL" : "SUCCEEDED";
    await prisma.$transaction([
      prisma.collectionRun.update({ where: { id: run.id }, data: { status, successCount: counters.eventsPersisted + Math.max(0, counters.targetsUpserted - counters.detailRequestsAvoided), failureCount: counters.failures, errorCode: collectionResult.rateLimited ? "RATE_LIMITED" : counters.failures ? "PARTIAL_FAILURE" : null, errorSummary: collectionResult.rateLimited ? "Collection stopped and entered cooldown after a rate limit or persistent access challenge" : null, scope, finishedAt: new Date() } }),
      ...(guardedDevelopmentRun ? [] : [prisma.dataSource.update({ where: { id: source.id }, data: { lastSuccessAt: counters.pages || counters.detailsFetched ? new Date() : source.lastSuccessAt, healthStatus: counters.failures ? "DEGRADED" : "HEALTHY", operationalStatus: counters.failures ? "DEGRADED" : "HEALTHY", errorRate: counters.requests ? counters.failures / counters.requests : 0 } })]),
    ]);
    if (options.jobId) await settleCancelledCollectionRun(options.jobId);
    await this.syncCollectionIncidentSafely(run.id);
    return { runId: run.id, localAcceptance, developmentBootstrap, dryRun: options.dryRun === true, requestedPhase, phase, halfOpenProbe: circuit.halfOpen, references: counters.pages, records: counters.records, events: counters.eventsPersisted, signals: 0, counters };
  } catch (error) {
    if (error instanceof DeferredJobError) throw error;
    counters.failures += 1;
    if (!options.dryRun) counters.rawArtifacts = await prisma.rawArtifact.count({ where: { collectionRunId: run.id } });
    if (!options.dryRun && error instanceof AdapterError && error.code === "RATE_LIMITED" && !circuit.blocked && !circuitTransitionApplied) {
      const transition = ticketmasterChallengeTransition(metadata, new Date());
      circuitTransitionApplied = true;
      circuitCooldownUntil = transition.cooldownUntil;
      await prisma.dataSource.update({ where: { id: source.id }, data: { ...(guardedDevelopmentRun ? {} : { operationalStatus: "DEGRADED" as const, healthStatus: "DEGRADED" as const }), metadata: transition.metadata as Prisma.InputJsonValue } });
    }
    const configurationAfter = sourceConfigurationSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
    const schedulesAfter = await sourceScheduleSnapshot("ticketmaster");
    const retryable = error instanceof AdapterError && (error.code === "RATE_LIMITED" || error.retryable);
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: counters.failures, errorCode: error instanceof AdapterError ? error.code : "COLLECTION_FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown Ticketmaster collection failure", scope: { ...initialScope, counters, ...(retryable && circuitCooldownUntil ? { cooldownUntil: circuitCooldownUntil.toISOString() } : {}), configurationAfter, configurationUnchanged: stableHash(configurationBefore) === stableHash(configurationAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) }, finishedAt: new Date() } });
    if (options.jobId) await settleCancelledCollectionRun(options.jobId);
    await this.syncCollectionIncidentSafely(run.id);
    throw error;
  }
}

export function assertTicketmasterSourceAllowed(this: WorkerContext, source: Awaited<ReturnType<typeof prisma.dataSource.findUniqueOrThrow>>, localAcceptance: boolean, developmentBootstrap = false, productionCanary = false) {
  if (localAcceptance || developmentBootstrap) {
    this.assertLocalAcceptanceAllowed(source, true);
    return;
  }
  this.assertSourceCollectionAllowed(source, productionCanary);
}
