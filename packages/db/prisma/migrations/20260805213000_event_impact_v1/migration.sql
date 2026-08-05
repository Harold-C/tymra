ALTER TABLE "SourceEventOccurrence"
  ADD COLUMN "timePrecision" TEXT NOT NULL DEFAULT 'DATETIME',
  ADD COLUMN "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "evidenceRef" TEXT;

UPDATE "SourceEventOccurrence" SET "evidenceRef" = "sourceUrl" WHERE "evidenceRef" IS NULL;
ALTER TABLE "SourceEventOccurrence" ALTER COLUMN "evidenceRef" SET NOT NULL;

ALTER TABLE "EventOccurrence"
  ADD COLUMN "timePrecision" TEXT NOT NULL DEFAULT 'DATETIME';

ALTER TABLE "CanonicalVenue"
  ADD COLUMN "capacity" INTEGER,
  ADD COLUMN "capacitySourceUrl" TEXT,
  ADD COLUMN "capacityObservedAt" TIMESTAMP(3);
