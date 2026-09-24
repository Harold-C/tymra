import { createHash } from "node:crypto";

import type { ConfidenceLayer, ConfidenceLevel, FreshnessState, LineageNodeType, Prisma, SourceCapabilityName } from "@prisma/client";

import { prisma } from "./index";

function contentHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function sourceHasCapability(dataSourceId: string, capability: SourceCapabilityName, at = new Date()) {
  return Boolean(await prisma.dataSourceCapability.findFirst({
    where: { dataSourceId, capability, enabled: true, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gt: at } }] },
    select: { id: true },
  }));
}

export async function recordIdentityEntityVersion(entityType: "PROPERTY" | "SELLABLE_UNIT", entityId: string, input: {
  collectedAt: Date;
  collectionRunId?: string;
  collectorVersion?: string;
  parserVersion?: string;
  changeType?: string;
  identityEvidence?: Prisma.InputJsonValue;
}, client?: Prisma.TransactionClient) {
  const database = client ?? prisma;
  const entity = entityType === "PROPERTY"
    ? await database.property.findUniqueOrThrow({ where: { id: entityId } })
    : await database.sellableUnit.findUniqueOrThrow({ where: { id: entityId } });
  const publicAttributes = entityType === "PROPERTY"
    ? { canonicalName: "canonicalName" in entity ? entity.canonicalName : null, address: "address" in entity ? entity.address : null, city: "city" in entity ? entity.city : null, region: "region" in entity ? entity.region : null, territorialAuthority: "territorialAuthority" in entity ? entity.territorialAuthority : null, postcode: "postcode" in entity ? entity.postcode : null, latitude: "latitude" in entity ? entity.latitude : null, longitude: "longitude" in entity ? entity.longitude : null, accommodationType: "accommodationType" in entity ? entity.accommodationType : null, status: entity.status }
    : { canonicalName: entity.canonicalName, officialName: "officialName" in entity ? entity.officialName : null, propertyId: "propertyId" in entity ? entity.propertyId : null, capacity: "capacity" in entity ? entity.capacity : null, bedrooms: "bedrooms" in entity ? entity.bedrooms : null, bathrooms: "bathrooms" in entity ? entity.bathrooms : null, unitType: "unitType" in entity ? entity.unitType : null, entireOrShared: "entireOrShared" in entity ? entity.entireOrShared : null, status: entity.status };
  const hash = contentHash(publicAttributes);
  const existing = await database.identityEntityVersion.findUnique({ where: { entityType_entityId_contentHash: { entityType, entityId, contentHash: hash } } });
  if (existing) return existing;
  const createVersion = async (tx: Prisma.TransactionClient) => {
    const latest = await tx.identityEntityVersion.findFirst({ where: { entityType, entityId }, orderBy: { version: "desc" } });
    if (latest && !latest.validTo) await tx.identityEntityVersion.update({ where: { id: latest.id }, data: { validTo: input.collectedAt, supersededAt: input.collectedAt } });
    return tx.identityEntityVersion.create({ data: {
      entityType,
      entityId,
      version: (latest?.version ?? 0) + 1,
      contentHash: hash,
      changeType: input.changeType ?? (latest ? "PUBLIC_ATTRIBUTES_CHANGED" : "DISCOVERED"),
      publicAttributes,
      identityEvidence: input.identityEvidence ?? {},
      confidenceScore: "identityConfidence" in entity ? entity.identityConfidence : 1,
      collectedAt: input.collectedAt,
      validFrom: input.collectedAt,
      collectorVersion: input.collectorVersion,
      parserVersion: input.parserVersion,
      collectionRunId: input.collectionRunId,
    } });
  };
  return client ? createVersion(client) : prisma.$transaction(createVersion);
}

