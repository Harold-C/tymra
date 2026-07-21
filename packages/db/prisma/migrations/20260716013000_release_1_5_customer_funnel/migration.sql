ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'RESULT_NOTIFICATION';
ALTER TYPE "EmailType" ADD VALUE IF NOT EXISTS 'VERIFY_AND_SIGN_IN';

CREATE TYPE "AnonymousCheckStatus" AS ENUM ('CREATED', 'VALIDATING_LISTING', 'CAPTURING_CONTEXT', 'ROUGH_ANALYSING', 'ROUGH_READY', 'INVALID_INPUT', 'UNSUPPORTED', 'NO_DEFAULT_QUOTE', 'INSUFFICIENT', 'FAILED', 'EXPIRED');
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED', 'REVOKED', 'BLOCKED');
CREATE TYPE "AbuseOutcome" AS ENUM ('ALLOW', 'CHALLENGE', 'COOLDOWN', 'REJECT');

CREATE TABLE "CustomerUser" (
  "id" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "encryptedEmail" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerSession" (
  "id" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnonymousCheck" (
  "id" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "AnonymousCheckStatus" NOT NULL DEFAULT 'CREATED',
  "pricingContext" JSONB NOT NULL,
  "failureReason" TEXT,
  "propertyId" TEXT,
  "unitId" TEXT,
  "customerUserId" TEXT,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnonymousCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoughResult" (
  "id" TEXT NOT NULL,
  "anonymousCheckId" TEXT NOT NULL,
  "propertyName" TEXT NOT NULL,
  "locality" TEXT NOT NULL,
  "unitName" TEXT NOT NULL,
  "pricePosition" TEXT NOT NULL,
  "estimatedGapLowPct" INTEGER,
  "estimatedGapHighPct" INTEGER,
  "observedPriceMinor" INTEGER,
  "marketLowMinor" INTEGER,
  "marketHighMinor" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'NZD',
  "confidence" "ConfidenceLevel" NOT NULL,
  "sourceLabel" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "limitations" JSONB NOT NULL,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoughResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MagicLink" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'VERIFY_AND_SIGN_IN',
  "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  "emailHash" TEXT NOT NULL,
  "encryptedEmail" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "anonymousCheckId" TEXT NOT NULL,
  "customerUserId" TEXT,
  "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MagicLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageLedger" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "anonymousCheckId" TEXT,
  "customerUserId" TEXT,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AbuseDecision" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "outcome" "AbuseOutcome" NOT NULL,
  "reasonCodes" JSONB NOT NULL,
  "anonymousCheckId" TEXT,
  "cooldownUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AbuseDecision_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PriceCheck"
  ADD COLUMN "customerUserId" TEXT,
  ADD COLUMN "anonymousCheckId" TEXT,
  ADD COLUMN "inPageDeliveredAt" TIMESTAMP(3),
  ADD COLUMN "notificationGraceEndsAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "CustomerUser_emailHash_key" ON "CustomerUser"("emailHash");
CREATE INDEX "CustomerUser_status_createdAt_idx" ON "CustomerUser"("status", "createdAt");
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");
CREATE INDEX "CustomerSession_customerUserId_expiresAt_idx" ON "CustomerSession"("customerUserId", "expiresAt");
CREATE INDEX "CustomerSession_expiresAt_revokedAt_idx" ON "CustomerSession"("expiresAt", "revokedAt");
CREATE INDEX "AnonymousCheck_cacheKey_status_createdAt_idx" ON "AnonymousCheck"("cacheKey", "status", "createdAt");
CREATE UNIQUE INDEX "AnonymousCheck_idempotencyKey_key" ON "AnonymousCheck"("idempotencyKey");
CREATE INDEX "AnonymousCheck_customerUserId_createdAt_idx" ON "AnonymousCheck"("customerUserId", "createdAt");
CREATE INDEX "AnonymousCheck_expiresAt_idx" ON "AnonymousCheck"("expiresAt");
CREATE UNIQUE INDEX "RoughResult_anonymousCheckId_key" ON "RoughResult"("anonymousCheckId");
CREATE UNIQUE INDEX "MagicLink_tokenHash_key" ON "MagicLink"("tokenHash");
CREATE UNIQUE INDEX "MagicLink_idempotencyKey_key" ON "MagicLink"("idempotencyKey");
CREATE INDEX "MagicLink_emailHash_createdAt_idx" ON "MagicLink"("emailHash", "createdAt");
CREATE INDEX "MagicLink_anonymousCheckId_status_idx" ON "MagicLink"("anonymousCheckId", "status");
CREATE INDEX "MagicLink_expiresAt_status_idx" ON "MagicLink"("expiresAt", "status");
CREATE INDEX "UsageLedger_action_subjectType_subjectHash_createdAt_idx" ON "UsageLedger"("action", "subjectType", "subjectHash", "createdAt");
CREATE INDEX "UsageLedger_customerUserId_action_createdAt_idx" ON "UsageLedger"("customerUserId", "action", "createdAt");
CREATE INDEX "AbuseDecision_action_subjectHash_createdAt_idx" ON "AbuseDecision"("action", "subjectHash", "createdAt");
CREATE INDEX "AbuseDecision_cooldownUntil_idx" ON "AbuseDecision"("cooldownUntil");
CREATE INDEX "PriceCheck_customerUserId_createdAt_idx" ON "PriceCheck"("customerUserId", "createdAt");
CREATE UNIQUE INDEX "PriceCheck_anonymousCheckId_key" ON "PriceCheck"("anonymousCheckId");

ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnonymousCheck" ADD CONSTRAINT "AnonymousCheck_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnonymousCheck" ADD CONSTRAINT "AnonymousCheck_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SellableUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnonymousCheck" ADD CONSTRAINT "AnonymousCheck_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoughResult" ADD CONSTRAINT "RoughResult_anonymousCheckId_fkey" FOREIGN KEY ("anonymousCheckId") REFERENCES "AnonymousCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MagicLink" ADD CONSTRAINT "MagicLink_anonymousCheckId_fkey" FOREIGN KEY ("anonymousCheckId") REFERENCES "AnonymousCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MagicLink" ADD CONSTRAINT "MagicLink_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceCheck" ADD CONSTRAINT "PriceCheck_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceCheck" ADD CONSTRAINT "PriceCheck_anonymousCheckId_fkey" FOREIGN KEY ("anonymousCheckId") REFERENCES "AnonymousCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
