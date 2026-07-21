ALTER TABLE "MarketEvent" RENAME TO "SourceEventOccurrence";
ALTER TABLE "SourceEventOccurrence" RENAME CONSTRAINT "MarketEvent_pkey" TO "SourceEventOccurrence_pkey";
ALTER TABLE "SourceEventOccurrence" RENAME CONSTRAINT "MarketEvent_dataSourceId_fkey" TO "SourceEventOccurrence_dataSourceId_fkey";
ALTER TABLE "SourceEventOccurrence" RENAME CONSTRAINT "MarketEvent_lastCollectionRunId_fkey" TO "SourceEventOccurrence_lastCollectionRunId_fkey";
ALTER INDEX "MarketEvent_dataSourceId_externalId_key" RENAME TO "SourceEventOccurrence_dataSourceId_externalId_key";
ALTER INDEX "MarketEvent_canonicalKey_idx" RENAME TO "SourceEventOccurrence_canonicalKey_idx";
ALTER INDEX "MarketEvent_city_startsAt_endsAt_idx" RENAME TO "SourceEventOccurrence_city_startsAt_endsAt_idx";
ALTER INDEX "MarketEvent_region_startsAt_endsAt_idx" RENAME TO "SourceEventOccurrence_region_startsAt_endsAt_idx";
ALTER INDEX "MarketEvent_impactStatus_startsAt_idx" RENAME TO "SourceEventOccurrence_impactStatus_startsAt_idx";
ALTER INDEX "MarketEvent_lastCollectionRunId_idx" RENAME TO "SourceEventOccurrence_lastCollectionRunId_idx";
ALTER TABLE "SourceEventOccurrence" ADD COLUMN "sourceEventId" TEXT;

CREATE TABLE "SourceEvent" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "sourceUpdatedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceEvent_pkey" PRIMARY KEY ("id")
);

WITH source_rows AS (
    SELECT DISTINCT ON (
        occurrence."dataSourceId",
        COALESCE(NULLIF(occurrence."metadata"->>'eventfindaEventId', ''), occurrence."externalId")
    )
        'source-event-' || substr(md5(
            occurrence."dataSourceId" || ':' ||
            COALESCE(NULLIF(occurrence."metadata"->>'eventfindaEventId', ''), occurrence."externalId")
        ), 1, 24) AS id,
        occurrence."dataSourceId",
        COALESCE(NULLIF(occurrence."metadata"->>'eventfindaEventId', ''), occurrence."externalId") AS "externalId",
        COALESCE(NULLIF(occurrence."metadata"->>'seriesUrl', ''), occurrence."sourceUrl") AS "sourceUrl",
        occurrence."title",
        occurrence."category",
        occurrence."subcategory",
        occurrence."status",
        occurrence."sourceUpdatedAt",
        occurrence."firstSeenAt",
        occurrence."lastSeenAt",
        occurrence."contentHash",
        occurrence."metadata",
        occurrence."isDemo",
        occurrence."createdAt",
        occurrence."updatedAt"
    FROM "SourceEventOccurrence" occurrence
    ORDER BY
        occurrence."dataSourceId",
        COALESCE(NULLIF(occurrence."metadata"->>'eventfindaEventId', ''), occurrence."externalId"),
        occurrence."lastSeenAt" DESC
)
INSERT INTO "SourceEvent" (
    "id", "dataSourceId", "externalId", "sourceUrl", "title", "category", "subcategory",
    "status", "sourceUpdatedAt", "firstSeenAt", "lastSeenAt", "contentHash", "metadata",
    "isDemo", "createdAt", "updatedAt"
)
SELECT
    id, "dataSourceId", "externalId", "sourceUrl", title, category, subcategory,
    status, "sourceUpdatedAt", "firstSeenAt", "lastSeenAt", "contentHash", metadata,
    "isDemo", "createdAt", "updatedAt"
FROM source_rows;

