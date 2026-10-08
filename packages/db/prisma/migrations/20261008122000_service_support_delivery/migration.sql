ALTER TABLE "CustomerDataRequest" ADD COLUMN "encryptedExport" TEXT,
  ADD COLUMN "exportChecksum" TEXT, ADD COLUMN "exportReadyAt" TIMESTAMP(3),
  ADD COLUMN "exportExpiresAt" TIMESTAMP(3), ADD COLUMN "downloadedAt" TIMESTAMP(3);
ALTER TABLE "StripeBillingEvent" ADD COLUMN "processingStartedAt" TIMESTAMP(3);
