CREATE TABLE "FunnelMetricDaily" (
  "id" TEXT NOT NULL,
  "bucketDate" DATE NOT NULL,
  "eventName" TEXT NOT NULL,
  "dimensionKey" TEXT NOT NULL,
  "dimensions" JSONB NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FunnelMetricDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FunnelMetricDaily_bucketDate_eventName_dimensionKey_key"
  ON "FunnelMetricDaily"("bucketDate", "eventName", "dimensionKey");
CREATE INDEX "FunnelMetricDaily_eventName_bucketDate_idx"
  ON "FunnelMetricDaily"("eventName", "bucketDate");
CREATE INDEX "FunnelMetricDaily_bucketDate_idx"
  ON "FunnelMetricDaily"("bucketDate");
