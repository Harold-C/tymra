CREATE TYPE "BenefitGroupStatus" AS ENUM ('ACTIVE', 'REVIEW', 'LIMITED');
CREATE TYPE "RiskSubjectType" AS ENUM ('ACCOUNT', 'DEVICE', 'IP_PREFIX', 'EMAIL', 'PAYMENT_INSTRUMENT', 'PROPERTY', 'OTA_LISTING', 'QUERY_SIGNATURE', 'GEO_TILE');
CREATE TYPE "BenefitClaimType" AS ENUM ('FREE_INITIAL_REPORT', 'FREE_SPOT_CHECK', 'PROMOTION');
CREATE TYPE "RiskCaseStatus" AS ENUM ('OPEN', 'APPROVED', 'DENIED', 'RESOLVED');
ALTER TYPE "MagicLinkPurpose" ADD VALUE IF NOT EXISTS 'VERIFY_CUSTOMER_EMAIL';

CREATE TABLE "BenefitGroup" (
  "id" TEXT NOT NULL,
  "status" "BenefitGroupStatus" NOT NULL DEFAULT 'ACTIVE',
  "riskScore" INTEGER NOT NULL DEFAULT 0,
  "policyVersion" TEXT NOT NULL DEFAULT 'member-abuse-v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenefitGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomerUser" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "CustomerUser" ADD COLUMN "benefitGroupId" TEXT;
ALTER TABLE "CustomerSession" ADD COLUMN "deviceHash" TEXT;
ALTER TABLE "CustomerSession" ADD COLUMN "ipPrefixHash" TEXT;
ALTER TABLE "MembershipUsage" ADD COLUMN "benefitGroupId" TEXT;
ALTER TABLE "UsageLedger" ADD COLUMN "benefitGroupId" TEXT;
ALTER TABLE "UsageLedger" ADD COLUMN "priceCheckId" TEXT;
ALTER TABLE "UsageLedger" ADD COLUMN "operationKey" TEXT;
ALTER TABLE "AbuseDecision" ADD COLUMN "customerUserId" TEXT;
ALTER TABLE "AbuseDecision" ADD COLUMN "benefitGroupId" TEXT;
ALTER TABLE "AbuseDecision" ADD COLUMN "policyVersion" TEXT NOT NULL DEFAULT 'member-abuse-v1';

INSERT INTO "BenefitGroup" ("id", "createdAt", "updatedAt")
SELECT 'bg_' || md5("id"), "createdAt", CURRENT_TIMESTAMP FROM "CustomerUser";

UPDATE "CustomerUser" SET "benefitGroupId" = 'bg_' || md5("id");
UPDATE "CustomerUser" AS customer
SET "emailVerifiedAt" = verified."consumedAt"
FROM (
  SELECT "customerUserId", MIN("consumedAt") AS "consumedAt"
  FROM "MagicLink"
  WHERE "status" = 'CONSUMED' AND "consumedAt" IS NOT NULL AND "customerUserId" IS NOT NULL
  GROUP BY "customerUserId"
) AS verified
WHERE customer."id" = verified."customerUserId";
UPDATE "MembershipUsage" AS usage
SET "benefitGroupId" = customer."benefitGroupId"
FROM "CustomerUser" AS customer
WHERE usage."customerUserId" = customer."id";

CREATE TABLE "RiskIdentity" (
  "id" TEXT NOT NULL,
  "benefitGroupId" TEXT NOT NULL,
  "customerUserId" TEXT,
  "subjectType" "RiskSubjectType" NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "hashVersion" INTEGER NOT NULL DEFAULT 1,
  "confidence" INTEGER NOT NULL DEFAULT 50,
  "reasonCodes" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiskIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BenefitClaim" (
  "id" TEXT NOT NULL,
  "benefitGroupId" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "type" "BenefitClaimType" NOT NULL,
  "windowKey" TEXT NOT NULL,
  "propertyId" TEXT,
  "promotionInstrumentHash" TEXT,
  "membershipUsageId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "BenefitClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentInstrumentIdentity" (
  "id" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "benefitGroupId" TEXT,
  "fingerprintHash" TEXT NOT NULL,
  "stripeCustomerId" TEXT,
  "paymentMethodType" TEXT,
  "countryCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentInstrumentIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MembershipRiskCase" (
  "id" TEXT NOT NULL,
  "customerUserId" TEXT,
  "benefitGroupId" TEXT,
  "status" "RiskCaseStatus" NOT NULL DEFAULT 'OPEN',
  "outcome" "AbuseOutcome" NOT NULL,
  "action" TEXT NOT NULL,
  "reasonCodes" JSONB NOT NULL DEFAULT '[]',
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "appealReason" TEXT,
  "adminNote" TEXT,
  "cooldownUntil" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolvedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipRiskCase_pkey" PRIMARY KEY ("id")
);

INSERT INTO "RiskIdentity" ("id", "benefitGroupId", "customerUserId", "subjectType", "subjectHash", "confidence", "reasonCodes", "firstSeenAt", "lastSeenAt")
SELECT 'ri_account_' || md5("id"), "benefitGroupId", "id", 'ACCOUNT', "id", 100, '["ACCOUNT_OWNER"]', "createdAt", CURRENT_TIMESTAMP
FROM "CustomerUser" WHERE "benefitGroupId" IS NOT NULL;
INSERT INTO "RiskIdentity" ("id", "benefitGroupId", "customerUserId", "subjectType", "subjectHash", "confidence", "reasonCodes", "firstSeenAt", "lastSeenAt")
SELECT 'ri_email_' || md5("id"), "benefitGroupId", "id", 'EMAIL', "emailHash", 100, '["VERIFIED_EMAIL_IDENTITY"]', "createdAt", CURRENT_TIMESTAMP
FROM "CustomerUser" WHERE "benefitGroupId" IS NOT NULL;

CREATE UNIQUE INDEX "RiskIdentity_benefitGroupId_subjectType_subjectHash_hashVersion_key" ON "RiskIdentity"("benefitGroupId", "subjectType", "subjectHash", "hashVersion");
CREATE INDEX "RiskIdentity_subjectType_subjectHash_lastSeenAt_idx" ON "RiskIdentity"("subjectType", "subjectHash", "lastSeenAt");
CREATE INDEX "RiskIdentity_customerUserId_subjectType_lastSeenAt_idx" ON "RiskIdentity"("customerUserId", "subjectType", "lastSeenAt");
CREATE UNIQUE INDEX "BenefitClaim_membershipUsageId_key" ON "BenefitClaim"("membershipUsageId");
CREATE UNIQUE INDEX "BenefitClaim_benefitGroupId_type_windowKey_key" ON "BenefitClaim"("benefitGroupId", "type", "windowKey");
CREATE UNIQUE INDEX "BenefitClaim_type_windowKey_promotionInstrumentHash_key" ON "BenefitClaim"("type", "windowKey", "promotionInstrumentHash");
CREATE INDEX "BenefitClaim_customerUserId_type_claimedAt_idx" ON "BenefitClaim"("customerUserId", "type", "claimedAt");
CREATE INDEX "BenefitClaim_propertyId_type_claimedAt_idx" ON "BenefitClaim"("propertyId", "type", "claimedAt");
CREATE INDEX "BenefitClaim_expiresAt_idx" ON "BenefitClaim"("expiresAt");
CREATE UNIQUE INDEX "PaymentInstrumentIdentity_customerUserId_fingerprintHash_key" ON "PaymentInstrumentIdentity"("customerUserId", "fingerprintHash");
CREATE INDEX "PaymentInstrumentIdentity_fingerprintHash_lastSeenAt_idx" ON "PaymentInstrumentIdentity"("fingerprintHash", "lastSeenAt");
CREATE INDEX "PaymentInstrumentIdentity_benefitGroupId_lastSeenAt_idx" ON "PaymentInstrumentIdentity"("benefitGroupId", "lastSeenAt");
CREATE INDEX "PaymentInstrumentIdentity_stripeCustomerId_idx" ON "PaymentInstrumentIdentity"("stripeCustomerId");
CREATE INDEX "MembershipRiskCase_status_createdAt_idx" ON "MembershipRiskCase"("status", "createdAt");
CREATE INDEX "MembershipRiskCase_customerUserId_status_createdAt_idx" ON "MembershipRiskCase"("customerUserId", "status", "createdAt");
CREATE INDEX "MembershipRiskCase_benefitGroupId_status_createdAt_idx" ON "MembershipRiskCase"("benefitGroupId", "status", "createdAt");
CREATE INDEX "MembershipRiskCase_resolvedByAdminId_idx" ON "MembershipRiskCase"("resolvedByAdminId");
CREATE INDEX "BenefitGroup_status_updatedAt_idx" ON "BenefitGroup"("status", "updatedAt");
CREATE INDEX "CustomerUser_benefitGroupId_idx" ON "CustomerUser"("benefitGroupId");
CREATE INDEX "CustomerUser_emailVerifiedAt_idx" ON "CustomerUser"("emailVerifiedAt");
CREATE INDEX "CustomerSession_deviceHash_createdAt_idx" ON "CustomerSession"("deviceHash", "createdAt");
CREATE INDEX "CustomerSession_ipPrefixHash_createdAt_idx" ON "CustomerSession"("ipPrefixHash", "createdAt");
CREATE INDEX "MembershipUsage_benefitGroupId_type_countedAt_idx" ON "MembershipUsage"("benefitGroupId", "type", "countedAt");
CREATE INDEX "UsageLedger_benefitGroupId_action_createdAt_idx" ON "UsageLedger"("benefitGroupId", "action", "createdAt");
CREATE INDEX "UsageLedger_priceCheckId_action_createdAt_idx" ON "UsageLedger"("priceCheckId", "action", "createdAt");
CREATE UNIQUE INDEX "UsageLedger_operationKey_key" ON "UsageLedger"("operationKey");
CREATE INDEX "AbuseDecision_customerUserId_action_createdAt_idx" ON "AbuseDecision"("customerUserId", "action", "createdAt");
CREATE INDEX "AbuseDecision_benefitGroupId_action_createdAt_idx" ON "AbuseDecision"("benefitGroupId", "action", "createdAt");

ALTER TABLE "CustomerUser" ADD CONSTRAINT "CustomerUser_benefitGroupId_fkey" FOREIGN KEY ("benefitGroupId") REFERENCES "BenefitGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MembershipUsage" ADD CONSTRAINT "MembershipUsage_benefitGroupId_fkey" FOREIGN KEY ("benefitGroupId") REFERENCES "BenefitGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RiskIdentity" ADD CONSTRAINT "RiskIdentity_benefitGroupId_fkey" FOREIGN KEY ("benefitGroupId") REFERENCES "BenefitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskIdentity" ADD CONSTRAINT "RiskIdentity_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenefitClaim" ADD CONSTRAINT "BenefitClaim_benefitGroupId_fkey" FOREIGN KEY ("benefitGroupId") REFERENCES "BenefitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenefitClaim" ADD CONSTRAINT "BenefitClaim_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenefitClaim" ADD CONSTRAINT "BenefitClaim_membershipUsageId_fkey" FOREIGN KEY ("membershipUsageId") REFERENCES "MembershipUsage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentInstrumentIdentity" ADD CONSTRAINT "PaymentInstrumentIdentity_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentInstrumentIdentity" ADD CONSTRAINT "PaymentInstrumentIdentity_benefitGroupId_fkey" FOREIGN KEY ("benefitGroupId") REFERENCES "BenefitGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MembershipRiskCase" ADD CONSTRAINT "MembershipRiskCase_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MembershipRiskCase" ADD CONSTRAINT "MembershipRiskCase_benefitGroupId_fkey" FOREIGN KEY ("benefitGroupId") REFERENCES "BenefitGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MembershipRiskCase" ADD CONSTRAINT "MembershipRiskCase_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
