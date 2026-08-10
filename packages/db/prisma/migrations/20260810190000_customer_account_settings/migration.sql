CREATE TYPE "CustomerDataRequestType" AS ENUM ('EXPORT', 'DELETE');
CREATE TYPE "CustomerDataRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

CREATE TABLE "CustomerDataRequest" (
  "id" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "type" "CustomerDataRequestType" NOT NULL,
  "status" "CustomerDataRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerDataRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerDataRequest_customerUserId_requestedAt_idx" ON "CustomerDataRequest"("customerUserId", "requestedAt");
CREATE INDEX "CustomerDataRequest_status_requestedAt_idx" ON "CustomerDataRequest"("status", "requestedAt");
ALTER TABLE "CustomerDataRequest" ADD CONSTRAINT "CustomerDataRequest_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
