import type { Prisma } from "@prisma/client";
import { prisma } from "./index";
/** Reuse a proven canonical identity; changed source identity requires another evidence review. */
export async function serviceMappedUnitId(dataSourceId: string, externalId: string, fallback: string, observed: { officialName: string; unitType: string; capacity: number | null; entireOrShared: string }, client?: Prisma.TransactionClient) {
  const database = client ?? prisma;
  const listing = await database.listing.findUnique({ where: { dataSourceId_externalId: { dataSourceId, externalId } }, select: { id: true } });
  if (!listing) return fallback;
  const repair = await database.serviceDataRepair.findFirst({ where: { listingId: listing.id }, orderBy: { createdAt: "desc" } });
  if (!repair) return fallback;
  const unit = await database.sellableUnit.findUniqueOrThrow({ where: { id: repair.correctedUnitId } });
  const name = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  if (name(unit.officialName) !== name(observed.officialName) || unit.unitType !== observed.unitType || unit.capacity !== observed.capacity || unit.entireOrShared !== observed.entireOrShared || unit.status !== "ACTIVE" || unit.mergedIntoId) throw new Error("SERVICE_MAPPING_REVALIDATION_REQUIRED");
  return unit.id;
}
