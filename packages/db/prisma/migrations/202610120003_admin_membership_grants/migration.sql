CREATE TABLE "AdminMembershipGrant" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "plan" "MembershipPlan" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "revocationReason" TEXT,
    "actorAdminId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "historyGraceUntil" TIMESTAMP(3),
    "historyGraceCutoff" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminMembershipGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdminMembershipGrant_capacity_check" CHECK (
      "capacity" BETWEEN 1 AND 200 AND
      (("plan" = 'FREE' AND "capacity" = 1) OR
       ("plan" = 'HOST' AND ("capacity" = 1 OR "capacity" >= 5)) OR
       ("plan" = 'PRO' AND "capacity" >= 20) OR
       ("plan" = 'PORTFOLIO' AND "capacity" >= 50))
    ),
    CONSTRAINT "AdminMembershipGrant_version_check" CHECK ("version" > 0),
    CONSTRAINT "AdminMembershipGrant_reason_check" CHECK (length(btrim("reason")) BETWEEN 3 AND 1000),
    CONSTRAINT "AdminMembershipGrant_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "MembershipSubscription"("customerUserId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdminMembershipGrant_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AdminMembershipGrant_customerUserId_key" ON "AdminMembershipGrant"("customerUserId");
CREATE INDEX "AdminMembershipGrant_revokedAt_expiresAt_idx" ON "AdminMembershipGrant"("revokedAt", "expiresAt");