UPDATE "SourceEventOccurrence" occurrence
SET "sourceEventId" = 'source-event-' || substr(md5(
    occurrence."dataSourceId" || ':' ||
    COALESCE(NULLIF(occurrence."metadata"->>'eventfindaEventId', ''), occurrence."externalId")
), 1, 24);

ALTER TABLE "SourceEventOccurrence" ALTER COLUMN "sourceEventId" SET NOT NULL;

CREATE TABLE "CanonicalVenue" (
    "id" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "name" TEXT,
    "address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "territorialAuthority" TEXT,
    "postcode" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'NZ',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalVenue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CanonicalEvent" (
    "id" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventOccurrence" (
    "id" TEXT NOT NULL,
    "canonicalEventId" TEXT NOT NULL,
    "venueId" TEXT,
    "canonicalKey" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Pacific/Auckland',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "ticketStatus" TEXT,
    "impactStatus" TEXT NOT NULL DEFAULT 'PENDING_EVIDENCE',
    "impactScore" DOUBLE PRECISION,
    "impactConfidence" DOUBLE PRECISION,
    "impactEvidence" JSONB NOT NULL DEFAULT '{}',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventSourceLink" (
    "id" TEXT NOT NULL,
    "canonicalEventId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "matchMethod" TEXT NOT NULL,
    "matchConfidence" DOUBLE PRECISION NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'AUTO_ACCEPTED',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSourceLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventOccurrenceSourceLink" (
    "id" TEXT NOT NULL,
    "eventOccurrenceId" TEXT NOT NULL,
    "sourceEventOccurrenceId" TEXT NOT NULL,
    "matchMethod" TEXT NOT NULL,
    "matchConfidence" DOUBLE PRECISION NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'AUTO_ACCEPTED',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOccurrenceSourceLink_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CanonicalEvent" (
    "id", "canonicalKey", "title", "category", "subcategory", "description", "status",
    "firstSeenAt", "lastSeenAt", "metadata", "isDemo", "createdAt", "updatedAt"
)
SELECT
    'canonical-event-' || substr(md5(source_event.id), 1, 24),
    'legacy-source:' || source_event.id,
    source_event.title,
    source_event.category,
    source_event.subcategory,
    NULLIF(source_event.metadata->>'description', ''),
    source_event.status,
    source_event."firstSeenAt",
    source_event."lastSeenAt",
    jsonb_build_object('migration', 'source-isolated-v1'),
    source_event."isDemo",
    source_event."createdAt",
    source_event."updatedAt"
FROM "SourceEvent" source_event;

INSERT INTO "EventSourceLink" (
    "id", "canonicalEventId", "sourceEventId", "matchMethod", "matchConfidence",
    "reviewStatus", "evidence", "createdAt", "updatedAt"
)
SELECT
    'event-source-link-' || substr(md5(source_event.id), 1, 24),
    'canonical-event-' || substr(md5(source_event.id), 1, 24),
    source_event.id,
    'LEGACY_SOURCE_ISOLATED',
    1,
    'AUTO_ACCEPTED',
    jsonb_build_object('migration', 'canonical-event-pipeline-v1'),
    source_event."createdAt",
    source_event."updatedAt"
FROM "SourceEvent" source_event;

