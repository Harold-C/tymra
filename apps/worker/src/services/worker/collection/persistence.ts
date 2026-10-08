import { prisma, Prisma } from "@tymra/db";
import { evaluateEventImpactEvidence, mergeEventImpactEvidence } from "@tymra/domain";
import { AdapterError, type PublicEvent, type PublicSignal } from "@tymra/providers/types";
import { otaCollectRatesExtractionSchema } from "@tymra/providers/ota-argus-contracts";
import { mapSignalType } from "../../../collection/market-signal-type";
import { enrichEventVenue } from "../../../collection/venue-reference";
import { eventfindaEvidenceTtlHours } from "../../../collection/eventfinda";
import { canonicalEventKey, canonicalEventOccurrenceKey, canonicalVenueKey, eventDescription, sourceEventIdentity } from "../../../collection/event-canonicalisation";
import { type ArgusEventSourceId } from "../../../collection/school-sport-ticketek";
import { ACTIVE_OTA_SOURCE_KEYS, otaArtifactIsParserFailure } from "../../../operations/ota-health";
import { type ArgusBrowserTaskResult } from "../../../clients/argus-client";
import { EventPersistenceCache } from "../contracts";
import { inferredTimePrecision, impactEvidenceForHash, withEventImpact, createEventPersistenceCache, eventSeriesRepresentative, stableId, stableHash, jsonRecord, eventSignal } from "../helpers";
import type { WorkerContext } from "../context";

