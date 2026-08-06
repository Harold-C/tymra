ALTER TABLE "PriceCheck"
ADD COLUMN "listingUrl" TEXT,
ADD COLUMN "listingValidationStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "listingValidationMessage" TEXT,
ADD COLUMN "listingValidatedAt" TIMESTAMP(3);

CREATE INDEX "PriceCheck_listingValidationStatus_updatedAt_idx" ON "PriceCheck"("listingValidationStatus", "updatedAt");
