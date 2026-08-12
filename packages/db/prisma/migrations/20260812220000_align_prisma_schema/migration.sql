-- Align database defaults with Prisma's @updatedAt semantics. Prisma writes these
-- values on every create/update, so the database columns must not retain a default.
ALTER TABLE "BenefitGroup" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "MembershipRiskCase" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- PostgreSQL truncates identifiers at 63 bytes. Rename the automatically truncated
-- names to Prisma's deterministic 63-byte names so clean migrate dev runs are stable.
ALTER INDEX "AddressResolutionCache_queryHash_providerKey_resolverVersion_re"
  RENAME TO "AddressResolutionCache_queryHash_providerKey_resolverVersio_key";
ALTER INDEX "EventOccurrenceSourceLink_eventOccurrenceId_sourceEventOccurren"
  RENAME TO "EventOccurrenceSourceLink_eventOccurrenceId_sourceEventOccu_key";
ALTER INDEX "RiskIdentity_benefitGroupId_subjectType_subjectHash_hashVersion"
  RENAME TO "RiskIdentity_benefitGroupId_subjectType_subjectHash_hashVer_key";
