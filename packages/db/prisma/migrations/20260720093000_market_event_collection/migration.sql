CREATE TABLE "MarketEvent" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "lastCollectionRunId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "venueName" TEXT,
    "address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "territorialAuthority" TEXT,
    "postcode" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'NZ',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL DEFAULT 'Pacific/Auckland',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "ticketStatus" TEXT,
    "impactStatus" TEXT NOT NULL DEFAULT 'PENDING_EVIDENCE',
    "impactScore" DOUBLE PRECISION,
    "impactConfidence" DOUBLE PRECISION,
    "impactEvidence" JSONB NOT NULL DEFAULT '{}',
    "sourceUpdatedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketEvent_dataSourceId_externalId_key" ON "MarketEvent"("dataSourceId", "externalId");
CREATE INDEX "MarketEvent_canonicalKey_idx" ON "MarketEvent"("canonicalKey");
CREATE INDEX "MarketEvent_city_startsAt_endsAt_idx" ON "MarketEvent"("city", "startsAt", "endsAt");
CREATE INDEX "MarketEvent_region_startsAt_endsAt_idx" ON "MarketEvent"("region", "startsAt", "endsAt");
CREATE INDEX "MarketEvent_impactStatus_startsAt_idx" ON "MarketEvent"("impactStatus", "startsAt");
CREATE INDEX "MarketEvent_lastCollectionRunId_idx" ON "MarketEvent"("lastCollectionRunId");

ALTER TABLE "MarketEvent" ADD CONSTRAINT "MarketEvent_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketEvent" ADD CONSTRAINT "MarketEvent_lastCollectionRunId_fkey" FOREIGN KEY ("lastCollectionRunId") REFERENCES "CollectionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
