import { prisma } from "@tymra/db";
import { nzStartOfDay } from "@tymra/domain";
import { AdapterError } from "@tymra/providers/types";
import { dailySourceBudgetExceeded } from "../../../collection/source-budget";
import { withRedisLock } from "@tymra/queue";
import { eventfindaDiscoveryPagePlan, eventfindaListingHasNewInformation, eventfindaFailureBackoff, groupEventfindaListingEvents, eventfindaListingPageUrl, eventfindaPaginationNeedsProbe, eventfindaRefreshPolicy, eventfindaRequestDelayMs, eventfindaUrlHash, normaliseEventfindaDetail, type EventfindaExtraction, type EventfindaListingEvent, type EventfindaListingExtraction } from "../../../collection/eventfinda";
import { type ArgusBrowserTaskResult } from "../../../clients/argus-client";
import { DeferredJobError } from "../../../jobs/deferred-job";
import { settleCancelledCollectionRun } from "../../argus-orchestrator";
import { CollectSourceOptions } from "../contracts";
import { WorkerRequestError } from "../errors";
import { eventfindaDueDetailTargets, sourceScheduleSnapshot, persistDetailTargetBatch } from "./persistence-helpers";
import { sourceConfigurationSnapshot, stableHash, listingPriority, wait, jsonRecord, integerMetadata, detailTargetBatchUrls, orderPersistedDetailTargets } from "../helpers";
import type { WorkerContext } from "../context";

