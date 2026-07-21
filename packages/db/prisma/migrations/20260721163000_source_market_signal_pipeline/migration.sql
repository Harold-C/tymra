CREATE TABLE "SourceMarketSignal" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "lastCollectionRunId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "type" "MarketSignalType" NOT NULL,
    "title" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "direction" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceMarketSignal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketSignalSourceLink" (
    "id" TEXT NOT NULL,
    "marketSignalId" TEXT NOT NULL,
    "sourceMarketSignalId" TEXT NOT NULL,
    "matchMethod" TEXT NOT NULL,
    "matchConfidence" DOUBLE PRECISION NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'AUTO_ACCEPTED',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSignalSourceLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceMarketSignal_dataSourceId_externalId_key" ON "SourceMarketSignal"("dataSourceId", "externalId");
CREATE INDEX "SourceMarketSignal_lastCollectionRunId_idx" ON "SourceMarketSignal"("lastCollectionRunId");
CREATE INDEX "SourceMarketSignal_marketKey_startsAt_endsAt_idx" ON "SourceMarketSignal"("marketKey", "startsAt", "endsAt");
CREATE UNIQUE INDEX "MarketSignalSourceLink_sourceMarketSignalId_key" ON "MarketSignalSourceLink"("sourceMarketSignalId");
CREATE UNIQUE INDEX "MarketSignalSourceLink_marketSignalId_sourceMarketSignalId_key" ON "MarketSignalSourceLink"("marketSignalId", "sourceMarketSignalId");
CREATE INDEX "MarketSignalSourceLink_marketSignalId_reviewStatus_idx" ON "MarketSignalSourceLink"("marketSignalId", "reviewStatus");

ALTER TABLE "SourceMarketSignal" ADD CONSTRAINT "SourceMarketSignal_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SourceMarketSignal" ADD CONSTRAINT "SourceMarketSignal_lastCollectionRunId_fkey" FOREIGN KEY ("lastCollectionRunId") REFERENCES "CollectionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketSignalSourceLink" ADD CONSTRAINT "MarketSignalSourceLink_marketSignalId_fkey" FOREIGN KEY ("marketSignalId") REFERENCES "MarketSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketSignalSourceLink" ADD CONSTRAINT "MarketSignalSourceLink_sourceMarketSignalId_fkey" FOREIGN KEY ("sourceMarketSignalId") REFERENCES "SourceMarketSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
