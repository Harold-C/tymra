ALTER TABLE "CustomerUser"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

DELETE FROM "MagicLink" WHERE "purpose" = 'SIGN_IN_ONLY';
ALTER TABLE "MagicLink" DROP COLUMN "returnTo";
ALTER TABLE "MagicLink" ALTER COLUMN "purpose" DROP DEFAULT;
ALTER TYPE "MagicLinkPurpose" RENAME TO "MagicLinkPurpose_old";
CREATE TYPE "MagicLinkPurpose" AS ENUM ('UNLOCK_FORMAL_CHECK');
ALTER TABLE "MagicLink" ALTER COLUMN "purpose" TYPE "MagicLinkPurpose" USING ("purpose"::text::"MagicLinkPurpose");
ALTER TABLE "MagicLink" ALTER COLUMN "purpose" SET DEFAULT 'UNLOCK_FORMAL_CHECK';
DROP TYPE "MagicLinkPurpose_old";