export async function persistNormalisedSignal(this: WorkerContext, signal: PublicSignal, dataSourceId: string, collectionRunId: string, defaultMarketKey: string, eventOccurrenceId?: string) {
  const seenAt = new Date();
  const signalType = mapSignalType(signal.type);
  const marketKey = signal.marketKey ?? defaultMarketKey;
  const signalMetadata = (signal.metadata ?? {}) as Prisma.InputJsonValue;
  const sourceContent = {
    marketKey, type: signalType, title: signal.title, region: signal.region,
    startsAt: signal.startsAt.toISOString(), endsAt: signal.endsAt.toISOString(),
    direction: signal.direction, confidence: signal.confidence, evidenceRef: signal.evidenceRef,
    metadata: signal.metadata ?? {},
  };
  const contentHash = stableHash(sourceContent);
  const existing = await prisma.sourceMarketSignal.findUnique({
    where: { dataSourceId_externalId: { dataSourceId, externalId: signal.externalId } },
    include: { canonicalLink: { include: { marketSignal: true } } },
  });
  if (existing?.contentHash === contentHash && existing.canonicalLink && existing.canonicalLink.marketSignal.eventOccurrenceId === (eventOccurrenceId ?? null)) {
    const sourceSignal = await prisma.sourceMarketSignal.update({
      where: { id: existing.id },
      data: { lastCollectionRunId: collectionRunId, lastSeenAt: seenAt },
    });
    return { sourceSignal, canonical: existing.canonicalLink.marketSignal, link: existing.canonicalLink, unchanged: true };
  }
  return prisma.$transaction(async (tx) => {
    if (existing && existing.contentHash !== contentHash && !await tx.publicFactVersion.findFirst({
      where: { dataSourceId, factKind: "MARKET_SIGNAL", externalId: signal.externalId, contentHash: existing.contentHash },
      select: { id: true },
    })) {
      await tx.publicFactVersion.upsert({
        where: { idempotencyKey: stableId("public-fact-baseline", `${existing.id}:${existing.contentHash}`) },
        create: {
          idempotencyKey: stableId("public-fact-baseline", `${existing.id}:${existing.contentHash}`),
          dataSourceId, collectionRunId: existing.lastCollectionRunId, factKind: "MARKET_SIGNAL",
          externalId: signal.externalId, contentHash: existing.contentHash,
          observedAt: existing.lastSeenAt, startsAt: existing.startsAt, endsAt: existing.endsAt,
          payload: {
            marketKey: existing.marketKey, type: existing.type, title: existing.title, region: existing.region,
            startsAt: existing.startsAt.toISOString(), endsAt: existing.endsAt.toISOString(),
            direction: existing.direction, confidence: existing.confidence, evidenceRef: existing.evidenceRef,
            metadata: existing.metadata,
          } as Prisma.InputJsonValue,
          isDemo: existing.isDemo,
        },
        update: {},
      });
    }
    const sourceSignal = await tx.sourceMarketSignal.upsert({
      where: { dataSourceId_externalId: { dataSourceId, externalId: signal.externalId } },
      create: {
        dataSourceId, lastCollectionRunId: collectionRunId, externalId: signal.externalId,
        marketKey, type: signalType, title: signal.title, region: signal.region,
        startsAt: signal.startsAt, endsAt: signal.endsAt, direction: signal.direction,
        confidence: signal.confidence, evidenceRef: signal.evidenceRef,
        contentHash, metadata: { canonicalisationVersion: "source-isolated-signal-v1", signal: signalMetadata },
        isDemo: signal.fixture || this.environment.NODE_ENV === "test", lastSeenAt: seenAt,
      },
      update: {
        lastCollectionRunId: collectionRunId, marketKey, type: signalType, title: signal.title,
        region: signal.region, startsAt: signal.startsAt, endsAt: signal.endsAt,
        direction: signal.direction, confidence: signal.confidence, evidenceRef: signal.evidenceRef,
        contentHash, metadata: { canonicalisationVersion: "source-isolated-signal-v1", signal: signalMetadata }, lastSeenAt: seenAt,
      },
    });
    await tx.publicFactVersion.upsert({
      where: { idempotencyKey: stableId("public-fact-version", `${collectionRunId}:MARKET_SIGNAL:${dataSourceId}:${signal.externalId}:${contentHash}`) },
      create: {
        idempotencyKey: stableId("public-fact-version", `${collectionRunId}:MARKET_SIGNAL:${dataSourceId}:${signal.externalId}:${contentHash}`),
        dataSourceId, collectionRunId, factKind: "MARKET_SIGNAL", externalId: signal.externalId,
        contentHash, observedAt: seenAt, startsAt: signal.startsAt, endsAt: signal.endsAt,
        payload: sourceContent as Prisma.InputJsonValue, isDemo: signal.fixture || this.environment.NODE_ENV === "test",
      },
      update: {},
    });
  const existingLink = await tx.marketSignalSourceLink.findUnique({ where: { sourceMarketSignalId: sourceSignal.id }, select: { marketSignalId: true } });
  const canonicalId = existingLink?.marketSignalId
    ?? stableId("signal", eventOccurrenceId ? `event-occurrence:${eventOccurrenceId}` : `${dataSourceId}:${signal.externalId}`);
  const evidence = { title: signal.title, direction: signal.direction, confidence: signal.confidence, evidenceRef: signal.evidenceRef, metadata: signalMetadata } as Prisma.InputJsonValue;
  const canonical = await tx.marketSignal.upsert({
      where: { id: canonicalId },
      create: { id: canonicalId, marketKey, type: signalType, region: signal.region, startsAt: signal.startsAt, endsAt: signal.endsAt, dataSourceId, eventOccurrenceId, status: "CONFIRMED", evidence, isDemo: signal.fixture || this.environment.NODE_ENV === "test" },
      update: { marketKey, type: signalType, region: signal.region, startsAt: signal.startsAt, endsAt: signal.endsAt, dataSourceId, eventOccurrenceId, status: "CONFIRMED", evidence },
    });
  const link = await tx.marketSignalSourceLink.upsert({
      where: { sourceMarketSignalId: sourceSignal.id },
      create: { marketSignalId: canonical.id, sourceMarketSignalId: sourceSignal.id, matchMethod: "SOURCE_ISOLATED_IDENTITY_V1", matchConfidence: 1, evidence: { sourceExternalId: signal.externalId } },
      update: { marketSignalId: canonical.id, matchMethod: "SOURCE_ISOLATED_IDENTITY_V1", matchConfidence: 1, reviewStatus: "AUTO_ACCEPTED", evidence: { sourceExternalId: signal.externalId } },
    });
  return { sourceSignal, canonical, link, unchanged: false };
  });
}

export async function persistDirectHttpEvidence(this: WorkerContext, dataSourceId: string, collectionRunId: string, traceId: string, extractor: string, requestedUrl: string, finalUrl: string, html: string, parserFailure: boolean) {
  const id = stableId("http-evidence", `${collectionRunId}:${requestedUrl}`);
  await prisma.rawArtifact.upsert({
    where: { id },
    create: {
      id,
      collectionRunId,
      dataSourceId,
      artifactType: "HTML",
      storageRef: `postgres:RawArtifact:${id}`,
      contentHash: stableHash(html),
      payload: { traceId, extractor, requestedUrl, finalUrl, html } as Prisma.InputJsonValue,
      containsSensitiveData: false,
      parserFailure,
      expiresAt: new Date(Date.now() + (parserFailure ? this.environment.RAW_ARTIFACT_FAILURE_TTL_HOURS : this.environment.RAW_ARTIFACT_TTL_HOURS) * 3_600_000),
    },
    update: {},
  });
}

