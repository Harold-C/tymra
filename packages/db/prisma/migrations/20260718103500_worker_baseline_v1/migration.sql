-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OTA', 'META_SEARCH', 'PUBLIC_DATA', 'MANUAL_IMPORT', 'FIXTURE');

-- CreateEnum
CREATE TYPE "SourceLifecycle" AS ENUM ('RESEARCH', 'POC', 'PILOT', 'PRODUCTION', 'SUSPENDED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "InternalApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LegalRightsStatus" AS ENUM ('ALLOWED', 'REVIEW', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN', 'UNCONFIGURED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SourceEnvironment" AS ENUM ('DEVELOPMENT', 'TEST', 'PILOT', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "CacheHitType" AS ENUM ('EXACT_FRESH', 'PARTIAL', 'STALE', 'MISS', 'NEGATIVE', 'CONFLICT');

-- CreateEnum
CREATE TYPE "AvailabilityCohortStatus" AS ENUM ('AVAILABLE', 'RESTRICTED', 'UNAVAILABLE', 'DATA_MISSING', 'SOURCE_FAILURE');

-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('BUILDING', 'READY', 'PARTIAL', 'BLOCKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "QualityGateResult" AS ENUM ('PASSED', 'PASSED_WITH_LIMITATIONS', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PanelMembershipType" AS ENUM ('ANCHOR', 'ROTATING');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('CORE', 'EXTENDED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "WorkerAnalysisStatus" AS ENUM ('RECEIVED', 'RESOLVING_INPUT', 'NEEDS_CONFIRMATION', 'QUEUED', 'CHECKING_CACHE', 'COLLECTING_TARGET', 'COLLECTING_COMPETITORS', 'COLLECTING_MARKET_SIGNALS', 'NORMALISING', 'VALIDATING', 'BUILDING_SNAPSHOT', 'ANALYSING', 'PARTIAL', 'INSUFFICIENT_DATA', 'SOURCE_UNAVAILABLE', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'DEAD_LETTER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'INPUT_RESOLUTION';
ALTER TYPE "JobType" ADD VALUE 'LISTING_RESOLUTION';
ALTER TYPE "JobType" ADD VALUE 'CATALOG_DISCOVERY';
ALTER TYPE "JobType" ADD VALUE 'AVAILABILITY_COLLECTION';
ALTER TYPE "JobType" ADD VALUE 'POLICY_COLLECTION';
ALTER TYPE "JobType" ADD VALUE 'PUBLIC_DATA_COLLECTION';
ALTER TYPE "JobType" ADD VALUE 'EVENT_COLLECTION';
ALTER TYPE "JobType" ADD VALUE 'WEATHER_COLLECTION';
ALTER TYPE "JobType" ADD VALUE 'TRANSPORT_COLLECTION';
ALTER TYPE "JobType" ADD VALUE 'SNAPSHOT_GENERATION';
ALTER TYPE "JobType" ADD VALUE 'PRICE_ANALYSIS';
ALTER TYPE "JobType" ADD VALUE 'ANCHOR_PANEL_COLLECTION';
ALTER TYPE "JobType" ADD VALUE 'ROTATING_PANEL_COLLECTION';
ALTER TYPE "JobType" ADD VALUE 'RETENTION_CLEANUP';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProviderType" ADD VALUE 'OTA';
ALTER TYPE "ProviderType" ADD VALUE 'PUBLIC';
ALTER TYPE "ProviderType" ADD VALUE 'FIXTURE';

-- AlterTable
ALTER TABLE "CollectionRun" ADD COLUMN     "analysisRequestId" TEXT,
ADD COLUMN     "collectionProfileId" TEXT,
ADD COLUMN     "correlationId" TEXT;

-- AlterTable
ALTER TABLE "DataSource" ADD COLUMN     "accessMethod" TEXT,
ADD COLUMN     "adapterKey" TEXT,
ADD COLUMN     "allowedUsage" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "concurrencyLimit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "dailyBudget" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "derivedAnalysisPermission" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "displayPermission" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "environments" "SourceEnvironment"[] DEFAULT ARRAY['DEVELOPMENT']::"SourceEnvironment"[],
ADD COLUMN     "healthSummary" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "internalApprovalStatus" "InternalApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "legalRightsStatus" "LegalRightsStatus" NOT NULL DEFAULT 'REVIEW',
ADD COLUMN     "lifecycle" "SourceLifecycle" NOT NULL DEFAULT 'RESEARCH',
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'UNCONFIGURED',
ADD COLUMN     "retentionPolicy" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "sourceType" "SourceType" NOT NULL DEFAULT 'PUBLIC_DATA',
ADD COLUMN     "supportedDomains" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "EmailDelivery" ADD COLUMN     "analysisRequestId" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "analysisRequestId" TEXT,
ADD COLUMN     "collectionRunId" TEXT,
ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "listingId" TEXT,
ADD COLUMN     "querySignatureHash" TEXT,
ADD COLUMN     "queueName" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "resultVersionId" TEXT,
ADD COLUMN     "sellableUnitId" TEXT,
ADD COLUMN     "snapshotId" TEXT,
ADD COLUMN     "sourceId" TEXT;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "canonicalUrl" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "legalRightsStatus" "LegalRightsStatus" NOT NULL DEFAULT 'REVIEW',
ADD COLUMN     "listingStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "matchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'UNCONFIGURED',
ADD COLUMN     "propertyId" TEXT,
ADD COLUMN     "rawUrl" TEXT,
ADD COLUMN     "sourceListingId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

UPDATE "Listing" AS listing
SET "propertyId" = unit."propertyId",
    "canonicalUrl" = listing."url",
    "rawUrl" = listing."url",
    "sourceListingId" = listing."externalId",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "SellableUnit" AS unit
WHERE unit."id" = listing."unitId";

ALTER TABLE "Listing"
  ALTER COLUMN "propertyId" SET NOT NULL,
  ALTER COLUMN "canonicalUrl" SET NOT NULL,
  ALTER COLUMN "rawUrl" SET NOT NULL,
  ALTER COLUMN "sourceListingId" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "identityConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "legalOrBrandName" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "rto" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "territorialAuthority" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Pacific/Auckland';

-- AlterTable
ALTER TABLE "RateObservation" ADD COLUMN     "adults" INTEGER,
ADD COLUMN     "bedType" TEXT,
ADD COLUMN     "cancellationPolicy" TEXT,
ADD COLUMN     "checkIn" TIMESTAMP(3),
ADD COLUMN     "checkOut" TIMESTAMP(3),
ADD COLUMN     "childrenAges" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "collectionProfileId" TEXT,
ADD COLUMN     "collectorVersion" TEXT,
ADD COLUMN     "evidenceRef" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1,
ADD COLUMN     "legalRightsStatus" "LegalRightsStatus",
ADD COLUMN     "localTimezone" TEXT,
ADD COLUMN     "mealPlan" TEXT,
ADD COLUMN     "nights" INTEGER,
ADD COLUMN     "nzdTotalMinor" INTEGER,
ADD COLUMN     "observedAt" TIMESTAMP(3),
ADD COLUMN     "occupancyCapacity" INTEGER,
ADD COLUMN     "operationalStatus" "OperationalStatus",
ADD COLUMN     "optionalFeesMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parserVersion" TEXT,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "propertyId" TEXT,
ADD COLUMN     "rateFence" TEXT,
ADD COLUMN     "requestedAt" TIMESTAMP(3),
ADD COLUMN     "restrictionReason" TEXT,
ADD COLUMN     "roomTypeNormalized" TEXT,
ADD COLUMN     "roomTypeRaw" TEXT,
ADD COLUMN     "sellableUnitId" TEXT,
ADD COLUMN     "sourceListingId" TEXT,
ADD COLUMN     "sourceUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "unitAttributesVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "unitConstraints" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "units" INTEGER;

-- AlterTable
ALTER TABLE "ResultVersion" ADD COLUMN     "analysisRequestId" TEXT,
ADD COLUMN     "marketSnapshotId" TEXT;

-- AlterTable
ALTER TABLE "SellableUnit" ADD COLUMN     "accessibilityAttributes" JSONB,
ADD COLUMN     "bathrooms" DOUBLE PRECISION,
ADD COLUMN     "bedConfiguration" JSONB,
ADD COLUMN     "entireOrShared" TEXT;

-- AlterTable
ALTER TABLE "StayQuery" ADD COLUMN     "cancellationPolicy" TEXT NOT NULL DEFAULT 'ANY_PUBLIC',
ADD COLUMN     "childrenAges" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "mealPlan" TEXT NOT NULL DEFAULT 'ANY_PUBLIC',
ADD COLUMN     "publicRateContext" TEXT NOT NULL DEFAULT 'PUBLIC_ANONYMOUS',
ADD COLUMN     "querySemanticsVersion" TEXT NOT NULL DEFAULT 'v1',
ADD COLUMN     "querySignatureHash" TEXT,
ADD COLUMN     "ratePlan" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "taxAndFeePolicy" TEXT NOT NULL DEFAULT 'MANDATORY_INCLUDED',
ADD COLUMN     "unitConstraints" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "QueryPlan" (
    "id" TEXT NOT NULL,
    "priceCheckId" TEXT,
    "analysisRequestId" TEXT,
    "stayQueryId" TEXT NOT NULL,
    "dataSourceId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "dateBasket" JSONB NOT NULL,
    "querySignatureHash" TEXT NOT NULL,
    "querySignaturePayload" JSONB NOT NULL,
    "collectionProfileKey" TEXT NOT NULL,
    "generationPolicyVersion" TEXT NOT NULL DEFAULT 'query-plan-v1',
    "freshnessPolicyVersion" TEXT NOT NULL DEFAULT 'freshness-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionProfile" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sellableUnitId" TEXT,
    "dataSourceId" TEXT,
    "ipRegion" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NZD',
    "deviceType" TEXT NOT NULL,
    "loggedInState" TEXT NOT NULL,
    "memberState" TEXT NOT NULL,
    "mobilePriceContext" TEXT NOT NULL,
    "publicRateContext" TEXT NOT NULL,
    "browserProfileVersion" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionProfile_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CollectionProfile" (
  "id", "key", "dataSourceId", "ipRegion", "locale", "currency", "deviceType",
  "loggedInState", "memberState", "mobilePriceContext", "publicRateContext",
  "browserProfileVersion", "version", "createdAt", "updatedAt"
)
SELECT DISTINCT
  'legacy-profile-' || source."id",
  'legacy:' || source."key" || ':nz:en:nzd:desktop:public:v1',
  source."id", 'NZ', 'en-NZ', 'NZD', 'DESKTOP', 'LOGGED_OUT', 'NON_MEMBER',
  'STANDARD', 'LEGACY_PUBLIC', 'legacy-migration-v1', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "DataSource" AS source
JOIN "RateObservation" AS observation ON observation."dataSourceId" = source."id";

ALTER TABLE "RateObservation" DISABLE TRIGGER USER;

UPDATE "RateObservation" AS observation
SET "propertyId" = unit."propertyId",
    "sellableUnitId" = listing."unitId",
    "sourceListingId" = listing."externalId",
    "collectionProfileId" = 'legacy-profile-' || observation."dataSourceId",
    "requestedAt" = observation."collectedAt",
    "observedAt" = observation."collectedAt",
    "checkIn" = query."checkIn",
    "checkOut" = query."checkOut",
    "nights" = query."nights",
    "adults" = query."adults",
    "units" = query."units",
    "localTimezone" = query."timezone",
    "roomTypeRaw" = listing."platformUnitName",
    "roomTypeNormalized" = unit."canonicalName",
    "nzdTotalMinor" = observation."totalAmountMinor",
    "collectorVersion" = 'legacy-migration-v1',
    "parserVersion" = 'legacy-migration-v1',
    "evidenceRef" = 'legacy://' || observation."id",
    "sourceUrl" = listing."url",
    "legalRightsStatus" = CASE WHEN source."rightsAllowStorage" AND source."rightsAllowDerivedAnalysis" THEN 'ALLOWED'::"LegalRightsStatus" ELSE 'REVIEW'::"LegalRightsStatus" END,
    "operationalStatus" = CASE WHEN source."healthStatus" = 'HEALTHY' THEN 'HEALTHY'::"OperationalStatus" WHEN source."healthStatus" = 'DEGRADED' THEN 'DEGRADED'::"OperationalStatus" ELSE 'DOWN'::"OperationalStatus" END
FROM "Listing" AS listing
JOIN "SellableUnit" AS unit ON unit."id" = listing."unitId"
CROSS JOIN "StayQuery" AS query
CROSS JOIN "DataSource" AS source
WHERE listing."id" = observation."listingId"
  AND query."id" = observation."stayQueryId"
  AND source."id" = observation."dataSourceId";

ALTER TABLE "RateObservation"
  ALTER COLUMN "propertyId" SET NOT NULL,
  ALTER COLUMN "sellableUnitId" SET NOT NULL,
  ALTER COLUMN "sourceListingId" SET NOT NULL,
  ALTER COLUMN "collectionProfileId" SET NOT NULL,
  ALTER COLUMN "requestedAt" SET NOT NULL,
  ALTER COLUMN "observedAt" SET NOT NULL,
  ALTER COLUMN "checkIn" SET NOT NULL,
  ALTER COLUMN "checkOut" SET NOT NULL,
  ALTER COLUMN "nights" SET NOT NULL,
  ALTER COLUMN "adults" SET NOT NULL,
  ALTER COLUMN "units" SET NOT NULL,
  ALTER COLUMN "localTimezone" SET NOT NULL,
  ALTER COLUMN "roomTypeRaw" SET NOT NULL,
  ALTER COLUMN "roomTypeNormalized" SET NOT NULL,
  ALTER COLUMN "nzdTotalMinor" SET NOT NULL,
  ALTER COLUMN "collectorVersion" SET NOT NULL,
  ALTER COLUMN "parserVersion" SET NOT NULL,
  ALTER COLUMN "evidenceRef" SET NOT NULL,
  ALTER COLUMN "sourceUrl" SET NOT NULL,
  ALTER COLUMN "legalRightsStatus" SET NOT NULL,
  ALTER COLUMN "operationalStatus" SET NOT NULL;

ALTER TABLE "RateObservation" ENABLE TRIGGER USER;

-- CreateTable
CREATE TABLE "WorkerAnalysisRequest" (
    "id" TEXT NOT NULL,
    "rawInput" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "emailHash" TEXT,
    "encryptedEmail" TEXT,
    "priceCheckId" TEXT,
    "serviceConsent" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "propertyId" TEXT,
    "sellableUnitId" TEXT,
    "targetListingId" TEXT,
    "dataSourceId" TEXT,
    "status" "WorkerAnalysisStatus" NOT NULL DEFAULT 'RECEIVED',
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "cacheHitType" "CacheHitType" NOT NULL DEFAULT 'MISS',
    "confirmationCandidates" JSONB NOT NULL DEFAULT '[]',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "isPreview" BOOLEAN NOT NULL DEFAULT true,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerAnalysisRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorSetVersion" (
    "id" TEXT NOT NULL,
    "analysisRequestId" TEXT NOT NULL,
    "targetSellableUnitId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "marketScope" JSONB NOT NULL,
    "expansionLevel" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorSetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorSetMember" (
    "id" TEXT NOT NULL,
    "competitorSetVersionId" TEXT NOT NULL,
    "competitorSellableUnitId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "comparabilityScore" DOUBLE PRECISION NOT NULL,
    "geographyScore" DOUBLE PRECISION NOT NULL,
    "propertyTypeScore" DOUBLE PRECISION NOT NULL,
    "unitScore" DOUBLE PRECISION NOT NULL,
    "qualityScore" DOUBLE PRECISION NOT NULL,
    "priceTierScore" DOUBLE PRECISION NOT NULL,
    "inclusionReason" TEXT,
    "exclusionReason" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,

    CONSTRAINT "CompetitorSetMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DateSnapshot" (
    "id" TEXT NOT NULL,
    "analysisRequestId" TEXT NOT NULL,
    "marketSnapshotId" TEXT,
    "stayDate" TIMESTAMP(3) NOT NULL,
    "targetRateMinor" INTEGER,
    "validCompetitorCount" INTEGER NOT NULL,
    "availableCount" INTEGER NOT NULL,
    "restrictedCount" INTEGER NOT NULL,
    "unavailableCount" INTEGER NOT NULL,
    "dataMissingCount" INTEGER NOT NULL,
    "sourceFailureCount" INTEGER NOT NULL,
    "marketMedianMinor" INTEGER,
    "lowerQuartileMinor" INTEGER,
    "upperQuartileMinor" INTEGER,
    "availabilityCompression" DOUBLE PRECISION,
    "eventImpact" DOUBLE PRECISION,
    "disruptionImpact" JSONB NOT NULL,
    "newestObservationAt" TIMESTAMP(3),
    "oldestObservationAt" TIMESTAMP(3),
    "maxObservationSkewMinutes" INTEGER,
    "freshness" JSONB NOT NULL,
    "qualityGateResult" "QualityGateResult" NOT NULL,
    "qualityFlags" JSONB NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "confidenceLevel" "ConfidenceLevel" NOT NULL,
    "observationIds" JSONB NOT NULL,
    "snapshotVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "analysisRequestId" TEXT NOT NULL,
    "priceCheckId" TEXT,
    "targetPropertyId" TEXT NOT NULL,
    "targetSellableUnitId" TEXT NOT NULL,
    "targetListingId" TEXT NOT NULL,
    "queryPlanId" TEXT NOT NULL,
    "queryPlanVersion" INTEGER NOT NULL,
    "competitorSetVersionId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "marketScope" JSONB NOT NULL,
    "observationIds" JSONB NOT NULL,
    "sourceRegistryVersions" JSONB NOT NULL,
    "collectionProfileVersions" JSONB NOT NULL,
    "newestObservationAt" TIMESTAMP(3),
    "oldestObservationAt" TIMESTAMP(3),
    "maxObservationSkewMinutes" INTEGER,
    "sourceCoverage" DOUBLE PRECISION NOT NULL,
    "competitorCoverage" DOUBLE PRECISION NOT NULL,
    "missingRate" DOUBLE PRECISION NOT NULL,
    "conflicts" JSONB NOT NULL,
    "exclusionReasons" JSONB NOT NULL,
    "qualityGateResult" "QualityGateResult" NOT NULL,
    "qualityFlags" JSONB NOT NULL,
    "snapshotVersion" TEXT NOT NULL,
    "generationPolicyVersion" TEXT NOT NULL,
    "freshnessPolicyVersion" TEXT NOT NULL,
    "qualityGateVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "SnapshotStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceAnalysis" (
    "id" TEXT NOT NULL,
    "analysisRequestId" TEXT NOT NULL,
    "marketSnapshotId" TEXT NOT NULL,
    "marketMedianMinor" INTEGER,
    "weightedRange" JSONB NOT NULL,
    "percentile" DOUBLE PRECISION,
    "comparableCount" INTEGER NOT NULL,
    "marketRateIndex" DOUBLE PRECISION,
    "availabilityCompression" DOUBLE PRECISION,
    "demandPressure" DOUBLE PRECISION,
    "eventImpact" DOUBLE PRECISION,
    "accessibilityEffect" TEXT NOT NULL,
    "demandDisplacementEffect" TEXT NOT NULL,
    "strandedTravellerEffect" TEXT NOT NULL,
    "disruptionDirection" TEXT NOT NULL,
    "marketReferenceRange" JSONB NOT NULL,
    "reviewRange" JSONB NOT NULL,
    "targetPricePosition" TEXT NOT NULL,
    "keyDates" JSONB NOT NULL,
    "reasonCodes" JSONB NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "confidenceComponents" JSONB NOT NULL,
    "dataGaps" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelMembership" (
    "id" TEXT NOT NULL,
    "sellableUnitId" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "membershipType" "PanelMembershipType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "replacementReason" TEXT,
    "rotationDueAt" TIMESTAMP(3),
    "coverageGap" JSONB NOT NULL DEFAULT '{}',
    "lastSuccessfulAt" TIMESTAMP(3),
    "coverage24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coverage72h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanelMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueryCacheEntry" (
    "id" TEXT NOT NULL,
    "querySignatureHash" TEXT NOT NULL,
    "collectionProfileKey" TEXT NOT NULL,
    "hitType" "CacheHitType" NOT NULL,
    "observationIds" JSONB NOT NULL,
    "negativeReason" TEXT,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueryCacheEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawArtifact" (
    "id" TEXT NOT NULL,
    "collectionRunId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "payload" JSONB,
    "containsSensitiveData" BOOLEAN NOT NULL DEFAULT false,
    "parserFailure" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceHealthCheck" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "status" "OperationalStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceHealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL,
    "queueName" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "lastEnqueuedAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueryPlan_querySignatureHash_createdAt_idx" ON "QueryPlan"("querySignatureHash", "createdAt");

-- CreateIndex
CREATE INDEX "QueryPlan_priceCheckId_version_idx" ON "QueryPlan"("priceCheckId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "QueryPlan_analysisRequestId_version_key" ON "QueryPlan"("analysisRequestId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionProfile_key_key" ON "CollectionProfile"("key");

-- CreateIndex
CREATE INDEX "CollectionProfile_dataSourceId_publicRateContext_idx" ON "CollectionProfile"("dataSourceId", "publicRateContext");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerAnalysisRequest_priceCheckId_key" ON "WorkerAnalysisRequest"("priceCheckId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerAnalysisRequest_idempotencyKey_key" ON "WorkerAnalysisRequest"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerAnalysisRequest_correlationId_key" ON "WorkerAnalysisRequest"("correlationId");

-- CreateIndex
CREATE INDEX "WorkerAnalysisRequest_status_createdAt_idx" ON "WorkerAnalysisRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerAnalysisRequest_sellableUnitId_createdAt_idx" ON "WorkerAnalysisRequest"("sellableUnitId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerAnalysisRequest_emailHash_status_idx" ON "WorkerAnalysisRequest"("emailHash", "status");

-- CreateIndex
CREATE INDEX "CompetitorSetVersion_targetSellableUnitId_effectiveTo_idx" ON "CompetitorSetVersion"("targetSellableUnitId", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorSetVersion_analysisRequestId_version_key" ON "CompetitorSetVersion"("analysisRequestId", "version");

-- CreateIndex
CREATE INDEX "CompetitorSetMember_competitorSellableUnitId_effectiveTo_idx" ON "CompetitorSetMember"("competitorSellableUnitId", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorSetMember_competitorSetVersionId_competitorSellab_key" ON "CompetitorSetMember"("competitorSetVersionId", "competitorSellableUnitId");

-- CreateIndex
CREATE INDEX "DateSnapshot_stayDate_createdAt_idx" ON "DateSnapshot"("stayDate", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DateSnapshot_analysisRequestId_stayDate_snapshotVersion_key" ON "DateSnapshot"("analysisRequestId", "stayDate", "snapshotVersion");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSnapshot_contentHash_key" ON "MarketSnapshot"("contentHash");

-- CreateIndex
CREATE INDEX "MarketSnapshot_analysisRequestId_asOf_idx" ON "MarketSnapshot"("analysisRequestId", "asOf");

-- CreateIndex
CREATE INDEX "MarketSnapshot_targetSellableUnitId_asOf_idx" ON "MarketSnapshot"("targetSellableUnitId", "asOf");

-- CreateIndex
CREATE INDEX "PriceAnalysis_analysisRequestId_createdAt_idx" ON "PriceAnalysis"("analysisRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "PanelMembership_marketKey_membershipType_active_idx" ON "PanelMembership"("marketKey", "membershipType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PanelMembership_sellableUnitId_marketKey_key" ON "PanelMembership"("sellableUnitId", "marketKey");

-- CreateIndex
CREATE INDEX "QueryCacheEntry_validUntil_hitType_idx" ON "QueryCacheEntry"("validUntil", "hitType");

-- CreateIndex
CREATE UNIQUE INDEX "QueryCacheEntry_querySignatureHash_collectionProfileKey_key" ON "QueryCacheEntry"("querySignatureHash", "collectionProfileKey");

-- CreateIndex
CREATE INDEX "RawArtifact_expiresAt_deletedAt_idx" ON "RawArtifact"("expiresAt", "deletedAt");

-- CreateIndex
CREATE INDEX "RawArtifact_collectionRunId_idx" ON "RawArtifact"("collectionRunId");

-- CreateIndex
CREATE INDEX "SourceHealthCheck_dataSourceId_checkedAt_idx" ON "SourceHealthCheck"("dataSourceId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleDefinition_key_key" ON "ScheduleDefinition"("key");

-- CreateIndex
CREATE INDEX "CollectionRun_analysisRequestId_createdAt_idx" ON "CollectionRun"("analysisRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailDelivery_analysisRequestId_queuedAt_idx" ON "EmailDelivery"("analysisRequestId", "queuedAt");

-- CreateIndex
CREATE INDEX "Job_queueName_status_runAt_priority_idx" ON "Job"("queueName", "status", "runAt", "priority");

-- CreateIndex
CREATE INDEX "Job_analysisRequestId_createdAt_idx" ON "Job"("analysisRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "RateObservation_sellableUnitId_checkIn_collectedAt_idx" ON "RateObservation"("sellableUnitId", "checkIn", "collectedAt");

-- CreateIndex
CREATE INDEX "ResultVersion_analysisRequestId_status_idx" ON "ResultVersion"("analysisRequestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ResultVersion_analysisRequestId_version_key" ON "ResultVersion"("analysisRequestId", "version");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueryPlan" ADD CONSTRAINT "QueryPlan_priceCheckId_fkey" FOREIGN KEY ("priceCheckId") REFERENCES "PriceCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueryPlan" ADD CONSTRAINT "QueryPlan_analysisRequestId_fkey" FOREIGN KEY ("analysisRequestId") REFERENCES "WorkerAnalysisRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueryPlan" ADD CONSTRAINT "QueryPlan_stayQueryId_fkey" FOREIGN KEY ("stayQueryId") REFERENCES "StayQuery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueryPlan" ADD CONSTRAINT "QueryPlan_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProfile" ADD CONSTRAINT "CollectionProfile_sellableUnitId_fkey" FOREIGN KEY ("sellableUnitId") REFERENCES "SellableUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProfile" ADD CONSTRAINT "CollectionProfile_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAnalysisRequest" ADD CONSTRAINT "WorkerAnalysisRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAnalysisRequest" ADD CONSTRAINT "WorkerAnalysisRequest_sellableUnitId_fkey" FOREIGN KEY ("sellableUnitId") REFERENCES "SellableUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAnalysisRequest" ADD CONSTRAINT "WorkerAnalysisRequest_targetListingId_fkey" FOREIGN KEY ("targetListingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAnalysisRequest" ADD CONSTRAINT "WorkerAnalysisRequest_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAnalysisRequest" ADD CONSTRAINT "WorkerAnalysisRequest_priceCheckId_fkey" FOREIGN KEY ("priceCheckId") REFERENCES "PriceCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorSetVersion" ADD CONSTRAINT "CompetitorSetVersion_analysisRequestId_fkey" FOREIGN KEY ("analysisRequestId") REFERENCES "WorkerAnalysisRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorSetVersion" ADD CONSTRAINT "CompetitorSetVersion_targetSellableUnitId_fkey" FOREIGN KEY ("targetSellableUnitId") REFERENCES "SellableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorSetMember" ADD CONSTRAINT "CompetitorSetMember_competitorSetVersionId_fkey" FOREIGN KEY ("competitorSetVersionId") REFERENCES "CompetitorSetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorSetMember" ADD CONSTRAINT "CompetitorSetMember_competitorSellableUnitId_fkey" FOREIGN KEY ("competitorSellableUnitId") REFERENCES "SellableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DateSnapshot" ADD CONSTRAINT "DateSnapshot_analysisRequestId_fkey" FOREIGN KEY ("analysisRequestId") REFERENCES "WorkerAnalysisRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DateSnapshot" ADD CONSTRAINT "DateSnapshot_marketSnapshotId_fkey" FOREIGN KEY ("marketSnapshotId") REFERENCES "MarketSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_analysisRequestId_fkey" FOREIGN KEY ("analysisRequestId") REFERENCES "WorkerAnalysisRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_priceCheckId_fkey" FOREIGN KEY ("priceCheckId") REFERENCES "PriceCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_queryPlanId_fkey" FOREIGN KEY ("queryPlanId") REFERENCES "QueryPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_competitorSetVersionId_fkey" FOREIGN KEY ("competitorSetVersionId") REFERENCES "CompetitorSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAnalysis" ADD CONSTRAINT "PriceAnalysis_analysisRequestId_fkey" FOREIGN KEY ("analysisRequestId") REFERENCES "WorkerAnalysisRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAnalysis" ADD CONSTRAINT "PriceAnalysis_marketSnapshotId_fkey" FOREIGN KEY ("marketSnapshotId") REFERENCES "MarketSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelMembership" ADD CONSTRAINT "PanelMembership_sellableUnitId_fkey" FOREIGN KEY ("sellableUnitId") REFERENCES "SellableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceHealthCheck" ADD CONSTRAINT "SourceHealthCheck_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_analysisRequestId_fkey" FOREIGN KEY ("analysisRequestId") REFERENCES "WorkerAnalysisRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_collectionProfileId_fkey" FOREIGN KEY ("collectionProfileId") REFERENCES "CollectionProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_sellableUnitId_fkey" FOREIGN KEY ("sellableUnitId") REFERENCES "SellableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_collectionProfileId_fkey" FOREIGN KEY ("collectionProfileId") REFERENCES "CollectionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultVersion" ADD CONSTRAINT "ResultVersion_analysisRequestId_fkey" FOREIGN KEY ("analysisRequestId") REFERENCES "WorkerAnalysisRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultVersion" ADD CONSTRAINT "ResultVersion_marketSnapshotId_fkey" FOREIGN KEY ("marketSnapshotId") REFERENCES "MarketSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_analysisRequestId_fkey" FOREIGN KEY ("analysisRequestId") REFERENCES "WorkerAnalysisRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_analysisRequestId_fkey" FOREIGN KEY ("analysisRequestId") REFERENCES "WorkerAnalysisRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
