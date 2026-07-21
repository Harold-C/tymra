CREATE TABLE "SourceCrawlTarget" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFetchedAt" TIMESTAMP(3),
    "nextFetchAt" TIMESTAMP(3),
    "sourceUpdatedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "httpStatus" INTEGER,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "missedDiscoveryCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceCrawlTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceCrawlTarget_dataSourceId_urlHash_key" ON "SourceCrawlTarget"("dataSourceId", "urlHash");
CREATE INDEX "SourceCrawlTarget_dataSourceId_active_nextFetchAt_priority_idx" ON "SourceCrawlTarget"("dataSourceId", "active", "nextFetchAt", "priority");
CREATE INDEX "SourceCrawlTarget_dataSourceId_kind_lastSeenAt_idx" ON "SourceCrawlTarget"("dataSourceId", "kind", "lastSeenAt");
CREATE INDEX "SourceCrawlTarget_status_lastErrorAt_idx" ON "SourceCrawlTarget"("status", "lastErrorAt");

ALTER TABLE "SourceCrawlTarget" ADD CONSTRAINT "SourceCrawlTarget_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