export async function recordListingVersion(listingId: string, input: {
  collectedAt: Date;
  collectionRunId?: string;
  collectorVersion?: string;
  parserVersion?: string;
  changeType?: string;
  identityEvidence?: Prisma.InputJsonValue;
}, client?: Prisma.TransactionClient) {
  const database = client ?? prisma;
  const listing = await database.listing.findUniqueOrThrow({ where: { id: listingId } });
  const payload = {
    canonicalUrl: listing.canonicalUrl,
    platformUnitName: listing.platformUnitName,
    providerBrand: listing.providerBrand,
    providerFamily: listing.providerFamily,
    onlineStatus: listing.onlineStatus,
    listingStatus: listing.listingStatus,
    propertyId: listing.propertyId,
    sellableUnitId: listing.unitId,
    metadata: listing.metadata,
  };
  const hash = contentHash(payload);
  const existing = await database.listingVersion.findUnique({ where: { listingId_contentHash: { listingId, contentHash: hash } } });
  if (existing) return existing;
  const createVersion = async (tx: Prisma.TransactionClient) => {
    const latest = await tx.listingVersion.findFirst({ where: { listingId }, orderBy: { version: "desc" } });
    if (latest && !latest.validTo) {
      await tx.listingVersion.update({ where: { id: latest.id }, data: { validTo: input.collectedAt, supersededAt: input.collectedAt } });
    }
    const version = (latest?.version ?? 0) + 1;
    const created = await tx.listingVersion.create({
      data: {
        listingId,
        version,
        contentHash: hash,
        changeType: input.changeType ?? (latest ? "PUBLIC_ATTRIBUTES_CHANGED" : "DISCOVERED"),
        canonicalUrl: listing.canonicalUrl,
        platformUnitName: listing.platformUnitName,
        providerBrand: listing.providerBrand,
        providerFamily: listing.providerFamily,
        onlineStatus: listing.onlineStatus,
        listingStatus: listing.listingStatus,
        propertyId: listing.propertyId,
        sellableUnitId: listing.unitId,
        identityEvidence: input.identityEvidence ?? {},
        publicAttributes: listing.metadata as Prisma.InputJsonValue,
        collectedAt: input.collectedAt,
        validFrom: input.collectedAt,
        collectorVersion: input.collectorVersion,
        parserVersion: input.parserVersion,
        collectionRunId: input.collectionRunId,
      },
    });
    await tx.identityRelationVersion.create({
      data: {
        relationType: "LISTING_TO_SELLABLE_UNIT",
        fromEntityType: "LISTING",
        fromEntityId: listing.id,
        toEntityType: "SELLABLE_UNIT",
        toEntityId: listing.unitId,
        version,
        matchMethod: "SOURCE_IDENTITY",
        matchEvidence: input.identityEvidence ?? {},
        confidenceScore: listing.matchConfidence,
        changeReason: created.changeType,
        firstDiscoveredAt: listing.firstDiscoveredAt,
        lastConfirmedAt: listing.lastConfirmedAt ?? input.collectedAt,
        validFrom: input.collectedAt,
      },
    });
    return created;
  };
  return client ? createVersion(client) : prisma.$transaction(createVersion);
}

export async function recordTransformation(input: {
  dataSourceId?: string;
  collectionRunId?: string;
  transformationType: string;
  transformationVersion: string;
  parserVersion?: string;
  normalizerVersion?: string;
  inputs: Array<{ type: LineageNodeType; id: string }>;
  outputs: Array<{ type: LineageNodeType; id: string; evidenceRef?: string; evidenceHash?: string }>;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.transformationRun.create({
    data: {
      dataSourceId: input.dataSourceId,
      collectionRunId: input.collectionRunId,
      transformationType: input.transformationType,
      transformationVersion: input.transformationVersion,
      parserVersion: input.parserVersion,
      normalizerVersion: input.normalizerVersion,
      status: "COMPLETED",
      inputCount: input.inputs.length,
      outputCount: input.outputs.length,
      completedAt: new Date(),
      metadata: input.metadata ?? {},
      lineageEdges: {
        create: input.inputs.flatMap((source) => input.outputs.map((output) => ({
          inputType: source.type,
          inputId: source.id,
          outputType: output.type,
          outputId: output.id,
          evidenceRef: output.evidenceRef,
          evidenceHash: output.evidenceHash,
        }))),
      },
    },
  });
}

export async function recordQualityAssessments(input: {
  entityType: string;
  entityId: string;
  dataDomain: string;
  usagePurpose: string;
  referenceTime?: Date;
  freshnessLimitSeconds?: number;
  freshnessState: FreshnessState;
  confidenceLayer: ConfidenceLayer;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  limitations?: string[];
  calculatedAt?: Date;
}) {
  const calculatedAt = input.calculatedAt ?? new Date();
  const ageSeconds = input.referenceTime ? Math.max(0, Math.floor((calculatedAt.getTime() - input.referenceTime.getTime()) / 1_000)) : null;
  return prisma.$transaction([
    prisma.freshnessAssessment.create({ data: { entityType: input.entityType, entityId: input.entityId, dataDomain: input.dataDomain, usagePurpose: input.usagePurpose, policyVersion: "freshness-v2", calculatedAt, referenceTime: input.referenceTime, ageSeconds, limitSeconds: input.freshnessLimitSeconds, state: input.freshnessState, limitations: input.limitations ?? [] } }),
    prisma.confidenceAssessment.create({ data: { entityType: input.entityType, entityId: input.entityId, layer: input.confidenceLayer, ruleVersion: "confidence-v2", score: input.confidenceScore, level: input.confidenceLevel, components: { sourceCount: 1 }, limitations: input.limitations ?? [], calculatedAt } }),
  ]);
}
