-- Distinguish exact OTA listing pricing from address-based neighbourhood benchmarks.
CREATE TYPE "PriceCheckAnalysisType" AS ENUM ('LISTING_PRICING', 'LOCATION_BENCHMARK');

ALTER TABLE "PriceCheck"
ADD COLUMN "analysisType" "PriceCheckAnalysisType" NOT NULL DEFAULT 'LISTING_PRICING';

-- A membership slot belongs to the physical Property rather than to an input URL
-- or a replaceable Sellable Unit. Inactive slots remain occupied during the
-- replacement-retention window enforced by the application.
ALTER TABLE "CustomerPricingUnit"
ADD COLUMN "quotaIdentityKey" TEXT,
ADD COLUMN "slotRetainedUntil" TIMESTAMP(3);

UPDATE "CustomerPricingUnit" AS cpu
SET "quotaIdentityKey" = 'property:' || su."propertyId"
FROM "SellableUnit" AS su
WHERE su."id" = cpu."sellableUnitId";

-- Earlier builds could track multiple units from one Property separately. Keep
-- the oldest membership row as the property slot and preserve usage attribution.
WITH ranked AS (
  SELECT "id", FIRST_VALUE("id") OVER (
    PARTITION BY "customerUserId", "quotaIdentityKey"
    ORDER BY "createdAt", "id"
  ) AS keeper_id
  FROM "CustomerPricingUnit"
)
UPDATE "MembershipUsage" AS usage
SET "pricingUnitId" = ranked.keeper_id
FROM ranked
WHERE usage."pricingUnitId" = ranked."id"
  AND ranked."id" <> ranked.keeper_id;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "customerUserId", "quotaIdentityKey"
    ORDER BY "createdAt", "id"
  ) AS row_number
  FROM "CustomerPricingUnit"
)
DELETE FROM "CustomerPricingUnit" AS cpu
USING ranked
WHERE cpu."id" = ranked."id" AND ranked.row_number > 1;

ALTER TABLE "CustomerPricingUnit"
ALTER COLUMN "quotaIdentityKey" SET NOT NULL;

CREATE UNIQUE INDEX "CustomerPricingUnit_customerUserId_quotaIdentityKey_key"
ON "CustomerPricingUnit"("customerUserId", "quotaIdentityKey");

CREATE INDEX "CustomerPricingUnit_customerUserId_slotRetainedUntil_idx"
ON "CustomerPricingUnit"("customerUserId", "slotRetainedUntil");