export async function persistArgusConnectorPayload(this: WorkerContext, dataSourceId: string, collectionRunId: string, result: ArgusBrowserTaskResult, sourceId: ArgusEventSourceId, requestedUrl: string) {
  const id = stableId("argus-connector-payload", `${collectionRunId}:${result.traceId}`);
  const payload = {
    traceId: result.traceId,
    sourceId,
    requestedUrl,
    page: result.page,
    extracted: result.extracted,
  } as Prisma.InputJsonValue;
  await prisma.rawArtifact.upsert({
    where: { id },
    create: {
      id,
      collectionRunId,
      dataSourceId,
      artifactType: "MANIFEST_JSON",
      storageRef: `postgres:RawArtifact:${id}`,
      contentHash: stableHash(payload),
      payload,
      containsSensitiveData: false,
      parserFailure: false,
      expiresAt: new Date(Date.now() + this.environment.RAW_ARTIFACT_TTL_HOURS * 3_600_000),
    },
    update: {},
  });
}

export async function persistArgusEvidence(this: WorkerContext, dataSourceId: string, collectionRunId: string, result: ArgusBrowserTaskResult, extractor: string, requestedUrl: string) {
  const publicOta = ACTIVE_OTA_SOURCE_KEYS.some((key) => extractor === `${key}-public`);
  const parserFailure = publicOta ? otaArtifactIsParserFailure(result.error?.category) : result.status !== "success";
  const extraction = publicOta && result.status === "success" ? otaCollectRatesExtractionSchema.safeParse(result.extracted) : null;
  const otaReferenceRates = extraction?.success && extractor === `${extraction.data.provider}-public`
    ? extraction.data.rates.filter((rate) => rate.sourceListingId === extraction.data.sourceListingId && rate.referencePrices?.length).map((rate) => ({
      sourceListingId: rate.sourceListingId, unitExternalId: rate.unitExternalId, checkIn: rate.checkIn, checkOut: rate.checkOut,
      currency: rate.currency, availabilityStatus: rate.availabilityStatus, rateFence: rate.rateFence,
      adults: rate.adults ?? null, children: rate.children ?? null, units: rate.units ?? null,
      referencePrices: rate.referencePrices, collectedAt: rate.collectedAt,
    })) : [];
  const ttlHours = eventfindaEvidenceTtlHours(
    result.status,
    this.environment.RAW_ARTIFACT_TTL_HOURS,
    this.environment.RAW_ARTIFACT_FAILURE_TTL_HOURS,
  );
  for (const artifact of result.evidence) {
    const storageRef = artifact.storageRef;
    const id = stableId("argus-evidence", `${collectionRunId}:${storageRef}`);
    await prisma.rawArtifact.upsert({
      where: { id },
      create: { id, collectionRunId, dataSourceId, artifactType: artifact.kind.toUpperCase(), storageRef, contentHash: artifact.sha256, payload: { traceId: artifact.traceId, kind: artifact.kind, sizeBytes: artifact.sizeBytes, page: result.page, extractor, requestedUrl: requestedUrl ?? result.page?.finalUrl ?? null, ...(otaReferenceRates.length ? { otaReferenceRates } : {}) } as Prisma.InputJsonValue, containsSensitiveData: artifact.containsSensitiveData, parserFailure, expiresAt: new Date(Date.now() + ttlHours * 3_600_000) },
      update: {},
    });
  }
}

export async function markArgusEvidenceParserFailure(this: WorkerContext, collectionRunId: string, traceId: string) {
  await prisma.rawArtifact.updateMany({
    where: {
      collectionRunId,
      OR: [
        { storageRef: { startsWith: `argus-evidence:results/argus/${traceId}/` } },
        { storageRef: { startsWith: `tymra-evidence:${traceId}/` } },
      ],
    },
    data: { parserFailure: true, expiresAt: new Date(Date.now() + this.environment.RAW_ARTIFACT_FAILURE_TTL_HOURS * 3_600_000) },
  });
}

export async function persistNormalisedEvent(this: WorkerContext, event: PublicEvent, dataSourceId: string, collectionRunId: string) {
  const persisted = await this.persistNormalisedEventCached(event, event, dataSourceId, collectionRunId, createEventPersistenceCache());
  await this.persistEventSignals(persisted.normalisedEvent, dataSourceId, collectionRunId, persisted.eventOccurrence.id);
  return persisted;
}

