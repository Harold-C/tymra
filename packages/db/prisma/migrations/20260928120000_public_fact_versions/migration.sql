CREATE TABLE "PublicFactVersion" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "collectionRunId" TEXT NOT NULL,
    "factKind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicFactVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicFactVersion_idempotencyKey_key" ON "PublicFactVersion"("idempotencyKey");
CREATE INDEX "PublicFactVersion_dataSourceId_factKind_externalId_createdAt_idx" ON "PublicFactVersion"("dataSourceId", "factKind", "externalId", "createdAt");
CREATE INDEX "PublicFactVersion_collectionRunId_idx" ON "PublicFactVersion"("collectionRunId");
CREATE INDEX "PublicFactVersion_endsAt_idx" ON "PublicFactVersion"("endsAt");
