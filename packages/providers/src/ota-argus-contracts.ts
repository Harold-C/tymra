import { z } from "zod";

const fieldSourcesSchema = z.record(z.string().min(1));
const qualitySchema = z.enum(["complete", "partial"]);
export const otaProviderSchema = z.enum([
  "booking",
  "airbnb",
  "expedia",
  "wotif",
  "hotels",
  "bookabach",
  "vrbo",
  "agoda",
  "trip",
]);

export type OtaProvider = z.infer<typeof otaProviderSchema>;

export const otaProviderMetadata: Record<OtaProvider, { brand: string; family: string; connectorId: OtaArgusConnectorId }> = {
  booking: { brand: "BOOKING", family: "BOOKING_HOLDINGS", connectorId: "booking-public" },
  airbnb: { brand: "AIRBNB", family: "AIRBNB", connectorId: "airbnb-public" },
  expedia: { brand: "EXPEDIA", family: "EXPEDIA_GROUP", connectorId: "expedia-public" },
  wotif: { brand: "WOTIF", family: "EXPEDIA_GROUP", connectorId: "wotif-public" },
  hotels: { brand: "HOTELS_COM", family: "EXPEDIA_GROUP", connectorId: "hotels-public" },
  bookabach: { brand: "BOOKABACH", family: "VRBO_GROUP", connectorId: "bookabach-public" },
  vrbo: { brand: "VRBO", family: "VRBO_GROUP", connectorId: "vrbo-public" },
  agoda: { brand: "AGODA", family: "BOOKING_HOLDINGS", connectorId: "agoda-public" },
  trip: { brand: "TRIP_COM", family: "TRIP_COM", connectorId: "trip-public" },
};

export type OtaArgusConnectorId = `${OtaProvider}-public`;

export const otaUnitExtractionSchema = z.object({
  externalId: z.string().min(1),
  officialName: z.string().min(1),
  unitType: z.string().min(1),
  capacity: z.number().int().positive(),
  bedrooms: z.number().int().nonnegative().nullable(),
  bathrooms: z.number().nonnegative().nullable(),
  bedTypes: z.array(z.string().min(1)),
  amenities: z.array(z.string().min(1)),
  entireOrShared: z.enum(["ENTIRE", "PRIVATE", "SHARED"]),
});

export const otaListingIdentitySchema = z.object({
  provider: otaProviderSchema,
  sourceListingId: z.string().min(1),
  canonicalUrl: z.string().url(),
  canonicalName: z.string().min(1),
  address: z.string().min(1).nullable(),
  city: z.string().min(1).nullable(),
  region: z.string().min(1).nullable(),
  territorialAuthority: z.string().min(1).nullable(),
  postcode: z.string().min(1).nullable(),
  countryCode: z.string().length(2).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  propertyType: z.string().min(1),
  units: z.array(otaUnitExtractionSchema).min(1).max(50),
  observedAt: z.string().datetime(),
  fieldSources: fieldSourcesSchema,
  warnings: z.array(z.string()),
  quality: qualitySchema,
});

export const otaResolveListingExtractionSchema = otaListingIdentitySchema.extend({
  data_schema: z.literal("ota-public.resolve_listing"),
  schema_version: z.literal("1.0.0"),
});

export const otaDiscoverListingsExtractionSchema = z.object({
  data_schema: z.literal("ota-public.discover_listings"),
  schema_version: z.literal("1.0.0"),
  provider: otaProviderSchema,
  query: z.string().min(1),
  listings: z.array(otaListingIdentitySchema).max(20),
  observedAt: z.string().datetime(),
  warnings: z.array(z.string()),
  quality: qualitySchema,
});

export const otaRateExtractionSchema = z.object({
  sourceListingId: z.string().min(1),
  unitExternalId: z.string().min(1),
  checkIn: z.string().date(),
  checkOut: z.string().date(),
  currency: z.literal("NZD"),
  basePriceMinor: z.number().int().nonnegative().nullable(),
  mandatoryFeesMinor: z.number().int().nonnegative().nullable(),
  taxesMinor: z.number().int().nonnegative().nullable(),
  optionalFeesMinor: z.number().int().nonnegative().nullable(),
  totalPriceMinor: z.number().int().nonnegative().nullable(),
  availabilityStatus: z.enum(["AVAILABLE", "UNAVAILABLE", "MINIMUM_STAY_RESTRICTION", "OCCUPANCY_RESTRICTION", "SOLD_OUT", "NOT_LISTED", "UNKNOWN"]),
  restrictionReason: z.string().nullable(),
  minimumStay: z.number().int().positive().nullable(),
  mealPlan: z.string().min(1),
  cancellationPolicy: z.string().min(1),
  paymentTerms: z.string().min(1),
  rateFence: z.string().min(1),
  sourceUrl: z.string().url(),
  collectedAt: z.string().datetime(),
  qualityFlags: z.array(z.string()),
  fieldSources: fieldSourcesSchema,
}).superRefine((rate, context) => {
  if (rate.totalPriceMinor === null) return;
  const required = [rate.basePriceMinor, rate.mandatoryFeesMinor, rate.taxesMinor];
  if (required.some((value) => value === null)) return;
  const expected = required.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (expected !== rate.totalPriceMinor) context.addIssue({ code: z.ZodIssueCode.custom, path: ["totalPriceMinor"], message: "totalPriceMinor does not equal the explicit price components" });
});

export const otaCollectRatesExtractionSchema = z.object({
  data_schema: z.literal("ota-public.collect_rates"),
  schema_version: z.literal("1.0.0"),
  provider: otaProviderSchema,
  sourceListingId: z.string().min(1),
  rates: z.array(otaRateExtractionSchema).max(20),
  observedAt: z.string().datetime(),
  warnings: z.array(z.string()),
  quality: qualitySchema,
});

export type OtaResolveListingExtraction = z.infer<typeof otaResolveListingExtractionSchema>;
export type OtaDiscoverListingsExtraction = z.infer<typeof otaDiscoverListingsExtractionSchema>;
export type OtaCollectRatesExtraction = z.infer<typeof otaCollectRatesExtractionSchema>;

export function otaArgusConnectorForSource(sourceId: string): OtaArgusConnectorId | null {
  const parsed = otaProviderSchema.safeParse(sourceId);
  return parsed.success ? otaProviderMetadata[parsed.data].connectorId : null;
}

export function otaProviderDetails(sourceId: string) {
  const parsed = otaProviderSchema.safeParse(sourceId);
  return parsed.success ? otaProviderMetadata[parsed.data] : null;
}

export function otaDiscoveryUrlForSource(
  sourceId: string,
  searchQuery: string,
): string | null {
  const parsed = otaProviderSchema.safeParse(sourceId);
  if (!parsed.success) return null;
  const urls: Record<OtaProvider, string> = {
    booking: "https://www.booking.com/searchresults.html",
    airbnb: `https://www.airbnb.co.nz/s/${encodeURIComponent(searchQuery)}/homes`,
    expedia: "https://www.expedia.co.nz/Hotel-Search",
    wotif: "https://www.wotif.co.nz/Hotel-Search",
    hotels: "https://nz.hotels.com/Hotel-Search",
    bookabach: "https://www.bookabach.co.nz/searchResults.html",
    vrbo: "https://www.vrbo.com/searchResults.html",
    agoda: "https://www.agoda.com/search",
    trip: "https://nz.trip.com/hotels/list",
  };
  return urls[parsed.data];
}
