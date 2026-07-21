-- CreateEnum
CREATE TYPE "PriceCheckStatus" AS ENUM ('DRAFT', 'VALIDATING', 'NEEDS_CONFIRMATION', 'QUEUED', 'COLLECTING', 'NORMALIZING', 'ANALYSING', 'AUTO_VALIDATING', 'EXCEPTION', 'READY', 'PUBLISHED', 'PARTIAL', 'INSUFFICIENT_DATA', 'UNSUPPORTED', 'SOURCE_UNAVAILABLE', 'FAILED', 'CANCELLED', 'EXPIRED', 'WITHDRAWN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('SUPPORTED', 'PILOT_AVAILABLE', 'COMING_SOON', 'INSUFFICIENT_MARKET_DATA', 'DISABLED');

-- CreateEnum
CREATE TYPE "DataSourceStatus" AS ENUM ('APPROVED', 'PILOT', 'SUSPENDED', 'DISABLED', 'DEPRECATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SourceHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('DEMO', 'MANUAL');

-- CreateEnum
CREATE TYPE "CompetitorRole" AS ENUM ('CORE', 'REFERENCE', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "FeeCompleteness" AS ENUM ('COMPLETE', 'PARTIAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'SOLD_OUT', 'CLOSED_TO_ARRIVAL', 'MINIMUM_STAY_RESTRICTION', 'LISTING_UNAVAILABLE', 'DATA_UNAVAILABLE', 'PLATFORM_ERROR');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('NO_CLEAR_RISK', 'WATCH', 'REVIEW', 'HIGH_PRIORITY');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('PROPERTY_MATCH', 'UNIT_MATCH', 'COMPETITOR_RELATIONSHIP', 'FEE_COMPLETENESS', 'RATE_OUTLIER', 'SOURCE_CONFLICT', 'SOURCE_FAILURE', 'HIGH_PRIORITY_REVIEW', 'RESULT_SCHEMA', 'USER_REPORT');

-- CreateEnum
CREATE TYPE "ExceptionPriority" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CollectionMode" AS ENUM ('ON_DEMAND', 'MARKET_COVERAGE');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('PROPERTY_IDENTIFICATION', 'UNIT_IDENTIFICATION', 'RATE_COLLECTION', 'RATE_NORMALIZATION', 'COMPETITOR_BUILD', 'ANALYSIS', 'AUTO_VALIDATION', 'RESULT_GENERATION', 'RESULT_PUBLICATION', 'EMAIL_DELIVERY', 'LINK_EXPIRY', 'MARKET_COVERAGE_COLLECTION', 'SOURCE_HEALTH_CHECK');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResultVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('COMPETITORS_RELEVANT', 'COMPETITORS_NOT_RELEVANT', 'INSIGHT_USEFUL', 'REVIEWED_PRICE', 'CHANGED_PRICE', 'NO_ACTION_NEEDED', 'REPORT_ISSUE');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('CHECK_RECEIVED', 'CONFIRMATION_REQUIRED', 'CHECK_PROCESSING', 'RESULT_READY', 'PARTIAL_RESULT', 'INSUFFICIENT_DATA', 'CHECK_FAILED', 'LINK_REISSUED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MarketSignalType" AS ENUM ('PUBLIC_HOLIDAY', 'ANNIVERSARY_DAY', 'SCHOOL_HOLIDAY', 'MAJOR_EVENT', 'WEEKEND_PATTERN', 'PRICE_RISING', 'AVAILABILITY_TIGHTENING', 'RESTRICTION_INCREASING', 'WEATHER_OR_ACCESS_DISRUPTION');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'IMPORTED', 'PARTIAL', 'REJECTED');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'NZ',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "microMarket" TEXT,
    "accommodationType" TEXT NOT NULL,
    "supportStatus" "MarketStatus" NOT NULL DEFAULT 'COMING_SOON',
    "mergedIntoId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellableUnit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "officialName" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "bedrooms" INTEGER,
    "bedTypes" JSONB NOT NULL,
    "amenities" JSONB NOT NULL,
    "unitType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "mergedIntoId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellableUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "platformUnitName" TEXT NOT NULL,
    "firstDiscoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastConfirmedAt" TIMESTAMP(3),
    "onlineStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StayQuery" (
    "id" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 2,
    "children" INTEGER NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'NZD',
    "cancellationCategory" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StayQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "status" "DataSourceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "healthStatus" "SourceHealthStatus" NOT NULL DEFAULT 'DOWN',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "acquisitionMethod" TEXT NOT NULL,
    "licenseBasis" TEXT,
    "rightsAllowStorage" BOOLEAN NOT NULL DEFAULT false,
    "rightsAllowDerivedAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "rightsAllowDisplay" BOOLEAN NOT NULL DEFAULT false,
    "retentionDays" INTEGER,
    "owner" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "errorRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "dataSourceId" TEXT NOT NULL,
    "priceCheckId" TEXT,
    "mode" "CollectionMode" NOT NULL,
    "status" "CollectionStatus" NOT NULL DEFAULT 'PENDING',
    "scope" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorSummary" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateObservation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "stayQueryId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "collectionRunId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NZD',
    "baseAmountMinor" INTEGER NOT NULL,
    "mandatoryFeesMinor" INTEGER NOT NULL,
    "taxesMinor" INTEGER NOT NULL,
    "platformFeesMinor" INTEGER NOT NULL,
    "totalAmountMinor" INTEGER NOT NULL,
    "effectiveNightlyTotalMinor" INTEGER NOT NULL,
    "cancellationCategory" TEXT NOT NULL,
    "minimumStay" INTEGER,
    "availabilityStatus" "AvailabilityStatus" NOT NULL,
    "feeCompleteness" "FeeCompleteness" NOT NULL,
    "qualityFlags" JSONB NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "rawDataStored" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorRelationship" (
    "id" TEXT NOT NULL,
    "targetUnitId" TEXT NOT NULL,
    "competitorUnitId" TEXT NOT NULL,
    "role" "CompetitorRole" NOT NULL,
    "version" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "reasonCode" TEXT NOT NULL,
    "suggestedBy" TEXT NOT NULL,
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "feedbackId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompetitorRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketCoverage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MarketStatus" NOT NULL,
    "region" JSONB NOT NULL,
    "knownPropertyCount" INTEGER NOT NULL DEFAULT 0,
    "knownUnitCount" INTEGER NOT NULL DEFAULT 0,
    "coverage24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coverage72h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "collectionSuccessRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceFailureRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "competitorCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acceptNewChecks" BOOLEAN NOT NULL DEFAULT true,
    "lastHealthAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSignal" (
    "id" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "type" "MarketSignalType" NOT NULL,
    "region" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "dataSourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "evidence" JSONB NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceCheck" (
    "id" TEXT NOT NULL,
    "rawInput" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "encryptedEmail" TEXT NOT NULL,
    "serviceConsent" BOOLEAN NOT NULL,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "propertyId" TEXT,
    "unitId" TEXT,
    "stayQueryId" TEXT,
    "marketKey" TEXT NOT NULL,
    "status" "PriceCheckStatus" NOT NULL DEFAULT 'DRAFT',
    "accessKeyHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "dataSnapshotVersion" TEXT,
    "rulesVersion" TEXT NOT NULL DEFAULT 'BR-v1.1',
    "currentResultVersionNumber" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultVersion" (
    "id" TEXT NOT NULL,
    "priceCheckId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ResultVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "outcome" "PriceCheckStatus" NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "dataLastCheckedAt" TIMESTAMP(3),
    "analysisVersion" TEXT NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "payload" JSONB NOT NULL,
    "supersedesId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ResultVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultAccessToken" (
    "id" TEXT NOT NULL,
    "resultVersionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,

    CONSTRAINT "ResultAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "resultVersionId" TEXT NOT NULL,
    "stayDate" TIMESTAMP(3) NOT NULL,
    "risk" "RiskLevel" NOT NULL,
    "reasonCodes" JSONB NOT NULL,
    "marketSignalIds" JSONB NOT NULL,
    "targetPriceMinor" INTEGER,
    "competitorMedianMinor" INTEGER,
    "competitorLowMinor" INTEGER,
    "competitorHighMinor" INTEGER,
    "recommendedAction" TEXT NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "limitations" JSONB NOT NULL,
    "explanation" JSONB NOT NULL,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionCase" (
    "id" TEXT NOT NULL,
    "priceCheckId" TEXT NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "priority" "ExceptionPriority" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "recommendation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "allowedActions" JSONB NOT NULL,
    "blockingUser" BOOLEAN NOT NULL DEFAULT false,
    "resolutionAction" TEXT,
    "resolutionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExceptionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "priceCheckId" TEXT NOT NULL,
    "resultVersionId" TEXT,
    "insightId" TEXT,
    "type" "FeedbackType" NOT NULL,
    "comment" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionRecord" (
    "id" TEXT NOT NULL,
    "priceCheckId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorAdminId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "previousHash" TEXT,
    "eventHash" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityMerge" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityMerge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "encryptedEmail" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "market" TEXT,
    "input" TEXT,
    "marketingConsent" BOOLEAN NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "encryptedEmail" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "checkId" TEXT,
    "locale" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "priceCheckId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
    "priceCheckId" TEXT,
    "resultVersionId" TEXT,
    "type" "EmailType" NOT NULL,
    "locale" TEXT NOT NULL,
    "recipientHash" TEXT NOT NULL,
    "encryptedRecipient" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualImport" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "format" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "rightsMetadata" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "validRowCount" INTEGER NOT NULL DEFAULT 0,
    "errorRowCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "ManualImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_adminUserId_expiresAt_idx" ON "AdminSession"("adminUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "Property_countryCode_city_idx" ON "Property"("countryCode", "city");

-- CreateIndex
CREATE INDEX "Property_canonicalName_idx" ON "Property"("canonicalName");

-- CreateIndex
CREATE INDEX "SellableUnit_propertyId_status_idx" ON "SellableUnit"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Listing_unitId_onlineStatus_idx" ON "Listing"("unitId", "onlineStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_dataSourceId_externalId_key" ON "Listing"("dataSourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_key_key" ON "DataSource"("key");

-- CreateIndex
CREATE INDEX "DataSource_status_enabled_idx" ON "DataSource"("status", "enabled");

-- CreateIndex
CREATE INDEX "CollectionRun_dataSourceId_createdAt_idx" ON "CollectionRun"("dataSourceId", "createdAt");

-- CreateIndex
CREATE INDEX "CollectionRun_priceCheckId_idx" ON "CollectionRun"("priceCheckId");

-- CreateIndex
CREATE UNIQUE INDEX "RateObservation_idempotencyKey_key" ON "RateObservation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RateObservation_listingId_collectedAt_idx" ON "RateObservation"("listingId", "collectedAt");

-- CreateIndex
CREATE INDEX "RateObservation_stayQueryId_collectedAt_idx" ON "RateObservation"("stayQueryId", "collectedAt");

-- CreateIndex
CREATE INDEX "CompetitorRelationship_targetUnitId_validTo_role_idx" ON "CompetitorRelationship"("targetUnitId", "validTo", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorRelationship_targetUnitId_competitorUnitId_versio_key" ON "CompetitorRelationship"("targetUnitId", "competitorUnitId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MarketCoverage_key_key" ON "MarketCoverage"("key");

-- CreateIndex
CREATE INDEX "MarketSignal_marketKey_startsAt_endsAt_idx" ON "MarketSignal"("marketKey", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceCheck_accessKeyHash_key" ON "PriceCheck"("accessKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "PriceCheck_idempotencyKey_key" ON "PriceCheck"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PriceCheck_status_createdAt_idx" ON "PriceCheck"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PriceCheck_propertyId_unitId_idx" ON "PriceCheck"("propertyId", "unitId");

-- CreateIndex
CREATE INDEX "PriceCheck_emailHash_status_idx" ON "PriceCheck"("emailHash", "status");

-- CreateIndex
CREATE INDEX "ResultVersion_priceCheckId_status_idx" ON "ResultVersion"("priceCheckId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ResultVersion_priceCheckId_version_key" ON "ResultVersion"("priceCheckId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ResultAccessToken_tokenHash_key" ON "ResultAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ResultAccessToken_resultVersionId_expiresAt_idx" ON "ResultAccessToken"("resultVersionId", "expiresAt");

-- CreateIndex
CREATE INDEX "Insight_resultVersionId_stayDate_idx" ON "Insight"("resultVersionId", "stayDate");

-- CreateIndex
CREATE INDEX "ExceptionCase_status_priority_createdAt_idx" ON "ExceptionCase"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "ExceptionCase_priceCheckId_idx" ON "ExceptionCase"("priceCheckId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_idempotencyKey_key" ON "Feedback"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ActionRecord_priceCheckId_createdAt_idx" ON "ActionRecord"("priceCheckId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_eventHash_key" ON "AuditEvent"("eventHash");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "IdentityMerge_entityType_fromId_idx" ON "IdentityMerge"("entityType", "fromId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_idempotencyKey_key" ON "WaitlistEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WaitlistEntry_emailHash_createdAt_idx" ON "WaitlistEntry"("emailHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContactRequest_referenceId_key" ON "ContactRequest"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_priority_idx" ON "Job"("status", "runAt", "priority");

-- CreateIndex
CREATE INDEX "Job_leaseExpiresAt_idx" ON "Job"("leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDelivery_idempotencyKey_key" ON "EmailDelivery"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EmailDelivery_status_queuedAt_idx" ON "EmailDelivery"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "ManualImport_dataSourceId_createdAt_idx" ON "ManualImport"("dataSourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellableUnit" ADD CONSTRAINT "SellableUnit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellableUnit" ADD CONSTRAINT "SellableUnit_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "SellableUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SellableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_priceCheckId_fkey" FOREIGN KEY ("priceCheckId") REFERENCES "PriceCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_stayQueryId_fkey" FOREIGN KEY ("stayQueryId") REFERENCES "StayQuery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateObservation" ADD CONSTRAINT "RateObservation_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorRelationship" ADD CONSTRAINT "CompetitorRelationship_targetUnitId_fkey" FOREIGN KEY ("targetUnitId") REFERENCES "SellableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorRelationship" ADD CONSTRAINT "CompetitorRelationship_competitorUnitId_fkey" FOREIGN KEY ("competitorUnitId") REFERENCES "SellableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSignal" ADD CONSTRAINT "MarketSignal_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceCheck" ADD CONSTRAINT "PriceCheck_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceCheck" ADD CONSTRAINT "PriceCheck_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SellableUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceCheck" ADD CONSTRAINT "PriceCheck_stayQueryId_fkey" FOREIGN KEY ("stayQueryId") REFERENCES "StayQuery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultVersion" ADD CONSTRAINT "ResultVersion_priceCheckId_fkey" FOREIGN KEY ("priceCheckId") REFERENCES "PriceCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultVersion" ADD CONSTRAINT "ResultVersion_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "ResultVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultAccessToken" ADD CONSTRAINT "ResultAccessToken_resultVersionId_fkey" FOREIGN KEY ("resultVersionId") REFERENCES "ResultVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_resultVersionId_fkey" FOREIGN KEY ("resultVersionId") REFERENCES "ResultVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_priceCheckId_fkey" FOREIGN KEY ("priceCheckId") REFERENCES "PriceCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_priceCheckId_fkey" FOREIGN KEY ("priceCheckId") REFERENCES "PriceCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_resultVersionId_fkey" FOREIGN KEY ("resultVersionId") REFERENCES "ResultVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "Insight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionRecord" ADD CONSTRAINT "ActionRecord_priceCheckId_fkey" FOREIGN KEY ("priceCheckId") REFERENCES "PriceCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityMerge" ADD CONSTRAINT "IdentityMerge_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_priceCheckId_fkey" FOREIGN KEY ("priceCheckId") REFERENCES "PriceCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_priceCheckId_fkey" FOREIGN KEY ("priceCheckId") REFERENCES "PriceCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_resultVersionId_fkey" FOREIGN KEY ("resultVersionId") REFERENCES "ResultVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualImport" ADD CONSTRAINT "ManualImport_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only and immutable-history guards required by Tymra Release 1.
CREATE OR REPLACE FUNCTION tymra_reject_all_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tymra_protect_result_version()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ResultVersion history cannot be deleted';
  END IF;

  IF OLD.status <> 'DRAFT'::"ResultVersionStatus" THEN
    RAISE EXCEPTION 'Published ResultVersion records are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tymra_protect_collection_run()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CollectionRun history cannot be deleted';
  END IF;

  IF OLD.status IN (
    'SUCCEEDED'::"CollectionStatus",
    'PARTIAL'::"CollectionStatus",
    'FAILED'::"CollectionStatus",
    'CANCELLED'::"CollectionStatus"
  ) THEN
    RAISE EXCEPTION 'Completed CollectionRun records are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RateObservation_append_only"
BEFORE UPDATE OR DELETE ON "RateObservation"
FOR EACH ROW EXECUTE FUNCTION tymra_reject_all_mutation();

CREATE TRIGGER "CompetitorRelationship_append_only"
BEFORE UPDATE OR DELETE ON "CompetitorRelationship"
FOR EACH ROW EXECUTE FUNCTION tymra_reject_all_mutation();

CREATE TRIGGER "Feedback_append_only"
BEFORE UPDATE OR DELETE ON "Feedback"
FOR EACH ROW EXECUTE FUNCTION tymra_reject_all_mutation();

CREATE TRIGGER "AuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION tymra_reject_all_mutation();

CREATE TRIGGER "ActionRecord_append_only"
BEFORE UPDATE OR DELETE ON "ActionRecord"
FOR EACH ROW EXECUTE FUNCTION tymra_reject_all_mutation();

CREATE TRIGGER "IdentityMerge_append_only"
BEFORE UPDATE OR DELETE ON "IdentityMerge"
FOR EACH ROW EXECUTE FUNCTION tymra_reject_all_mutation();

CREATE TRIGGER "ResultVersion_immutable_after_draft"
BEFORE UPDATE OR DELETE ON "ResultVersion"
FOR EACH ROW EXECUTE FUNCTION tymra_protect_result_version();

CREATE TRIGGER "CollectionRun_immutable_after_completion"
BEFORE UPDATE OR DELETE ON "CollectionRun"
FOR EACH ROW EXECUTE FUNCTION tymra_protect_collection_run();
