ALTER TYPE "JobType" ADD VALUE 'MEMBERSHIP_SCHEDULE';

CREATE TYPE "MembershipPlan" AS ENUM ('FREE', 'HOST', 'PRO', 'PORTFOLIO');
CREATE TYPE "MembershipSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'INCOMPLETE', 'PAUSED');
CREATE TYPE "MembershipUsageType" AS ENUM ('INITIAL_REPORT', 'SPOT_CHECK', 'SCHEDULED_ANALYSIS');
CREATE TYPE "PriceResultStatus" AS ENUM ('COMPLETED', 'NOT_AVAILABLE', 'BLOCKED');
CREATE TYPE "RecommendationStatus" AS ENUM ('COMPLETED', 'LIMITED_EVIDENCE', 'NOT_AVAILABLE');

ALTER TABLE "RateObservation"
    ADD COLUMN "displayedAmountMinor" INTEGER,
    ADD COLUMN "priceBasis" TEXT NOT NULL DEFAULT 'STAY_TOTAL',
    ADD COLUMN "sourcePriceStatus" TEXT;

ALTER TABLE "ResultVersion"
    ADD COLUMN "priceResultStatus" "PriceResultStatus" NOT NULL DEFAULT 'NOT_AVAILABLE',
    ADD COLUMN "recommendationStatus" "RecommendationStatus" NOT NULL DEFAULT 'NOT_AVAILABLE',
    ADD COLUMN "observedSourceCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "priceEvidenceStatus" TEXT,
    ADD COLUMN "recommendationReasonCode" TEXT;

CREATE TABLE "MembershipSubscription" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "plan" "MembershipPlan" NOT NULL DEFAULT 'FREE',
    "status" "MembershipSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "graceEndsAt" TIMESTAMP(3),
    "pendingPlan" "MembershipPlan",
    "entitlementStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MembershipSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerPricingUnit" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "sellableUnitId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerPricingUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MembershipUsage" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "type" "MembershipUsageType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "pricingUnitId" TEXT,
    "priceCheckId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MembershipUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeBillingEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "processingError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeBillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MembershipSubscription_customerUserId_key" ON "MembershipSubscription"("customerUserId");
CREATE UNIQUE INDEX "MembershipSubscription_stripeCustomerId_key" ON "MembershipSubscription"("stripeCustomerId");
CREATE UNIQUE INDEX "MembershipSubscription_stripeSubscriptionId_key" ON "MembershipSubscription"("stripeSubscriptionId");
CREATE INDEX "MembershipSubscription_plan_status_idx" ON "MembershipSubscription"("plan", "status");
CREATE INDEX "MembershipSubscription_status_graceEndsAt_idx" ON "MembershipSubscription"("status", "graceEndsAt");
CREATE INDEX "MembershipSubscription_currentPeriodEnd_idx" ON "MembershipSubscription"("currentPeriodEnd");
CREATE UNIQUE INDEX "CustomerPricingUnit_customerUserId_sellableUnitId_key" ON "CustomerPricingUnit"("customerUserId", "sellableUnitId");
CREATE INDEX "CustomerPricingUnit_customerUserId_active_idx" ON "CustomerPricingUnit"("customerUserId", "active");
CREATE INDEX "CustomerPricingUnit_sellableUnitId_active_idx" ON "CustomerPricingUnit"("sellableUnitId", "active");
CREATE UNIQUE INDEX "MembershipUsage_idempotencyKey_key" ON "MembershipUsage"("idempotencyKey");
CREATE INDEX "MembershipUsage_customerUserId_type_countedAt_idx" ON "MembershipUsage"("customerUserId", "type", "countedAt");
CREATE INDEX "MembershipUsage_pricingUnitId_countedAt_idx" ON "MembershipUsage"("pricingUnitId", "countedAt");
CREATE UNIQUE INDEX "StripeBillingEvent_stripeEventId_key" ON "StripeBillingEvent"("stripeEventId");
CREATE INDEX "StripeBillingEvent_eventType_createdAt_idx" ON "StripeBillingEvent"("eventType", "createdAt");
CREATE INDEX "StripeBillingEvent_processedAt_idx" ON "StripeBillingEvent"("processedAt");

ALTER TABLE "MembershipSubscription" ADD CONSTRAINT "MembershipSubscription_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPricingUnit" ADD CONSTRAINT "CustomerPricingUnit_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPricingUnit" ADD CONSTRAINT "CustomerPricingUnit_sellableUnitId_fkey" FOREIGN KEY ("sellableUnitId") REFERENCES "SellableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MembershipUsage" ADD CONSTRAINT "MembershipUsage_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