export async function persistNormalisedEvents(this: WorkerContext, events: PublicEvent[], dataSourceId: string, collectionRunId: string) {
  const cache = createEventPersistenceCache();
  const persisted = new Map<string, Awaited<ReturnType<WorkerContext["persistNormalisedEventCached"]>>>();
  const series = new Map<string, PublicEvent[]>();
  for (const event of events) {
    const identity = sourceEventIdentity(event).externalId;
    series.set(identity, [...(series.get(identity) ?? []), event]);
  }
  for (const occurrences of series.values()) {
    const seriesEvent = eventSeriesRepresentative(occurrences);
    for (const event of occurrences) {
      const item = await this.persistNormalisedEventCached(event, seriesEvent, dataSourceId, collectionRunId, cache);
      await this.persistEventSignals(item.normalisedEvent, dataSourceId, collectionRunId, item.eventOccurrence.id);
      persisted.set(event.externalId, item);
    }
  }
  return persisted;
}

export async function persistEventSignals(this: WorkerContext, event: PublicEvent, dataSourceId: string, collectionRunId: string, eventOccurrenceId: string) {
  const signals = eventSignal(event);
  for (const signal of signals) {
    await this.persistNormalisedSignal(signal, dataSourceId, collectionRunId, signal.marketKey ?? "new-zealand", eventOccurrenceId);
  }
  if (!signals.length) {
    const existing = await prisma.sourceMarketSignal.findUnique({
      where: { dataSourceId_externalId: { dataSourceId, externalId: `event:${event.externalId}` } },
      include: { canonicalLink: true },
    });
    if (existing?.canonicalLink) {
      await prisma.$transaction([
        prisma.sourceMarketSignal.update({ where: { id: existing.id }, data: { lastCollectionRunId: collectionRunId, lastSeenAt: new Date() } }),
        prisma.marketSignal.update({ where: { id: existing.canonicalLink.marketSignalId }, data: { status: "RETRACTED" } }),
      ]);
    }
  }
}

