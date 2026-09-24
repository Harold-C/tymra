-- National Data Core v1.3 is the first production data contract. The product has
-- never launched, so obsolete development-only bearer access is removed directly.

CREATE TYPE "SourceCapabilityName" AS ENUM ('DISCOVER_LISTINGS', 'RESOLVE_LISTING', 'COLLECT_RATES', 'COLLECT_PUBLIC_SIGNALS', 'IMPORT_MANUAL_DATA', 'HEALTH_CHECK');
CREATE TYPE "FreshnessState" AS ENUM ('FRESH', 'AGING', 'STALE', 'UNKNOWN');
CREATE TYPE "ConfidenceLayer" AS ENUM ('IDENTITY', 'FIELD_OBSERVATION', 'SNAPSHOT', 'DERIVED_RESULT');
CREATE TYPE "LineageNodeType" AS ENUM ('RAW_ARTIFACT', 'NORMALIZED_FACT', 'MARKET_SNAPSHOT', 'DATE_SNAPSHOT', 'INSIGHT', 'RESULT_VERSION', 'MANUAL_DECISION');

ALTER TYPE "MarketStatus" RENAME TO "MarketStatus_old";
CREATE TYPE "MarketStatus" AS ENUM ('SUPPORTED', 'PARTIAL_COVERAGE', 'PILOT', 'INSUFFICIENT_DATA', 'SOURCE_UNAVAILABLE');
ALTER TABLE "Property" ALTER COLUMN "supportStatus" DROP DEFAULT;
ALTER TABLE "Property" ALTER COLUMN "supportStatus" TYPE "MarketStatus" USING (
  CASE "supportStatus"::text
    WHEN 'PILOT_AVAILABLE' THEN 'PARTIAL_COVERAGE'
    WHEN 'COMING_SOON' THEN 'PILOT'
    WHEN 'INSUFFICIENT_MARKET_DATA' THEN 'INSUFFICIENT_DATA'
    WHEN 'DISABLED' THEN 'SOURCE_UNAVAILABLE'
    ELSE "supportStatus"::text
  END
)::"MarketStatus";
ALTER TABLE "Property" ALTER COLUMN "supportStatus" SET DEFAULT 'PILOT';
ALTER TABLE "MarketCoverage" ALTER COLUMN "status" TYPE "MarketStatus" USING (
  CASE "status"::text
    WHEN 'PILOT_AVAILABLE' THEN 'PARTIAL_COVERAGE'
    WHEN 'COMING_SOON' THEN 'PILOT'
    WHEN 'INSUFFICIENT_MARKET_DATA' THEN 'INSUFFICIENT_DATA'
    WHEN 'DISABLED' THEN 'SOURCE_UNAVAILABLE'
    ELSE "status"::text
  END
)::"MarketStatus";
DROP TYPE "MarketStatus_old";


ALTER TABLE "MarketSnapshot"
  ADD COLUMN "analysisType" "PriceCheckAnalysisType",
  ADD COLUMN "spatialAnchor" JSONB,
  ALTER COLUMN "targetSellableUnitId" DROP NOT NULL,
  ALTER COLUMN "targetListingId" DROP NOT NULL,
  ALTER COLUMN "competitorSetVersionId" DROP NOT NULL;
UPDATE "MarketSnapshot" snapshot
SET "analysisType" = COALESCE(check_row."analysisType", 'LISTING_PRICING'::"PriceCheckAnalysisType")
FROM "PriceCheck" check_row
WHERE snapshot."priceCheckId" = check_row."id";
UPDATE "MarketSnapshot" SET "analysisType" = 'LISTING_PRICING' WHERE "analysisType" IS NULL;
ALTER TABLE "MarketSnapshot" ALTER COLUMN "analysisType" SET NOT NULL;
CREATE INDEX "MarketSnapshot_targetPropertyId_analysisType_asOf_idx" ON "MarketSnapshot"("targetPropertyId", "analysisType", "asOf");

ALTER TABLE "RateObservation"
  ADD COLUMN "sourcePublishedAt" TIMESTAMP(3),
  ADD COLUMN "sourceEffectiveAt" TIMESTAMP(3),
  ADD COLUMN "businessDate" DATE,
  ADD COLUMN "validFrom" TIMESTAMP(3),
  ADD COLUMN "validTo" TIMESTAMP(3),
  ADD COLUMN "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "supersededAt" TIMESTAMP(3);
ALTER TABLE "RateObservation" DISABLE TRIGGER USER;
UPDATE "RateObservation" SET "businessDate" = "checkIn"::date, "validFrom" = "checkIn", "validTo" = "checkOut";
ALTER TABLE "RateObservation" ENABLE TRIGGER USER;

ALTER TABLE "PanelMembership"
  ADD COLUMN "selectionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "volatilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "collectionCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "targetCadenceHours" INTEGER NOT NULL DEFAULT 72,
  ADD COLUMN "lastSelectedAt" TIMESTAMP(3);