WITH venue_rows AS (
    SELECT DISTINCT ON (venue_key)
        'canonical-venue-' || substr(md5(venue_key), 1, 24) AS id,
        'legacy-location:' || venue_key AS "canonicalKey",
        occurrence."venueName" AS name,
        occurrence.address,
        occurrence.city,
        occurrence.region,
        occurrence."territorialAuthority",
        occurrence.postcode,
        occurrence."countryCode",
        occurrence.latitude,
        occurrence.longitude,
        occurrence."createdAt",
        occurrence."updatedAt"
    FROM (
        SELECT
            source_occurrence.*,
            md5(concat_ws('|',
                lower(COALESCE(source_occurrence."venueName", '')),
                lower(COALESCE(source_occurrence.address, '')),
                lower(COALESCE(source_occurrence.city, '')),
                lower(COALESCE(source_occurrence.region, '')),
                COALESCE(source_occurrence.latitude::text, ''),
                COALESCE(source_occurrence.longitude::text, '')
            )) AS venue_key
        FROM "SourceEventOccurrence" source_occurrence
        WHERE source_occurrence."venueName" IS NOT NULL
           OR source_occurrence.address IS NOT NULL
           OR source_occurrence.city IS NOT NULL
           OR source_occurrence.region IS NOT NULL
           OR source_occurrence.latitude IS NOT NULL
           OR source_occurrence.longitude IS NOT NULL
    ) occurrence
    ORDER BY venue_key, occurrence."lastSeenAt" DESC
)
INSERT INTO "CanonicalVenue" (
    "id", "canonicalKey", "name", "address", "city", "region", "territorialAuthority",
    "postcode", "countryCode", "latitude", "longitude", "metadata", "createdAt", "updatedAt"
)
SELECT
    id, "canonicalKey", name, address, city, region, "territorialAuthority", postcode,
    "countryCode", latitude, longitude, jsonb_build_object('migration', 'location-signature-v1'),
    "createdAt", "updatedAt"
FROM venue_rows;

INSERT INTO "EventOccurrence" (
    "id", "canonicalEventId", "venueId", "canonicalKey", "timezone", "startsAt", "endsAt",
    "status", "ticketStatus", "impactStatus", "impactScore", "impactConfidence", "impactEvidence",
    "firstSeenAt", "lastSeenAt", "metadata", "isDemo", "createdAt", "updatedAt"
)
SELECT
    'event-occurrence-' || substr(md5(occurrence.id), 1, 24),
    'canonical-event-' || substr(md5(occurrence."sourceEventId"), 1, 24),
    CASE WHEN occurrence."venueName" IS NOT NULL
           OR occurrence.address IS NOT NULL
           OR occurrence.city IS NOT NULL
           OR occurrence.region IS NOT NULL
           OR occurrence.latitude IS NOT NULL
           OR occurrence.longitude IS NOT NULL
         THEN 'canonical-venue-' || substr(md5(md5(concat_ws('|',
             lower(COALESCE(occurrence."venueName", '')),
             lower(COALESCE(occurrence.address, '')),
             lower(COALESCE(occurrence.city, '')),
             lower(COALESCE(occurrence.region, '')),
             COALESCE(occurrence.latitude::text, ''),
             COALESCE(occurrence.longitude::text, '')
         ))), 1, 24)
         ELSE NULL
    END,
    'legacy-source-occurrence:' || occurrence.id,
    occurrence.timezone,
    occurrence."startsAt",
    occurrence."endsAt",
    occurrence.status,
    occurrence."ticketStatus",
    occurrence."impactStatus",
    occurrence."impactScore",
    occurrence."impactConfidence",
    occurrence."impactEvidence",
    occurrence."firstSeenAt",
    occurrence."lastSeenAt",
    jsonb_build_object('migration', 'source-occurrence-isolated-v1'),
    occurrence."isDemo",
    occurrence."createdAt",
    occurrence."updatedAt"
FROM "SourceEventOccurrence" occurrence;

INSERT INTO "EventOccurrenceSourceLink" (
    "id", "eventOccurrenceId", "sourceEventOccurrenceId", "matchMethod", "matchConfidence",
    "reviewStatus", "evidence", "createdAt", "updatedAt"
)
SELECT
    'occurrence-source-link-' || substr(md5(occurrence.id), 1, 24),
    'event-occurrence-' || substr(md5(occurrence.id), 1, 24),
    occurrence.id,
    'LEGACY_SOURCE_ISOLATED',
    1,
    'AUTO_ACCEPTED',
    jsonb_build_object('migration', 'canonical-event-pipeline-v1'),
    occurrence."createdAt",
    occurrence."updatedAt"
