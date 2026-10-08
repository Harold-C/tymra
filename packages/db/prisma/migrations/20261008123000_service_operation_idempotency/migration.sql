CREATE TABLE "ServiceOperation" (
  "id" TEXT NOT NULL PRIMARY KEY, "actorAdminId" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
  "action" TEXT NOT NULL, "sourceKey" TEXT, "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ServiceOperation_sourceKey_createdAt_idx" ON "ServiceOperation"("sourceKey", "createdAt");