export async function persistNormalisedEventCached(this: WorkerContext, event: PublicEvent, seriesEvent: PublicEvent, dataSourceId: string, collectionRunId: string, cache: EventPersistenceCache) {
  if (event.countryCode.toUpperCase() !== "NZ") throw new AdapterError("PARSING_ERROR", `Event ${event.externalId} is outside New Zealand`, false);
  const venueEnrichment = enrichEventVenue(event);
  const impact = evaluateEventImpactEvidence(venueEnrichment.event.impactEvidence);
  event = {
    ...venueEnrichment.event,
    impactStatus: impact.status,
    impactScore: impact.score,
    impactConfidence: impact.confidence,
    impactEvidence: impact.evidence,
  };
  if (seriesEvent.externalId === event.externalId) seriesEvent = event;
  const sourceIdentity = sourceEventIdentity(seriesEvent);
  const seriesCanonicalKey = canonicalEventKey(seriesEvent);
  const occurrenceCanonicalKey = canonicalEventOccurrenceKey(event);
  const venueCanonicalKey = canonicalVenueKey(event);
  const description = eventDescription(seriesEvent);
  const seenAt = new Date();
  const isDemo = event.fixture || this.environment.NODE_ENV === "test";
  const contentHash = stableHash({
    title: event.title,
    category: event.category,
    subcategory: event.subcategory,
    sourceUrl: event.sourceUrl,
    venueName: event.venueName,
    address: event.address,
    city: event.city,
    region: event.region,
    postcode: event.postcode,
    latitude: event.latitude,
    longitude: event.longitude,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    status: event.status,
    ticketStatus: event.ticketStatus,
    timePrecision: event.timePrecision ?? inferredTimePrecision(event),
    evidenceRef: event.evidenceRef ?? event.sourceUrl,
    impactStatus: event.impactStatus,
    impactScore: event.impactScore,
    impactConfidence: event.impactConfidence,
    impactEvidence: impactEvidenceForHash(event.impactEvidence),
    metadata: event.metadata,
  });
  const sourceOccurrenceData = {
    lastCollectionRunId: collectionRunId,
    canonicalKey: occurrenceCanonicalKey,
    title: event.title,
    category: event.category,
    subcategory: event.subcategory,
    sourceUrl: event.sourceUrl,
    venueName: event.venueName,
    address: event.address,
    city: event.city,
    region: event.region,
    territorialAuthority: event.territorialAuthority,
    postcode: event.postcode,
    countryCode: event.countryCode.toUpperCase(),
    latitude: event.latitude,
    longitude: event.longitude,
    timezone: event.timezone,
    timePrecision: event.timePrecision ?? inferredTimePrecision(event),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    observedAt: event.observedAt ?? seenAt,
    evidenceRef: event.evidenceRef ?? event.sourceUrl,
    status: event.status,
    ticketStatus: event.ticketStatus,
    impactStatus: event.impactStatus,
    impactScore: event.impactScore,
    impactConfidence: event.impactConfidence,
    impactEvidence: event.impactEvidence as Prisma.InputJsonValue,
    sourceUpdatedAt: event.sourceUpdatedAt,
    lastSeenAt: seenAt,
    contentHash,
    metadata: event.metadata as Prisma.InputJsonValue,
    isDemo,
  };
  const sourceContentHash = stableHash({
    externalId: sourceIdentity.externalId,
    sourceUrl: sourceIdentity.sourceUrl,
    title: seriesEvent.title,
    category: seriesEvent.category,
    subcategory: seriesEvent.subcategory,
    status: seriesEvent.status,
    metadata: seriesEvent.metadata,
  });

  const existingById = await prisma.sourceEventOccurrence.findUnique({
    where: { dataSourceId_externalId: { dataSourceId, externalId: event.externalId } },
    include: {
      sourceEvent: true,
      canonicalLinks: {
        include: { eventOccurrence: { include: { canonicalEvent: true } } },
        take: 1,
      },
    },
  });
  // ChristchurchNZ reissues session IDs for the same event and start time.
  // Adopt one exact legacy occurrence before writing the stable adapter ID;
  // this avoids adding another source row during the first upgraded run.
  const existingOccurrence = existingById ?? (event.sourceId === "rto_calendars"
    && event.externalId === `${sourceIdentity.externalId}:at:${event.startsAt.toISOString()}`
    ? await prisma.sourceEventOccurrence.findFirst({
        where: {
          dataSourceId,
          sourceEvent: { externalId: sourceIdentity.externalId },
          startsAt: event.startsAt,
          canonicalKey: occurrenceCanonicalKey,
        },
        include: {
          sourceEvent: true,
          canonicalLinks: {
            include: { eventOccurrence: { include: { canonicalEvent: true } } },
            take: 1,
          },
        },
        orderBy: [{ firstSeenAt: "asc" }, { id: "asc" }],
      })
    : null);
  const existingCanonicalLink = existingOccurrence?.canonicalLinks[0];
  if (existingOccurrence?.contentHash === contentHash && existingOccurrence.sourceEvent.contentHash === sourceContentHash && existingCanonicalLink) {
    const [sourceOccurrence, sourceEvent, eventOccurrence, canonicalEvent] = await prisma.$transaction([
      prisma.sourceEventOccurrence.update({ where: { id: existingOccurrence.id }, data: { externalId: event.externalId, lastCollectionRunId: collectionRunId, lastSeenAt: seenAt, observedAt: event.observedAt ?? seenAt, evidenceRef: event.evidenceRef ?? event.sourceUrl, impactStatus: event.impactStatus, impactScore: event.impactScore, impactConfidence: event.impactConfidence, impactEvidence: event.impactEvidence as Prisma.InputJsonValue } }),
      prisma.sourceEvent.update({ where: { id: existingOccurrence.sourceEventId }, data: { lastSeenAt: seenAt } }),
      prisma.eventOccurrence.update({
        where: { id: existingCanonicalLink.eventOccurrenceId },
        data: {
          lastSeenAt: seenAt,
          timePrecision: event.timePrecision ?? inferredTimePrecision(event),
          impactStatus: event.impactStatus,
          impactScore: event.impactScore,
          impactConfidence: event.impactConfidence,
          impactEvidence: event.impactEvidence as Prisma.InputJsonValue,
          metadata: {
            canonicalisationVersion: "event-occurrence-exact-v1",
            evidenceRef: event.evidenceRef ?? event.sourceUrl,
            observedAt: (event.observedAt ?? seenAt).toISOString(),
          },
        },
      }),
      prisma.canonicalEvent.update({ where: { id: existingCanonicalLink.eventOccurrence.canonicalEventId }, data: { lastSeenAt: seenAt } }),
    ]);
    if (venueCanonicalKey && eventOccurrence.venueId) cache.venues.set(venueCanonicalKey, eventOccurrence.venueId);
    const reconciled = await this.reconcileCanonicalEventImpact(eventOccurrence.id);
    return {
      sourceEvent,
      sourceOccurrence,
      canonicalEvent,
      eventOccurrence: reconciled,
      normalisedEvent: withEventImpact(event, reconciled),
      unchanged: true,
    };
  }

  const persisted = await prisma.$transaction(async (tx) => {
    const seriesCacheKey = `${dataSourceId}:${sourceIdentity.externalId}`;
    const cachedSeries = cache.series.get(seriesCacheKey);
    const sourceEvent = cachedSeries
      ? { id: cachedSeries.sourceEventId }
      : await tx.sourceEvent.upsert({
          where: { dataSourceId_externalId: { dataSourceId, externalId: sourceIdentity.externalId } },
          create: { dataSourceId, externalId: sourceIdentity.externalId, sourceUrl: sourceIdentity.sourceUrl, title: seriesEvent.title, category: seriesEvent.category, subcategory: seriesEvent.subcategory, status: seriesEvent.status, sourceUpdatedAt: seriesEvent.sourceUpdatedAt, lastSeenAt: seenAt, contentHash: sourceContentHash, metadata: seriesEvent.metadata as Prisma.InputJsonValue, isDemo },
          update: { sourceUrl: sourceIdentity.sourceUrl, title: seriesEvent.title, category: seriesEvent.category, subcategory: seriesEvent.subcategory, status: seriesEvent.status, sourceUpdatedAt: seriesEvent.sourceUpdatedAt, lastSeenAt: seenAt, contentHash: sourceContentHash, metadata: seriesEvent.metadata as Prisma.InputJsonValue, isDemo },
        });

    let canonicalEvent: { id: string };
    if (cachedSeries) {
      canonicalEvent = { id: cachedSeries.canonicalEventId };
    } else {
      const existingEventLink = await tx.eventSourceLink.findUnique({ where: { sourceEventId: sourceEvent.id }, select: { canonicalEventId: true } });
      canonicalEvent = existingEventLink
        ? await tx.canonicalEvent.update({ where: { id: existingEventLink.canonicalEventId }, data: { title: seriesEvent.title, category: seriesEvent.category, subcategory: seriesEvent.subcategory, ...(description ? { description } : {}), status: seriesEvent.status, lastSeenAt: seenAt, isDemo } })
        : await tx.canonicalEvent.upsert({
            where: { canonicalKey: seriesCanonicalKey },
            create: { canonicalKey: seriesCanonicalKey, title: seriesEvent.title, category: seriesEvent.category, subcategory: seriesEvent.subcategory, description, status: seriesEvent.status, lastSeenAt: seenAt, metadata: { canonicalisationVersion: "event-exact-v1" }, isDemo },
            update: { title: seriesEvent.title, category: seriesEvent.category, subcategory: seriesEvent.subcategory, ...(description ? { description } : {}), status: seriesEvent.status, lastSeenAt: seenAt, isDemo },
          });

      await tx.eventSourceLink.upsert({
        where: { sourceEventId: sourceEvent.id },
        create: { canonicalEventId: canonicalEvent.id, sourceEventId: sourceEvent.id, matchMethod: "EXACT_IDENTITY_V1", matchConfidence: 1, evidence: { canonicalKey: seriesCanonicalKey } },
        update: { canonicalEventId: canonicalEvent.id, matchMethod: "EXACT_IDENTITY_V1", matchConfidence: 1, reviewStatus: "AUTO_ACCEPTED", evidence: { canonicalKey: seriesCanonicalKey } },
      });
      cache.series.set(seriesCacheKey, { sourceEventId: sourceEvent.id, canonicalEventId: canonicalEvent.id });
    }

    const cachedVenueId = venueCanonicalKey ? cache.venues.get(venueCanonicalKey) : undefined;
    const eventMetadata = event.metadata;
    const publishedVenueCapacity = typeof eventMetadata.venueCapacity === "number" && Number.isInteger(eventMetadata.venueCapacity) && eventMetadata.venueCapacity > 0 ? eventMetadata.venueCapacity : null;
    const publishedVenueCapacityUrl = typeof eventMetadata.venueCapacitySourceUrl === "string" ? eventMetadata.venueCapacitySourceUrl : null;
    const publishedVenueCapacityObservedAt = typeof eventMetadata.venueCapacityObservedAt === "string" && !Number.isNaN(Date.parse(eventMetadata.venueCapacityObservedAt)) ? new Date(eventMetadata.venueCapacityObservedAt) : null;
    const venue = cachedVenueId
      ? { id: cachedVenueId }
      : venueCanonicalKey
        ? await tx.canonicalVenue.upsert({
          where: { canonicalKey: venueCanonicalKey },
          create: { canonicalKey: venueCanonicalKey, name: event.venueName, address: event.address, city: event.city, region: event.region, territorialAuthority: event.territorialAuthority, postcode: event.postcode, countryCode: event.countryCode.toUpperCase(), latitude: event.latitude, longitude: event.longitude, capacity: publishedVenueCapacity ?? venueEnrichment.reference?.capacity, capacitySourceUrl: publishedVenueCapacityUrl ?? venueEnrichment.reference?.capacitySourceUrl, capacityObservedAt: publishedVenueCapacityObservedAt ?? (venueEnrichment.reference ? new Date(venueEnrichment.reference.capacityObservedAt) : undefined), metadata: { canonicalisationVersion: "venue-exact-v1", capacityIsEventAttendance: false, ...(venueEnrichment.reference ? { venueReferenceKey: venueEnrichment.reference.key, venueReferenceVersion: "trusted-venue-v1" } : {}) } },
          update: { name: event.venueName, address: event.address, city: event.city, region: event.region, territorialAuthority: event.territorialAuthority, postcode: event.postcode, countryCode: event.countryCode.toUpperCase(), latitude: event.latitude, longitude: event.longitude, capacity: publishedVenueCapacity ?? venueEnrichment.reference?.capacity, capacitySourceUrl: publishedVenueCapacityUrl ?? venueEnrichment.reference?.capacitySourceUrl, capacityObservedAt: publishedVenueCapacityObservedAt ?? (venueEnrichment.reference ? new Date(venueEnrichment.reference.capacityObservedAt) : undefined) },
          })
        : null;
    if (venueCanonicalKey && venue) cache.venues.set(venueCanonicalKey, venue.id);

    const sourceOccurrence = existingOccurrence
      ? await tx.sourceEventOccurrence.update({ where: { id: existingOccurrence.id }, data: { sourceEventId: sourceEvent.id, externalId: event.externalId, ...sourceOccurrenceData } })
      : await tx.sourceEventOccurrence.upsert({
          where: { dataSourceId_externalId: { dataSourceId, externalId: event.externalId } },
          create: { sourceEventId: sourceEvent.id, dataSourceId, externalId: event.externalId, ...sourceOccurrenceData },
          update: { sourceEventId: sourceEvent.id, ...sourceOccurrenceData },
        });

    if (existingOccurrence && existingOccurrence.contentHash !== contentHash && !await tx.publicFactVersion.findFirst({
      where: { dataSourceId, factKind: "EVENT_OCCURRENCE", externalId: existingOccurrence.externalId, contentHash: existingOccurrence.contentHash },
      select: { id: true },
    })) {
      await tx.publicFactVersion.upsert({
        where: { idempotencyKey: stableId("public-fact-baseline", `${existingOccurrence.id}:${existingOccurrence.contentHash}`) },
        create: {
          idempotencyKey: stableId("public-fact-baseline", `${existingOccurrence.id}:${existingOccurrence.contentHash}`),
          dataSourceId, collectionRunId: existingOccurrence.lastCollectionRunId, factKind: "EVENT_OCCURRENCE",
          externalId: existingOccurrence.externalId, contentHash: existingOccurrence.contentHash,
          observedAt: existingOccurrence.lastSeenAt, startsAt: existingOccurrence.startsAt, endsAt: existingOccurrence.endsAt,
          payload: {
            title: existingOccurrence.title, status: existingOccurrence.status,
            startsAt: existingOccurrence.startsAt.toISOString(), endsAt: existingOccurrence.endsAt.toISOString(),
            venueName: existingOccurrence.venueName, sourceUrl: existingOccurrence.sourceUrl,
            metadata: existingOccurrence.metadata,
          } as Prisma.InputJsonValue,
          isDemo: existingOccurrence.isDemo,
        },
        update: {},
      });
    }
    await tx.publicFactVersion.upsert({
      where: { idempotencyKey: stableId("public-fact-version", `${collectionRunId}:EVENT_OCCURRENCE:${dataSourceId}:${event.externalId}:${contentHash}`) },
      create: {
        idempotencyKey: stableId("public-fact-version", `${collectionRunId}:EVENT_OCCURRENCE:${dataSourceId}:${event.externalId}:${contentHash}`),
        dataSourceId, collectionRunId, factKind: "EVENT_OCCURRENCE", externalId: event.externalId,
        contentHash, observedAt: seenAt, startsAt: event.startsAt, endsAt: event.endsAt,
        payload: {
          title: event.title, status: event.status, startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(), venueName: event.venueName, sourceUrl: event.sourceUrl,
          ticketStatus: event.ticketStatus, metadata: event.metadata,
        } as Prisma.InputJsonValue,
        isDemo,
      },
      update: {},
    });

    const existingOccurrenceLink = await tx.eventOccurrenceSourceLink.findUnique({
      where: { sourceEventOccurrenceId: sourceOccurrence.id },
      select: { eventOccurrenceId: true, eventOccurrence: { select: { canonicalKey: true } } },
    });
    const occurrenceData = { canonicalEventId: canonicalEvent.id, venueId: venue?.id ?? null, timezone: event.timezone, timePrecision: event.timePrecision ?? inferredTimePrecision(event), startsAt: event.startsAt, endsAt: event.endsAt, status: event.status, ticketStatus: event.ticketStatus, impactStatus: event.impactStatus, impactScore: event.impactScore, impactConfidence: event.impactConfidence, impactEvidence: event.impactEvidence as Prisma.InputJsonValue, lastSeenAt: seenAt, metadata: { canonicalisationVersion: "event-occurrence-exact-v1", evidenceRef: event.evidenceRef ?? event.sourceUrl, observedAt: (event.observedAt ?? seenAt).toISOString() }, isDemo };
    const eventOccurrence = existingOccurrenceLink?.eventOccurrence.canonicalKey === occurrenceCanonicalKey
      ? await tx.eventOccurrence.update({ where: { id: existingOccurrenceLink.eventOccurrenceId }, data: occurrenceData })
      : await tx.eventOccurrence.upsert({
          where: { canonicalKey: occurrenceCanonicalKey },
          create: { canonicalKey: occurrenceCanonicalKey, ...occurrenceData },
          update: occurrenceData,
        });

    await tx.eventOccurrenceSourceLink.upsert({
      where: { sourceEventOccurrenceId: sourceOccurrence.id },
      create: { eventOccurrenceId: eventOccurrence.id, sourceEventOccurrenceId: sourceOccurrence.id, matchMethod: "EXACT_IDENTITY_V1", matchConfidence: 1, evidence: { canonicalKey: occurrenceCanonicalKey } },
      update: { eventOccurrenceId: eventOccurrence.id, matchMethod: "EXACT_IDENTITY_V1", matchConfidence: 1, reviewStatus: "AUTO_ACCEPTED", evidence: { canonicalKey: occurrenceCanonicalKey } },
    });
    if (existingOccurrenceLink && existingOccurrenceLink.eventOccurrenceId !== eventOccurrence.id
      && await tx.eventOccurrenceSourceLink.count({ where: { eventOccurrenceId: existingOccurrenceLink.eventOccurrenceId } }) === 0) {
      await tx.eventOccurrence.update({ where: { id: existingOccurrenceLink.eventOccurrenceId }, data: { status: "SUPERSEDED", lastSeenAt: seenAt } });
    }

    return { sourceEvent, sourceOccurrence, canonicalEvent, eventOccurrence, unchanged: false };
  });
  const reconciled = await this.reconcileCanonicalEventImpact(persisted.eventOccurrence.id);
  return {
    ...persisted,
    eventOccurrence: reconciled,
    normalisedEvent: withEventImpact(event, reconciled),
  };
}

export async function reconcileCanonicalEventImpact(this: WorkerContext, eventOccurrenceId: string) {
  const occurrence = await prisma.eventOccurrence.findUniqueOrThrow({
    where: { id: eventOccurrenceId },
    include: { sourceLinks: { include: { sourceEventOccurrence: { select: { impactEvidence: true } } } } },
  });
  const evidence = mergeEventImpactEvidence(occurrence.sourceLinks.map((link) => link.sourceEventOccurrence.impactEvidence));
  const impact = evaluateEventImpactEvidence(evidence);
  return prisma.eventOccurrence.update({
    where: { id: eventOccurrenceId },
    data: {
      impactStatus: impact.status,
      impactScore: impact.score,
      impactConfidence: impact.confidence,
      impactEvidence: impact.evidence as Prisma.InputJsonValue,
      metadata: {
        ...jsonRecord(occurrence.metadata),
        impactPolicyVersion: impact.evidence.policyVersion,
        impactEvidenceSourceCount: occurrence.sourceLinks.length,
      },
    },
  });
}
