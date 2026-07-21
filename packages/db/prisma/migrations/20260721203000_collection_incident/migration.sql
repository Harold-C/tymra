CREATE TABLE "CollectionIncident" (
    "id" TEXT NOT NULL,
    "collectionRunId" TEXT NOT NULL,
    "retryJobId" TEXT,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "ExceptionPriority" NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "resolutionAction" TEXT,
    "resolutionReason" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CollectionIncident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectionIncident_collectionRunId_key" ON "CollectionIncident"("collectionRunId");
CREATE UNIQUE INDEX "CollectionIncident_retryJobId_key" ON "CollectionIncident"("retryJobId");
CREATE INDEX "CollectionIncident_status_severity_createdAt_idx" ON "CollectionIncident"("status", "severity", "createdAt");
CREATE INDEX "CollectionIncident_retryJobId_idx" ON "CollectionIncident"("retryJobId");

ALTER TABLE "CollectionIncident"
ADD CONSTRAINT "CollectionIncident_collectionRunId_fkey"
FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "CollectionIncident" (
    "id", "collectionRunId", "status", "severity", "category", "title", "summary", "evidence", "createdAt", "updatedAt", "isDemo"
)
SELECT
    'collection-incident-' || run."id",
    run."id",
    'OPEN'::"ExceptionStatus",
    CASE WHEN run."status" = 'FAILED'::"CollectionStatus" THEN 'P1'::"ExceptionPriority" ELSE 'P2'::"ExceptionPriority" END,
    COALESCE(run."errorCode", CASE WHEN run."status" = 'PARTIAL'::"CollectionStatus" THEN 'PARTIAL_FAILURE' ELSE 'COLLECTION_FAILED' END),
    source."name" || ' collection ' || lower(run."status"::text),
    COALESCE(run."errorSummary", 'Historical collection run requires operational review'),
    jsonb_build_object(
        'backfilled', true,
        'runStatus', run."status"::text,
        'successCount', run."successCount",
        'failureCount', run."failureCount",
        'errorCode', run."errorCode"
    ),
    COALESCE(run."finishedAt", run."createdAt"),
    COALESCE(run."finishedAt", run."createdAt"),
    run."isDemo"
FROM "CollectionRun" run
JOIN "DataSource" source ON source."id" = run."dataSourceId"
WHERE run."status" IN ('FAILED'::"CollectionStatus", 'PARTIAL'::"CollectionStatus")
ON CONFLICT ("collectionRunId") DO NOTHING;