ALTER TABLE "MarketCoverage"
  ADD COLUMN "knownListingCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "activePanelCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "anchorPanelCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rotatingPanelCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "geographicCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "sampleComposition" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "freshness" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "coverageGaps" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "gapPriorityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastSuccessfulAt" TIMESTAMP(3);

CREATE TABLE "DataSourceCapability" (
  "id" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "capability" "SourceCapabilityName" NOT NULL,
  "version" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "contractVersion" TEXT NOT NULL,
  "constraints" JSONB NOT NULL DEFAULT '{}',
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataSourceCapability_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DataSourceCapability_dataSourceId_capability_version_key" ON "DataSourceCapability"("dataSourceId", "capability", "version");
CREATE INDEX "DataSourceCapability_dataSourceId_enabled_validTo_idx" ON "DataSourceCapability"("dataSourceId", "enabled", "validTo");
ALTER TABLE "DataSourceCapability" ADD CONSTRAINT "DataSourceCapability_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ListingVersion" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "changeType" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "platformUnitName" TEXT NOT NULL,
  "providerBrand" TEXT,
  "providerFamily" TEXT,
  "onlineStatus" TEXT NOT NULL,
  "listingStatus" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "sellableUnitId" TEXT NOT NULL,
  "identityEvidence" JSONB NOT NULL DEFAULT '{}',
  "publicAttributes" JSONB NOT NULL DEFAULT '{}',
  "sourcePublishedAt" TIMESTAMP(3),
  "sourceEffectiveAt" TIMESTAMP(3),
  "collectedAt" TIMESTAMP(3) NOT NULL,
  "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "collectorVersion" TEXT,
  "parserVersion" TEXT,
  "collectionRunId" TEXT,
  CONSTRAINT "ListingVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ListingVersion_listingId_version_key" ON "ListingVersion"("listingId", "version");
CREATE UNIQUE INDEX "ListingVersion_listingId_contentHash_key" ON "ListingVersion"("listingId", "contentHash");
CREATE INDEX "ListingVersion_listingId_validFrom_validTo_idx" ON "ListingVersion"("listingId", "validFrom", "validTo");
CREATE INDEX "ListingVersion_collectionRunId_idx" ON "ListingVersion"("collectionRunId");
ALTER TABLE "ListingVersion" ADD CONSTRAINT "ListingVersion_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IdentityEntityVersion" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "changeType" TEXT NOT NULL,
  "publicAttributes" JSONB NOT NULL DEFAULT '{}',
  "identityEvidence" JSONB NOT NULL DEFAULT '{}',
  "confidenceScore" DOUBLE PRECISION NOT NULL,
  "sourcePublishedAt" TIMESTAMP(3),
  "sourceEffectiveAt" TIMESTAMP(3),
  "collectedAt" TIMESTAMP(3) NOT NULL,
  "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "collectorVersion" TEXT,
  "parserVersion" TEXT,
  "collectionRunId" TEXT,
  CONSTRAINT "IdentityEntityVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IdentityEntityVersion_entityType_entityId_version_key" ON "IdentityEntityVersion"("entityType", "entityId", "version");
CREATE UNIQUE INDEX "IdentityEntityVersion_entityType_entityId_contentHash_key" ON "IdentityEntityVersion"("entityType", "entityId", "contentHash");
CREATE INDEX "IdentityEntityVersion_entityType_entityId_validFrom_validTo_idx" ON "IdentityEntityVersion"("entityType", "entityId", "validFrom", "validTo");
CREATE INDEX "IdentityEntityVersion_collectionRunId_idx" ON "IdentityEntityVersion"("collectionRunId");

CREATE TABLE "IdentityRelationVersion" (
  "id" TEXT NOT NULL,
  "relationType" TEXT NOT NULL,
  "fromEntityType" TEXT NOT NULL,
  "fromEntityId" TEXT NOT NULL,
  "toEntityType" TEXT NOT NULL,
  "toEntityId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "matchMethod" TEXT NOT NULL,
  "matchEvidence" JSONB NOT NULL DEFAULT '{}',
  "confidenceScore" DOUBLE PRECISION NOT NULL,
  "conflictState" TEXT NOT NULL DEFAULT 'NONE',
  "changeReason" TEXT NOT NULL,
  "firstDiscoveredAt" TIMESTAMP(3) NOT NULL,
  "lastConfirmedAt" TIMESTAMP(3) NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentityRelationVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IdentityRelationVersion_relation_from_to_version_key" ON "IdentityRelationVersion"("relationType", "fromEntityType", "fromEntityId", "toEntityType", "toEntityId", "version");
CREATE INDEX "IdentityRelationVersion_fromEntityType_fromEntityId_validTo_idx" ON "IdentityRelationVersion"("fromEntityType", "fromEntityId", "validTo");
CREATE INDEX "IdentityRelationVersion_toEntityType_toEntityId_validTo_idx" ON "IdentityRelationVersion"("toEntityType", "toEntityId", "validTo");

CREATE TABLE "TransformationRun" (
  "id" TEXT NOT NULL,
  "dataSourceId" TEXT,
  "collectionRunId" TEXT,
  "transformationType" TEXT NOT NULL,
  "transformationVersion" TEXT NOT NULL,
  "parserVersion" TEXT,
  "normalizerVersion" TEXT,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "inputCount" INTEGER NOT NULL DEFAULT 0,
  "outputCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "TransformationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TransformationRun_dataSourceId_startedAt_idx" ON "TransformationRun"("dataSourceId", "startedAt");
CREATE INDEX "TransformationRun_collectionRunId_idx" ON "TransformationRun"("collectionRunId");
CREATE INDEX "TransformationRun_transformationType_startedAt_idx" ON "TransformationRun"("transformationType", "startedAt");
ALTER TABLE "TransformationRun" ADD CONSTRAINT "TransformationRun_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransformationRun" ADD CONSTRAINT "TransformationRun_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LineageEdge" (
  "id" TEXT NOT NULL,
  "transformationRunId" TEXT NOT NULL,
  "inputType" "LineageNodeType" NOT NULL,
  "inputId" TEXT NOT NULL,
  "outputType" "LineageNodeType" NOT NULL,
  "outputId" TEXT NOT NULL,
  "evidenceRef" TEXT,
  "evidenceHash" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LineageEdge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LineageEdge_transformationRunId_inputType_inputId_outputType_outputId_key" ON "LineageEdge"("transformationRunId", "inputType", "inputId", "outputType", "outputId");
CREATE INDEX "LineageEdge_inputType_inputId_idx" ON "LineageEdge"("inputType", "inputId");
CREATE INDEX "LineageEdge_outputType_outputId_idx" ON "LineageEdge"("outputType", "outputId");
ALTER TABLE "LineageEdge" ADD CONSTRAINT "LineageEdge_transformationRunId_fkey" FOREIGN KEY ("transformationRunId") REFERENCES "TransformationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FreshnessAssessment" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "dataDomain" TEXT NOT NULL,
  "usagePurpose" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL,
  "referenceTime" TIMESTAMP(3),
  "ageSeconds" INTEGER,
  "limitSeconds" INTEGER,
  "state" "FreshnessState" NOT NULL,
  "limitations" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FreshnessAssessment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FreshnessAssessment_entity_domain_usage_policy_time_key" ON "FreshnessAssessment"("entityType", "entityId", "dataDomain", "usagePurpose", "policyVersion", "calculatedAt");
CREATE INDEX "FreshnessAssessment_entityType_entityId_calculatedAt_idx" ON "FreshnessAssessment"("entityType", "entityId", "calculatedAt");
CREATE INDEX "FreshnessAssessment_state_calculatedAt_idx" ON "FreshnessAssessment"("state", "calculatedAt");

CREATE TABLE "ConfidenceAssessment" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "layer" "ConfidenceLayer" NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "level" "ConfidenceLevel" NOT NULL,
  "components" JSONB NOT NULL DEFAULT '{}',
  "limitations" JSONB NOT NULL DEFAULT '[]',
  "calculatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConfidenceAssessment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConfidenceAssessment_entity_layer_rule_time_key" ON "ConfidenceAssessment"("entityType", "entityId", "layer", "ruleVersion", "calculatedAt");
CREATE INDEX "ConfidenceAssessment_entityType_entityId_calculatedAt_idx" ON "ConfidenceAssessment"("entityType", "entityId", "calculatedAt");
CREATE INDEX "ConfidenceAssessment_layer_level_calculatedAt_idx" ON "ConfidenceAssessment"("layer", "level", "calculatedAt");

DROP TABLE "ResultAccessToken";

-- Match Prisma's nullable relation action and generated identifier names exactly.
ALTER TABLE "MarketSnapshot" DROP CONSTRAINT "MarketSnapshot_competitorSetVersionId_fkey";
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_competitorSetVersionId_fkey" FOREIGN KEY ("competitorSetVersionId") REFERENCES "CompetitorSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER INDEX "ConfidenceAssessment_entity_layer_rule_time_key" RENAME TO "ConfidenceAssessment_entityType_entityId_layer_ruleVersion__key";
ALTER INDEX "FreshnessAssessment_entity_domain_usage_policy_time_key" RENAME TO "FreshnessAssessment_entityType_entityId_dataDomain_usagePur_key";
ALTER INDEX "IdentityRelationVersion_relation_from_to_version_key" RENAME TO "IdentityRelationVersion_relationType_fromEntityType_fromEnt_key";
ALTER INDEX "LineageEdge_transformationRunId_inputType_inputId_outputType_ou" RENAME TO "LineageEdge_transformationRunId_inputType_inputId_outputTyp_key";