FROM "SourceEventOccurrence" occurrence;

ALTER TABLE "MarketSignal" ADD COLUMN "eventOccurrenceId" TEXT;

CREATE UNIQUE INDEX "SourceEvent_dataSourceId_externalId_key" ON "SourceEvent"("dataSourceId", "externalId");
CREATE INDEX "SourceEvent_dataSourceId_lastSeenAt_idx" ON "SourceEvent"("dataSourceId", "lastSeenAt");
CREATE INDEX "SourceEvent_status_lastSeenAt_idx" ON "SourceEvent"("status", "lastSeenAt");
CREATE INDEX "SourceEventOccurrence_sourceEventId_startsAt_idx" ON "SourceEventOccurrence"("sourceEventId", "startsAt");
CREATE UNIQUE INDEX "CanonicalVenue_canonicalKey_key" ON "CanonicalVenue"("canonicalKey");
CREATE INDEX "CanonicalVenue_city_region_idx" ON "CanonicalVenue"("city", "region");
CREATE UNIQUE INDEX "CanonicalEvent_canonicalKey_key" ON "CanonicalEvent"("canonicalKey");
CREATE INDEX "CanonicalEvent_status_lastSeenAt_idx" ON "CanonicalEvent"("status", "lastSeenAt");
CREATE UNIQUE INDEX "EventOccurrence_canonicalKey_key" ON "EventOccurrence"("canonicalKey");
CREATE INDEX "EventOccurrence_canonicalEventId_startsAt_idx" ON "EventOccurrence"("canonicalEventId", "startsAt");
CREATE INDEX "EventOccurrence_venueId_startsAt_endsAt_idx" ON "EventOccurrence"("venueId", "startsAt", "endsAt");
CREATE INDEX "EventOccurrence_impactStatus_startsAt_idx" ON "EventOccurrence"("impactStatus", "startsAt");
CREATE UNIQUE INDEX "EventSourceLink_sourceEventId_key" ON "EventSourceLink"("sourceEventId");
CREATE UNIQUE INDEX "EventSourceLink_canonicalEventId_sourceEventId_key" ON "EventSourceLink"("canonicalEventId", "sourceEventId");
CREATE INDEX "EventSourceLink_canonicalEventId_reviewStatus_idx" ON "EventSourceLink"("canonicalEventId", "reviewStatus");
CREATE UNIQUE INDEX "EventOccurrenceSourceLink_sourceEventOccurrenceId_key" ON "EventOccurrenceSourceLink"("sourceEventOccurrenceId");
CREATE UNIQUE INDEX "EventOccurrenceSourceLink_eventOccurrenceId_sourceEventOccurrenceId_key" ON "EventOccurrenceSourceLink"("eventOccurrenceId", "sourceEventOccurrenceId");
CREATE INDEX "EventOccurrenceSourceLink_eventOccurrenceId_reviewStatus_idx" ON "EventOccurrenceSourceLink"("eventOccurrenceId", "reviewStatus");
CREATE INDEX "MarketSignal_eventOccurrenceId_idx" ON "MarketSignal"("eventOccurrenceId");

ALTER TABLE "SourceEvent" ADD CONSTRAINT "SourceEvent_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SourceEventOccurrence" ADD CONSTRAINT "SourceEventOccurrence_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "SourceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "CanonicalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "CanonicalVenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "CanonicalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "SourceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventOccurrenceSourceLink" ADD CONSTRAINT "EventOccurrenceSourceLink_eventOccurrenceId_fkey" FOREIGN KEY ("eventOccurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventOccurrenceSourceLink" ADD CONSTRAINT "EventOccurrenceSourceLink_sourceEventOccurrenceId_fkey" FOREIGN KEY ("sourceEventOccurrenceId") REFERENCES "SourceEventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketSignal" ADD CONSTRAINT "MarketSignal_eventOccurrenceId_fkey" FOREIGN KEY ("eventOccurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
