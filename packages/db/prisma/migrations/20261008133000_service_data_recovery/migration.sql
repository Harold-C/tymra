ALTER TYPE "JobType" ADD VALUE 'BACKFILL_IMPORT';
CREATE TABLE "ServiceBackfill" (
  "id" TEXT PRIMARY KEY, "commandId" TEXT NOT NULL UNIQUE, "actorAdminId" TEXT NOT NULL REFERENCES "AdminUser"("id"),
  "dataSourceId" TEXT NOT NULL REFERENCES "DataSource"("id"), "reason" TEXT NOT NULL, "evidenceReference" TEXT NOT NULL,
  "checksum" TEXT NOT NULL, "rangeFrom" TIMESTAMP(3) NOT NULL, "rangeTo" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'VALIDATED',
  "totalRows" INTEGER NOT NULL, "savedRows" INTEGER NOT NULL DEFAULT 0, "duplicateRows" INTEGER NOT NULL DEFAULT 0, "failedRows" INTEGER NOT NULL DEFAULT 0,
  "collectionRunId" TEXT REFERENCES "CollectionRun"("id"), "jobId" TEXT REFERENCES "Job"("id"), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3)
);
CREATE INDEX "ServiceBackfill_dataSourceId_createdAt_idx" ON "ServiceBackfill"("dataSourceId", "createdAt");
CREATE TABLE "ServiceBackfillRow" (
  "id" TEXT PRIMARY KEY, "backfillId" TEXT NOT NULL REFERENCES "ServiceBackfill"("id"), "rowNumber" INTEGER NOT NULL,
  "payload" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "factVersionId" TEXT REFERENCES "PublicFactVersion"("id"), "errorCode" TEXT, "attemptCount" INTEGER NOT NULL DEFAULT 0,
  UNIQUE ("backfillId", "rowNumber")
);
CREATE INDEX "ServiceBackfillRow_backfillId_status_idx" ON "ServiceBackfillRow"("backfillId", "status");
CREATE TABLE "ServiceDataRepair" (
  "id" TEXT PRIMARY KEY, "commandId" TEXT NOT NULL UNIQUE, "actorAdminId" TEXT NOT NULL REFERENCES "AdminUser"("id"), "listingId" TEXT NOT NULL REFERENCES "Listing"("id"),
  "previousUnitId" TEXT NOT NULL, "correctedUnitId" TEXT NOT NULL, "evidenceArtifactId" TEXT NOT NULL, "evidenceHash" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "listingVersionId" TEXT NOT NULL REFERENCES "ListingVersion"("id"), "impact" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ServiceDataRepair_listingId_createdAt_idx" ON "ServiceDataRepair"("listingId", "createdAt");
CREATE TABLE "RateQuarantine" (
  "id" TEXT PRIMARY KEY, "rateObservationId" TEXT NOT NULL UNIQUE REFERENCES "RateObservation"("id"), "repairId" TEXT NOT NULL REFERENCES "ServiceDataRepair"("id"),
  "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER "service_data_repair_append_only" BEFORE UPDATE OR DELETE ON "ServiceDataRepair" FOR EACH ROW EXECUTE FUNCTION tymra_reject_all_mutation();
CREATE TRIGGER "rate_quarantine_append_only" BEFORE UPDATE OR DELETE ON "RateQuarantine" FOR EACH ROW EXECUTE FUNCTION tymra_reject_all_mutation();
