import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import {
  DemoProvider,
  ManualImportProvider,
  type DataProvider,
  type ManualImportRow,
} from "@tymra/providers";

export async function getDataProvider(): Promise<DataProvider> {
  const environment = getEnvironment();
  if (["demo", "fixture"].includes(environment.PROVIDER_MODE)) return new DemoProvider(environment.NODE_ENV);

  const source = await prisma.dataSource.findUnique({ where: { key: "manual-import" } });
  const observations = source
    ? await prisma.rateObservation.findMany({
        where: { dataSourceId: source.id },
        orderBy: { collectedAt: "desc" },
        take: 5_000,
        include: {
          listing: { include: { unit: { include: { property: true } } } },
          stayQuery: true,
        },
      })
    : [];
  const rows: ManualImportRow[] = observations.map((observation) => ({
    property_external_id: observation.listing.unit.property.id,
    property_name: observation.listing.unit.property.canonicalName,
    property_address: observation.listing.unit.property.address,
    unit_external_id: observation.listing.unit.id,
    unit_name: observation.listing.unit.officialName,
    listing_external_id: observation.listing.externalId,
    check_in: observation.stayQuery.checkIn,
    check_out: observation.stayQuery.checkOut,
    currency: "NZD",
    base_amount_minor: observation.baseAmountMinor,
    mandatory_fees_minor: observation.mandatoryFeesMinor,
    taxes_minor: observation.taxesMinor,
    platform_fees_minor: observation.platformFeesMinor,
    cancellation_category: observation.cancellationCategory,
    minimum_stay: observation.minimumStay,
    availability_status: observation.availabilityStatus,
    fee_completeness: observation.feeCompleteness,
    collected_at: observation.collectedAt,
  }));
  return new ManualImportProvider(rows);
}
