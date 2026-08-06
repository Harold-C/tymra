CREATE TABLE "AddressIdentity" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerExternalId" TEXT NOT NULL,
    "normalizedAddress" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'NZ',
    "region" TEXT,
    "territorialAuthority" TEXT NOT NULL,
    "rto" TEXT,
    "postcode" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "lifecycle" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AddressIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AddressResolutionCache" (
    "id" TEXT NOT NULL,
    "queryHash" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "resolverVersion" TEXT NOT NULL,
    "resultLimit" INTEGER NOT NULL,
    "matchStatus" TEXT NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "staleUntil" TIMESTAMP(3) NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AddressResolutionCache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AddressResolutionCandidate" (
    "resolutionId" TEXT NOT NULL,
    "addressIdentityId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "AddressResolutionCandidate_pkey" PRIMARY KEY ("resolutionId", "addressIdentityId")
);

CREATE UNIQUE INDEX "AddressIdentity_providerKey_providerExternalId_key" ON "AddressIdentity"("providerKey", "providerExternalId");
CREATE INDEX "AddressIdentity_countryCode_region_city_idx" ON "AddressIdentity"("countryCode", "region", "city");
CREATE INDEX "AddressIdentity_lastSeenAt_idx" ON "AddressIdentity"("lastSeenAt");
CREATE UNIQUE INDEX "AddressResolutionCache_queryHash_providerKey_resolverVersion_resultLimit_key" ON "AddressResolutionCache"("queryHash", "providerKey", "resolverVersion", "resultLimit");
CREATE INDEX "AddressResolutionCache_validUntil_idx" ON "AddressResolutionCache"("validUntil");
CREATE INDEX "AddressResolutionCache_staleUntil_idx" ON "AddressResolutionCache"("staleUntil");
CREATE UNIQUE INDEX "AddressResolutionCandidate_resolutionId_rank_key" ON "AddressResolutionCandidate"("resolutionId", "rank");
CREATE INDEX "AddressResolutionCandidate_addressIdentityId_idx" ON "AddressResolutionCandidate"("addressIdentityId");

ALTER TABLE "AddressResolutionCandidate" ADD CONSTRAINT "AddressResolutionCandidate_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "AddressResolutionCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AddressResolutionCandidate" ADD CONSTRAINT "AddressResolutionCandidate_addressIdentityId_fkey" FOREIGN KEY ("addressIdentityId") REFERENCES "AddressIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
