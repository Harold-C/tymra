ALTER TABLE "MembershipSubscription" ADD COLUMN "lastStripeEventAt" TIMESTAMP(3);
ALTER TABLE "StripeBillingEvent" ADD COLUMN "eventCreatedAt" TIMESTAMP(3);
UPDATE "StripeBillingEvent" SET "eventCreatedAt" = "createdAt" WHERE "eventCreatedAt" IS NULL;
ALTER TABLE "StripeBillingEvent" ALTER COLUMN "eventCreatedAt" SET NOT NULL;
CREATE INDEX "MembershipSubscription_lastStripeEventAt_idx" ON "MembershipSubscription"("lastStripeEventAt");
