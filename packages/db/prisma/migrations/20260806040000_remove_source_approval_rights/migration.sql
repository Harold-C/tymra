ALTER TABLE "DataSource"
  DROP COLUMN "allowedUsage",
  DROP COLUMN "displayPermission",
  DROP COLUMN "derivedAnalysisPermission",
  DROP COLUMN "internalApprovalStatus",
  DROP COLUMN "legalRightsStatus",
  DROP COLUMN "approvedBy",
  DROP COLUMN "approvedAt",
  DROP COLUMN "licenseBasis",
  DROP COLUMN "rightsAllowStorage",
  DROP COLUMN "rightsAllowDerivedAnalysis",
  DROP COLUMN "rightsAllowDisplay";

ALTER TABLE "Listing" DROP COLUMN "legalRightsStatus";
ALTER TABLE "RateObservation" DROP COLUMN "legalRightsStatus";
ALTER TABLE "ManualImport" DROP COLUMN "rightsMetadata";

UPDATE "DataSource" SET "status" = 'PILOT' WHERE "status" = 'APPROVED';
ALTER TYPE "DataSourceStatus" RENAME TO "DataSourceStatus_old";
CREATE TYPE "DataSourceStatus" AS ENUM ('PILOT', 'SUSPENDED', 'DISABLED', 'DEPRECATED', 'UNKNOWN');
ALTER TABLE "DataSource"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "DataSourceStatus" USING ("status"::text::"DataSourceStatus");
ALTER TABLE "DataSource" ALTER COLUMN "status" SET DEFAULT 'UNKNOWN';
DROP TYPE "DataSourceStatus_old";

DROP TYPE "InternalApprovalStatus";
DROP TYPE "LegalRightsStatus";
