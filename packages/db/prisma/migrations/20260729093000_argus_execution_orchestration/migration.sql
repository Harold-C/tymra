ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'ARGUS_JOB_POLL';

CREATE TYPE "ArgusExecutionStatus" AS ENUM (
  'SUBMITTED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCEL_REQUESTED',
  'CANCELLED'
);

CREATE TABLE "ArgusExecution" (
  "id" TEXT NOT NULL,
  "orchestrationKey" TEXT NOT NULL,
  "parentJobId" TEXT NOT NULL,
  "collectionRunId" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "argusJobId" TEXT NOT NULL,
  "traceId" TEXT NOT NULL,
  "connectorId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "requestedUrl" TEXT NOT NULL,
  "status" "ArgusExecutionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "result" JSONB,
  "errorCategory" TEXT,
  "errorMessage" TEXT,
  "retryable" BOOLEAN,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastPolledAt" TIMESTAMP(3),
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArgusExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArgusExecution_orchestrationKey_key" ON "ArgusExecution"("orchestrationKey");
CREATE UNIQUE INDEX "ArgusExecution_argusJobId_key" ON "ArgusExecution"("argusJobId");
CREATE INDEX "ArgusExecution_parentJobId_status_idx" ON "ArgusExecution"("parentJobId", "status");
CREATE INDEX "ArgusExecution_collectionRunId_createdAt_idx" ON "ArgusExecution"("collectionRunId", "createdAt");
CREATE INDEX "ArgusExecution_status_deadlineAt_idx" ON "ArgusExecution"("status", "deadlineAt");
