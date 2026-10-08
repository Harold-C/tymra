CREATE TABLE "MembershipUsageCorrection" (
 "id" TEXT NOT NULL PRIMARY KEY, "usageId" TEXT NOT NULL UNIQUE REFERENCES "MembershipUsage"("id"),
 "originalUsageId" TEXT NOT NULL REFERENCES "MembershipUsage"("id"), "actorAdminId" TEXT NOT NULL,
 "reason" TEXT NOT NULL, "evidenceReference" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ServiceWaiver" (
 "id" TEXT NOT NULL PRIMARY KEY, "scheduleId" TEXT NOT NULL REFERENCES "ScheduleDefinition"("id"),
 "actorAdminId" TEXT NOT NULL, "reason" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "originalNextRunAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ServiceWaiver_expiresAt_revokedAt_idx" ON "ServiceWaiver"("expiresAt", "revokedAt");
CREATE TRIGGER "MembershipUsageCorrection_append_only" BEFORE UPDATE OR DELETE ON "MembershipUsageCorrection"
 FOR EACH ROW EXECUTE FUNCTION tymra_reject_all_mutation();
