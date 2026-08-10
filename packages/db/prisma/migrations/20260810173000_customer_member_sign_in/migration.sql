CREATE TYPE "MagicLinkPurpose" AS ENUM ('UNLOCK_FORMAL_CHECK', 'SIGN_IN_ONLY');

ALTER TABLE "MagicLink"
  ADD COLUMN "returnTo" TEXT;

ALTER TABLE "MagicLink"
  ALTER COLUMN "anonymousCheckId" DROP NOT NULL;

ALTER TABLE "MagicLink"
  ALTER COLUMN "purpose" DROP DEFAULT;

ALTER TABLE "MagicLink"
  ALTER COLUMN "purpose" TYPE "MagicLinkPurpose"
  USING (
    CASE
      WHEN "purpose" = 'SIGN_IN_ONLY' THEN 'SIGN_IN_ONLY'::"MagicLinkPurpose"
      ELSE 'UNLOCK_FORMAL_CHECK'::"MagicLinkPurpose"
    END
  );

ALTER TABLE "MagicLink"
  ALTER COLUMN "purpose" SET DEFAULT 'UNLOCK_FORMAL_CHECK';
