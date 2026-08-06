import type { PropertyMatchStatus } from "@tymra/domain";

import { prisma } from "./index";

export type StoredAddressIdentity = {
  provider: "linz-nz-addresses";
  externalId: string;
  normalizedAddress: string;
  city: string;
  countryCode: "NZ";
  region: string | null;
  territorialAuthority: string;
  rto: string | null;
  postcode: string | null;
  latitude: number;
  longitude: number;
  confidence: number;
  matchStatus: PropertyMatchStatus;
  lifecycle: string | null;
  sourceUrl: string;
};

type CacheKey = {
  queryHash: string;
  providerKey: string;
  resolverVersion: string;
  resultLimit: number;
};

type Resolution = {
  candidates: StoredAddressIdentity[];
  matchStatus: PropertyMatchStatus;
  warnings: string[];
  validUntil: string;
  staleUntil: string;
};

export const addressIdentityPersistentCache = {
  async read(key: CacheKey): Promise<Resolution | null> {
    const resolution = await prisma.addressResolutionCache.findUnique({
      where: {
        queryHash_providerKey_resolverVersion_resultLimit: key,
      },
      include: {
        candidates: {
          orderBy: { rank: "asc" },
          include: { addressIdentity: true },
        },
      },
    });
    if (!resolution) return null;
    const warnings = Array.isArray(resolution.warnings)
      ? resolution.warnings.filter((warning): warning is string => typeof warning === "string")
      : [];
    return {
      matchStatus: resolution.matchStatus as PropertyMatchStatus,
      warnings,
      validUntil: resolution.validUntil.toISOString(),
      staleUntil: resolution.staleUntil.toISOString(),
      candidates: resolution.candidates.map(({ confidence, addressIdentity }) => ({
        provider: "linz-nz-addresses",
        externalId: addressIdentity.providerExternalId,
        normalizedAddress: addressIdentity.normalizedAddress,
        city: addressIdentity.city,
        countryCode: "NZ",
        region: addressIdentity.region,
        territorialAuthority: addressIdentity.territorialAuthority,
        rto: addressIdentity.rto,
        postcode: addressIdentity.postcode,
        latitude: addressIdentity.latitude,
        longitude: addressIdentity.longitude,
        confidence,
        matchStatus: resolution.matchStatus as PropertyMatchStatus,
        lifecycle: addressIdentity.lifecycle,
        sourceUrl: addressIdentity.sourceUrl,
      })),
    };
  },

  async recordHit(key: CacheKey): Promise<void> {
    await prisma.addressResolutionCache.update({
      where: { queryHash_providerKey_resolverVersion_resultLimit: key },
      data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
    });
  },

  async write(key: CacheKey, value: Resolution): Promise<void> {
    const observedAt = new Date();
    await prisma.$transaction(async (transaction) => {
      await transaction.addressResolutionCache.deleteMany({ where: { staleUntil: { lt: observedAt } } });
      await transaction.addressIdentity.deleteMany({ where: { resolutionCandidates: { none: {} } } });
      const resolution = await transaction.addressResolutionCache.upsert({
        where: { queryHash_providerKey_resolverVersion_resultLimit: key },
        create: {
          ...key,
          matchStatus: value.matchStatus,
          warnings: value.warnings,
          validUntil: new Date(value.validUntil),
          staleUntil: new Date(value.staleUntil),
        },
        update: {
          matchStatus: value.matchStatus,
          warnings: value.warnings,
          validUntil: new Date(value.validUntil),
          staleUntil: new Date(value.staleUntil),
        },
      });
      await transaction.addressResolutionCandidate.deleteMany({ where: { resolutionId: resolution.id } });
      for (const [rank, candidate] of value.candidates.entries()) {
        const identity = await transaction.addressIdentity.upsert({
          where: {
            providerKey_providerExternalId: {
              providerKey: candidate.provider,
              providerExternalId: candidate.externalId,
            },
          },
          create: {
            providerKey: candidate.provider,
            providerExternalId: candidate.externalId,
            normalizedAddress: candidate.normalizedAddress,
            city: candidate.city,
            countryCode: candidate.countryCode,
            region: candidate.region,
            territorialAuthority: candidate.territorialAuthority,
            rto: candidate.rto,
            postcode: candidate.postcode,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            lifecycle: candidate.lifecycle,
            sourceUrl: candidate.sourceUrl,
            observedAt,
            lastSeenAt: observedAt,
          },
          update: {
            normalizedAddress: candidate.normalizedAddress,
            city: candidate.city,
            countryCode: candidate.countryCode,
            region: candidate.region,
            territorialAuthority: candidate.territorialAuthority,
            rto: candidate.rto,
            postcode: candidate.postcode,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            lifecycle: candidate.lifecycle,
            sourceUrl: candidate.sourceUrl,
            observedAt,
            lastSeenAt: observedAt,
          },
        });
        await transaction.addressResolutionCandidate.create({
          data: { resolutionId: resolution.id, addressIdentityId: identity.id, rank, confidence: candidate.confidence },
        });
      }
    });
  },
};

export async function findStoredAddressIdentity(providerKey: string, providerExternalId: string, queryHash: string) {
  return prisma.addressIdentity.findUnique({
    where: { providerKey_providerExternalId: { providerKey, providerExternalId } },
    include: {
      resolutionCandidates: {
        where: { resolution: { queryHash, staleUntil: { gt: new Date() } } },
        orderBy: { resolution: { updatedAt: "desc" } },
        take: 1,
        select: { confidence: true },
      },
    },
  });
}
