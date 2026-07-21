-- Keep event impact as a comparable numeric score while retaining the
-- source signals and evaluation context used to derive it.
ALTER TABLE "DateSnapshot"
  ADD COLUMN "eventEvidence" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "PriceAnalysis"
  ADD COLUMN "eventEvidence" JSONB NOT NULL DEFAULT '{}';