export async function collectEventfindaSource(this: WorkerContext, marketScope: string, analysisRequestId?: string, options: CollectSourceOptions = {}) {
  if (marketScope !== "new-zealand") throw new WorkerRequestError("INVALID_MARKET_SCOPE", "Eventfinda browser collection currently supports New Zealand only", 422);
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "eventfinda" } });
  const phase = options.phase ?? "full";
  const localAcceptance = options.localAcceptance === true;
  const developmentBootstrap = options.developmentBootstrap === true;
  const productionCanary = options.productionCanary === true;
  const pilotMetadata = jsonRecord(source.metadata);
  if (productionCanary && (this.environment.NODE_ENV !== "production" || localAcceptance
    || developmentBootstrap || options.dryRun || options.phase || options.maxPages || options.maxDetails
    || options.limit !== 2 || pilotMetadata.boundedProductionCanary !== true)) {
    throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Eventfinda canary requires the approved two-record direct-public pilot", 422);
  }
  if (localAcceptance && developmentBootstrap) throw new WorkerRequestError("INVALID_COLLECTION_MODE", "Choose either local acceptance or development bootstrap", 422);
  const guardedDevelopmentRun = localAcceptance || developmentBootstrap;
  const now = new Date();
  const from = options.from ?? new Date(now.getTime() - 7 * 86_400_000);
  const requestedTo = options.to ?? new Date(now.getTime() + 400 * 86_400_000);
  const to = productionCanary ? new Date(Math.min(requestedTo.getTime(), from.getTime() + 31 * 86_400_000)) : requestedTo;
  if (productionCanary && (to <= from || Math.abs(from.getTime() - now.getTime()) > 8 * 86_400_000)) {
    throw new WorkerRequestError("INVALID_COLLECTION_RANGE", "Eventfinda canary requires a current 31-day window", 422);
  }
  const maxPages = localAcceptance || productionCanary
    ? Math.min(options.maxPages ?? 1, 1)
    : Math.min(options.maxPages ?? this.environment.EVENTFINDA_DISCOVERY_MAX_PAGES, this.environment.EVENTFINDA_DISCOVERY_MAX_PAGES);
  const maxDetails = localAcceptance || productionCanary
    ? Math.min(options.maxDetails ?? options.limit ?? 2, 2)
    : Math.min(options.maxDetails ?? options.limit ?? this.environment.EVENTFINDA_DETAIL_BATCH_SIZE, this.environment.EVENTFINDA_DETAIL_BATCH_SIZE, 500);
  const maxRecords = Math.min(5_000, Math.max(1, Math.trunc(options.limit ?? 5_000)));
  const dryRun = options.dryRun === true;
  const configurationBefore = sourceConfigurationSnapshot(source);
  const schedulesBefore = await sourceScheduleSnapshot("eventfinda");
  const savedDiscoveryPage = pilotMetadata.eventfindaDiscoveryNextPage;
  const discoveryNextPage = typeof savedDiscoveryPage === "number" && Number.isInteger(savedDiscoveryPage) ? savedDiscoveryPage : 2;
  const initialScope = { marketScope, sourceId: "eventfinda", phase, from: from.toISOString(), to: to.toISOString(), maxPages, maxDetails, maxRecords, discoveryNextPage, dryRun, localAcceptance, developmentBootstrap, productionCanary, configurationBefore, schedulesBefore };
  const run = await this.resumeOrCreateBrowserCollectionRun(options.jobId, source.id, analysisRequestId, initialScope, now);

  try {
    this.assertEventfindaSourceAllowed(source, localAcceptance, developmentBootstrap, productionCanary);
    const metadata = jsonRecord(source.metadata);
    const cooldownUntil = typeof metadata.collectionCooldownUntil === "string" ? new Date(metadata.collectionCooldownUntil) : null;
    if (cooldownUntil && !Number.isNaN(cooldownUntil.getTime()) && cooldownUntil > now) {
      throw new AdapterError("RATE_LIMITED", `Eventfinda collection is cooling down until ${cooldownUntil.toISOString()}`, true);
    }
    const result = await withRedisLock("source:eventfinda", 60 * 60_000, async () => {
      const usedToday = this.environment.NODE_ENV === "development" ? 0 : await prisma.rawArtifact.count({ where: { dataSourceId: source.id, artifactType: "HTML", createdAt: { gte: nzStartOfDay(now) } } });
      let requests = 0;
      let lastRequestAt = 0;
      let rateLimited = false;
      let failureCount = 0;
      let retryCount = 0;
      const discovered = new Map<string, { events: EventfindaListingEvent[]; discoveredFrom: string[] }>();
      let pagesScanned = 0;
      let totalPages = 0;
      let paginationUnverified = false;
      let listingCards = 0;
      let discoveryPages: number[] = [];
      let nextDiscoveryPage = discoveryNextPage;
      let duplicateDetailTargetsAvoided = 0;
      let targetsUpserted = 0;
      let detailsFetched = 0;
      let unchangedDetails = 0;
      let eventsPersisted = 0;
      let unchangedEventsSkipped = 0;

      const capture = async (url: string): Promise<ArgusBrowserTaskResult> => {
        const maxAttempts = productionCanary || localAcceptance ? 1 : 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            if (dailySourceBudgetExceeded(this.environment.NODE_ENV, usedToday, requests, 1, this.environment.EVENTFINDA_DAILY_REQUEST_BUDGET)) {
              throw new AdapterError("DAILY_BUDGET_EXHAUSTED", "Eventfinda daily request budget has been reached", false);
            }
            if (lastRequestAt) {
              const delay = eventfindaRequestDelayMs(this.environment.EVENTFINDA_MIN_DELAY_MS, this.environment.EVENTFINDA_DELAY_JITTER_MS);
              await wait(Math.max(0, delay - (Date.now() - lastRequestAt)));
            }
            lastRequestAt = Date.now();
            requests += 1;
            const browserResult = await this.executeEventfindaBrowserTask(source.id, run.id, url, dryRun, options.jobId);
            if (!browserResult.extracted || typeof browserResult.extracted !== "object") {
              if (!dryRun) await this.markArgusEvidenceParserFailure(run.id, browserResult.traceId);
              throw new AdapterError("PARSING_ERROR", `Eventfinda extractor returned no data for ${url}`, false);
            }
            return browserResult;
          } catch (error) {
            const retryable = error instanceof AdapterError && error.retryable && error.code !== "RATE_LIMITED";
            if (!retryable || attempt === maxAttempts) throw error;
            retryCount += 1;
            await wait(attempt * 30_000);
          }
        }
        throw new AdapterError("SOURCE_UNAVAILABLE", `Eventfinda capture exhausted retries for ${url}`, true);
      };

      if (phase === "discovery" || phase === "full") {
        const firstCapture = await capture(eventfindaListingPageUrl(1));
        const first = firstCapture.extracted as EventfindaExtraction;
        if (first.kind !== "listing") throw new AdapterError("PARSING_ERROR", "Eventfinda nationwide listing returned an unexpected page", false);
        totalPages = first.totalPages;
        paginationUnverified = eventfindaPaginationNeedsProbe(first);
        let second: EventfindaListingExtraction | null = null;
        if (paginationUnverified && maxPages > 1) {
          const probe = (await capture(eventfindaListingPageUrl(2))).extracted as EventfindaExtraction;
          if (probe.kind !== "listing" || probe.currentPage !== 2 || probe.totalPages < 2 || probe.events.length === 0) {
            throw new AdapterError("SOURCE_UNAVAILABLE", "Eventfinda pagination disappeared from a full listing response and page 2 could not verify the collection boundary", true);
          }
          second = probe;
          totalPages = probe.totalPages;
          paginationUnverified = false;
        }
        const startPage = jsonRecord(run.scope).discoveryNextPage;
        const pagePlan = eventfindaDiscoveryPagePlan(totalPages, maxPages,
          second ? 2 : typeof startPage === "number" ? startPage : discoveryNextPage);
        discoveryPages = pagePlan.pages;
        nextDiscoveryPage = pagePlan.nextPage;
        for (const page of pagePlan.pages) {
          const extraction = page === 1 ? first : page === 2 && second ? second : (await capture(eventfindaListingPageUrl(page))).extracted as EventfindaExtraction;
          if (extraction.kind !== "listing" || extraction.currentPage !== page) throw new AdapterError("PARSING_ERROR", `Eventfinda listing page ${page} could not be verified`, false);
          pagesScanned += 1;
          const listingGroups = groupEventfindaListingEvents(extraction.events);
          listingCards += listingGroups.reduce((count, group) => count + group.events.length, 0);
          for (const group of listingGroups) {
            if (productionCanary && !discovered.has(group.url) && discovered.size >= 2) continue;
            if (!discovered.has(group.url) && discovered.size >= maxRecords) continue;
            const current = discovered.get(group.url);
            const merged = groupEventfindaListingEvents([...(current?.events ?? []), ...group.events])[0]?.events ?? group.events;
            discovered.set(group.url, {
              events: merged,
              discoveredFrom: [...new Set([...(current?.discoveredFrom ?? []), extraction.canonicalUrl])],
            });
          }
        }
        duplicateDetailTargetsAvoided = Math.max(0, listingCards - discovered.size);
        if (!dryRun && discovered.size) {
          const hashes = [...discovered.keys()].map(eventfindaUrlHash);
          const existingTargets = await prisma.sourceCrawlTarget.findMany({
            where: { dataSourceId: source.id, urlHash: { in: hashes } },
            select: { urlHash: true, status: true, lastFetchedAt: true, nextFetchAt: true, metadata: true },
          });
          const existingByHash = new Map(existingTargets.map((target) => [target.urlHash, target]));
          for (const [url, listing] of discovered) {
            const urlHash = eventfindaUrlHash(url);
            const existing = existingByHash.get(urlHash);
            const listingContentHash = stableHash(listing.events);
            const previousMetadata = jsonRecord(existing?.metadata);
            const previousObservations = previousMetadata.listingObservations;
            const knownObservations = Array.isArray(previousObservations) ? previousObservations as EventfindaListingEvent[] : [];
            const observedChange = Array.isArray(previousObservations)
              ? eventfindaListingHasNewInformation(knownObservations, listing.events)
              : typeof previousMetadata.listingContentHash === "string" && previousMetadata.listingContentHash !== listingContentHash;
            const listingChanged = previousMetadata.listingChanged === true || observedChange;
            const shouldFetchNow = localAcceptance || !existing?.lastFetchedAt || listingChanged;
            const mergedObservations = groupEventfindaListingEvents([...knownObservations, ...listing.events])[0]?.events ?? listing.events;
            const targetMetadata = {
              ...previousMetadata,
              listing: listing.events[0],
              listingObservations: mergedObservations,
              listingContentHash,
              listingChanged,
              detailBlockedReason: observedChange ? null : previousMetadata.detailBlockedReason ?? null,
              discoveredFrom: listing.discoveredFrom,
              listingOccurrenceCount: listing.events.length,
            };
            await prisma.sourceCrawlTarget.upsert({
              where: { dataSourceId_urlHash: { dataSourceId: source.id, urlHash } },
              create: { dataSourceId: source.id, url, urlHash, kind: "EVENT_DETAIL", status: "PENDING", priority: listingPriority(listing.events[0]?.startsAt, now), active: true, lastSeenAt: now, nextFetchAt: now, metadata: targetMetadata },
              update: { url, status: listingChanged || existing?.status === "DISCOVERY_MISSING" ? "PENDING" : existing?.status ?? "PENDING", priority: listingPriority(listing.events[0]?.startsAt, now), active: true, lastSeenAt: now, missedDiscoveryCount: 0, nextFetchAt: shouldFetchNow ? now : existing?.nextFetchAt, lastErrorCode: listingChanged ? null : undefined, lastErrorAt: listingChanged ? null : undefined, consecutiveFailures: listingChanged ? 0 : undefined, metadata: targetMetadata },
            });
            targetsUpserted += 1;
          }
        }
        if (!dryRun && !localAcceptance && !paginationUnverified && pagesScanned === totalPages) {
          await prisma.sourceCrawlTarget.updateMany({ where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, lastSeenAt: { lt: now } }, data: { missedDiscoveryCount: { increment: 1 } } });
          await prisma.sourceCrawlTarget.updateMany({ where: { dataSourceId: source.id, kind: "EVENT_DETAIL", active: true, lastSeenAt: { lt: now }, missedDiscoveryCount: { gte: 2 } }, data: { active: false, status: "DISCOVERY_MISSING" } });
        }
            if (!dryRun && !guardedDevelopmentRun && !productionCanary && !paginationUnverified && pagePlan.pages.length > 1) {
          const currentSource = await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id }, select: { metadata: true } });
          await prisma.dataSource.update({ where: { id: source.id }, data: {
            metadata: { ...jsonRecord(currentSource.metadata), eventfindaDiscoveryNextPage: nextDiscoveryPage },
          } });
        }
      }

      if (phase === "details" || phase === "full") {
        const persistedUrls = detailTargetBatchUrls(run.scope);
        const targets = persistedUrls.length
          ? dryRun
            ? orderPersistedDetailTargets(
                persistedUrls,
                [...discovered.entries()].map(([url, listing]) => ({ id: null, url, contentHash: null, consecutiveFailures: 0, metadata: { listing: listing.events[0], listingObservations: listing.events } })),
              )
            : orderPersistedDetailTargets(
                persistedUrls,
                await prisma.sourceCrawlTarget.findMany({
                  where: { dataSourceId: source.id, url: { in: persistedUrls } },
                  select: { id: true, url: true, contentHash: true, consecutiveFailures: true, metadata: true },
                }),
              )
          : dryRun && discovered.size
            ? [...discovered.entries()].slice(0, maxDetails).map(([url, listing]) => ({ id: null, url, contentHash: null, consecutiveFailures: 0, metadata: { listing: listing.events[0], listingObservations: listing.events } }))
            : await eventfindaDueDetailTargets(source.id, now, maxDetails);
        if (!persistedUrls.length && options.jobId) {
          await persistDetailTargetBatch(run.id, run.scope, targets.map((target) => target.url));
        }

        for (const target of targets) {
          try {
            const browserResult = await capture(target.url);
            const extraction = browserResult.extracted as EventfindaExtraction;
            if (extraction.kind !== "event_detail" || extraction.occurrences.length === 0) {
              if (!dryRun) await this.markArgusEvidenceParserFailure(run.id, browserResult.traceId);
              throw new AdapterError("PARSING_ERROR", `Eventfinda detail returned no occurrences for ${target.url}`, false);
            }
            const listing = jsonRecord(jsonRecord(target.metadata).listing);
            const allEvents = normaliseEventfindaDetail(extraction, listing);
            const eligibleEvents = allEvents.filter((event) => event.endsAt >= from && event.startsAt <= to);
            const events = productionCanary ? eligibleEvents.slice(0, Math.max(0, 2 - eventsPersisted)) : eligibleEvents;
            if (eventsPersisted + events.length > maxRecords) {
              throw new AdapterError("RECORD_LIMIT_EXCEEDED", "Eventfinda detail exceeds the approved collection record limit", false);
            }
            if (!dryRun) {
              const persistedEvents = await this.persistNormalisedEvents(events, source.id, run.id);
              unchangedEventsSkipped += [...persistedEvents.values()].filter((persisted) => persisted.unchanged).length;
              const detailContentHash = stableHash(extraction);
              const previousUnchangedCount = integerMetadata(target.metadata, "unchangedDetailFetchCount");
              const detailUnchanged = target.contentHash === detailContentHash;
              const unchangedDetailFetchCount = detailUnchanged ? Math.min(4, previousUnchangedCount + 1) : 0;
              if (detailUnchanged) unchangedDetails += 1;
              const refresh = eventfindaRefreshPolicy(allEvents, now, unchangedDetailFetchCount);
              await prisma.sourceCrawlTarget.update({
                where: { id: target.id! },
                data: { status: "FETCHED", active: refresh.active, priority: refresh.priority, lastFetchedAt: new Date(), nextFetchAt: refresh.nextFetchAt, contentHash: detailContentHash, httpStatus: 200, consecutiveFailures: 0, lastErrorCode: null, lastErrorAt: null, metadata: { ...jsonRecord(target.metadata), eventfindaEventId: extraction.eventId, occurrenceCount: extraction.occurrences.length, lastTitle: extraction.title, listingChanged: false, detailBlockedReason: null, detailUnchanged, unchangedDetailFetchCount } },
              });
            }
            detailsFetched += 1;
            eventsPersisted += events.length;
          } catch (error) {
            if (error instanceof DeferredJobError) throw error;
            failureCount += 1;
            const isRateLimited = error instanceof AdapterError && error.code === "RATE_LIMITED";
            const isOversized = error instanceof AdapterError && error.code === "ARTIFACT_TOO_LARGE";
            if (error instanceof AdapterError && error.code === "RECORD_LIMIT_EXCEEDED") throw error;
            if (!dryRun && target.id) {
              const failures = target.consecutiveFailures + 1;
              await prisma.sourceCrawlTarget.update({ where: { id: target.id }, data: { status: isRateLimited ? "RATE_LIMITED" : "FAILED", consecutiveFailures: failures, nextFetchAt: isOversized ? new Date(Date.now() + 30 * 86_400_000) : eventfindaFailureBackoff(failures, isRateLimited), lastErrorCode: error instanceof AdapterError ? error.code : "BROWSER_CAPTURE_FAILED", lastErrorAt: new Date(), ...(isOversized ? { metadata: { ...jsonRecord(target.metadata), listingChanged: false, detailBlockedReason: "ARTIFACT_TOO_LARGE" } } : {}) } });
            }
            if (isRateLimited) {
              rateLimited = true;
              const collectionCooldownUntil = eventfindaFailureBackoff(1, true);
              if (!dryRun) {
                const currentSource = await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id }, select: { metadata: true } });
                await prisma.dataSource.update({ where: { id: source.id }, data: { ...(guardedDevelopmentRun ? {} : { operationalStatus: "DEGRADED" as const, healthStatus: "DEGRADED" as const }), metadata: { ...jsonRecord(currentSource.metadata), collectionCooldownUntil: collectionCooldownUntil.toISOString(), collectionCooldownReason: "RATE_LIMITED_OR_CHALLENGE" } } });
              }
              break;
            }
          }
        }
      }

      return { requests, retryCount, pagesScanned, totalPages, paginationUnverified, discoveryPages, nextDiscoveryPage, listingCards, discovered: discovered.size, duplicateDetailTargetsAvoided, targetsUpserted, detailsFetched, unchangedDetails, eventsPersisted, unchangedEventsSkipped, failureCount, rateLimited };
    }, this.environment.REDIS_URL);

    const status = result.failureCount > 0 ? "PARTIAL" : "SUCCEEDED";
    const configurationAfter = sourceConfigurationSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
    const schedulesAfter = await sourceScheduleSnapshot("eventfinda");
    const finalScope = { ...initialScope, ...result, configurationAfter, configurationUnchanged: stableHash(configurationBefore) === stableHash(configurationAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) };
    await prisma.$transaction([
      prisma.collectionRun.update({ where: { id: run.id }, data: { status, successCount: result.eventsPersisted + result.discovered, failureCount: result.failureCount, errorCode: result.rateLimited ? "RATE_LIMITED" : result.failureCount ? "PARTIAL_FAILURE" : null, errorSummary: result.rateLimited ? "Collection stopped and entered cooldown after a rate limit or access challenge" : null, finishedAt: new Date(), scope: finalScope } }),
      ...(guardedDevelopmentRun ? [] : [prisma.dataSource.update({ where: { id: source.id }, data: { lastSuccessAt: result.pagesScanned || result.detailsFetched ? new Date() : source.lastSuccessAt, healthStatus: result.rateLimited ? "DEGRADED" : "HEALTHY", operationalStatus: result.rateLimited ? "DEGRADED" : "HEALTHY", errorRate: result.requests ? result.failureCount / result.requests : 0 } })]),
    ]);
    if (options.jobId) await settleCancelledCollectionRun(options.jobId);
    await this.syncCollectionIncidentSafely(run.id);
    return { runId: run.id, dryRun, localAcceptance, developmentBootstrap, phase, references: result.pagesScanned, records: result.detailsFetched, events: result.eventsPersisted, signals: 0, ...result };
  } catch (error) {
    if (error instanceof DeferredJobError) throw error;
    if (!dryRun && error instanceof AdapterError && error.code === "RATE_LIMITED") {
      const collectionCooldownUntil = eventfindaFailureBackoff(1, true);
      const currentSource = await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id }, select: { metadata: true } });
      await prisma.dataSource.update({ where: { id: source.id }, data: { ...(guardedDevelopmentRun ? {} : { operationalStatus: "DEGRADED" as const, healthStatus: "DEGRADED" as const }), metadata: { ...jsonRecord(currentSource.metadata), collectionCooldownUntil: collectionCooldownUntil.toISOString(), collectionCooldownReason: "RATE_LIMITED_OR_CHALLENGE" } } });
    }
    const configurationAfter = sourceConfigurationSnapshot(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } }));
    const schedulesAfter = await sourceScheduleSnapshot("eventfinda");
    const [requestsAttempted, successfulPages, targetsTouched] = await Promise.all([
      prisma.rawArtifact.count({ where: { collectionRunId: run.id, artifactType: "MANIFEST_JSON" } }),
      prisma.rawArtifact.count({ where: { collectionRunId: run.id, artifactType: "HTML", parserFailure: false } }),
      prisma.sourceCrawlTarget.count({ where: { dataSourceId: source.id, lastSeenAt: { gte: now } } }),
    ]);
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: error instanceof AdapterError ? error.code : error instanceof WorkerRequestError ? error.code : "COLLECTION_FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown Eventfinda collection failure", scope: { ...initialScope, failureProgress: { requestsAttempted, successfulPages, targetsTouched }, configurationAfter, configurationUnchanged: stableHash(configurationBefore) === stableHash(configurationAfter), schedulesAfter, schedulesUnchanged: stableHash(schedulesBefore) === stableHash(schedulesAfter) }, finishedAt: new Date() } });
    if (options.jobId) await settleCancelledCollectionRun(options.jobId);
    await this.syncCollectionIncidentSafely(run.id);
    throw error;
  }
}

export function assertEventfindaSourceAllowed(this: WorkerContext, source: Awaited<ReturnType<typeof prisma.dataSource.findUniqueOrThrow>>, localAcceptance = false, developmentBootstrap = false, productionCanary = false) {
  if (localAcceptance || developmentBootstrap) {
    const mode = developmentBootstrap ? "development bootstrap" : "local acceptance";
    if (this.environment.NODE_ENV !== "development") throw new AdapterError("CONFIGURATION_ERROR", developmentBootstrap ? "Eventfinda development bootstrap is restricted to the development environment" : "Local Eventfinda acceptance is restricted to the development environment", false);
    if (!source.enabled || !source.environments.includes("DEVELOPMENT")) throw new AdapterError("CONFIGURATION_ERROR", `Eventfinda is not enabled for ${mode}`, false);
    return;
  }
  this.assertSourceCollectionAllowed(source, productionCanary);
}
