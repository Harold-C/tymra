ALTER TABLE "MembershipSubscription"
  ADD COLUMN "billingVersion" TEXT NOT NULL DEFAULT 'launch-2026',
  ADD COLUMN "stripeCheckoutSessionId" TEXT,
  ADD COLUMN "purchasedCapacity" INTEGER,
  ADD COLUMN "pendingCapacity" INTEGER,
  ADD COLUMN "pendingChangeKind" TEXT,
  ADD COLUMN "pendingRetainedUnitIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "periodSpotCheckLimit" INTEGER,
  ADD COLUMN "paidActivatedAt" TIMESTAMP(3),
  ADD COLUMN "renewalFailedAt" TIMESTAMP(3),
  ADD COLUMN "historyGraceUntil" TIMESTAMP(3),
  ADD COLUMN "historyGraceCutoff" TIMESTAMP(3);

-- Existing paid contracts retain their price, capacity and property identity.
-- Adoption of the launch tariff is an explicit, quoted subscription change.
UPDATE "MembershipSubscription" SET
  "billingVersion" = 'legacy-2026',
  "purchasedCapacity" = CASE "plan" WHEN 'HOST' THEN 1 WHEN 'PRO' THEN 5 ELSE 20 END,
  "paidActivatedAt" = CASE WHEN "status" IN ('ACTIVE', 'PAST_DUE', 'PAUSED') THEN "entitlementStartedAt" END
WHERE "plan" <> 'FREE';

ALTER TABLE "MembershipSubscription" ADD CONSTRAINT "MembershipSubscription_capacity_check"
  CHECK (("purchasedCapacity" IS NULL OR "purchasedCapacity" BETWEEN 1 AND 200)
     AND ("pendingCapacity" IS NULL OR "pendingCapacity" BETWEEN 1 AND 200)
     AND ("periodSpotCheckLimit" IS NULL OR "periodSpotCheckLimit" >= 0));

ALTER TABLE "MembershipUsage" ADD COLUMN "releasedAt" TIMESTAMP(3), ADD COLUMN "releaseReason" TEXT;
