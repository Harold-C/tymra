import { expect, it } from "vitest";
import { otaDiscoverListingsExtractionSchema, otaResolveListingExtractionSchema } from "../src/ota-argus-contracts";

function summary() {
  return { data_schema: "ota-public.discover_listings", schema_version: "1.1.0", provider: "bookabach", query: "Canterbury, New Zealand",
    observedAt: "2026-11-13T00:00:00.000Z", warnings: [], quality: "partial", listings: [{
      provider: "bookabach", sourceListingId: "bookabach:123", canonicalUrl: "https://www.bookabach.co.nz/holiday-accommodation/p123",
      canonicalName: "Public rental search summary", address: null, city: null, region: null, territorialAuthority: null, postcode: null,
      countryCode: "NZ", latitude: null, longitude: null, propertyType: "Accommodation", quality: "partial", warnings: [],
      observedAt: "2026-11-13T00:00:00.000Z", fieldSources: { units: "visible search summary; sharing not disclosed" },
      units: [{ externalId: "bookabach:123:search-unit", officialName: "Public rental search summary", unitType: "Search summary (not sellable)",
        capacity: 2, bedrooms: null, bathrooms: null, bedTypes: [], amenities: [], entireOrShared: null }],
    }] };
}

it("accepts only versioned, source-bound partial Bookabach summaries with unknown sharing", () => {
  const value = summary();
  expect(otaDiscoverListingsExtractionSchema.parse(value).listings[0]?.units[0]?.entireOrShared).toBeNull();
  for (const mutate of [
    (item: any) => { item.schema_version = "1.0.0"; },
    (item: any) => { item.provider = "expedia"; },
    (item: any) => { item.quality = "complete"; },
    (item: any) => { item.listings[0].quality = "complete"; },
    (item: any) => { item.listings[0].units[0].unitType = "Holiday home"; },
    (item: any) => { item.listings[0].units[0].externalId = "bookabach:123:private-room"; },
    (item: any) => { item.listings[0].units[0].externalId = "bookabach:456:search-unit"; },
    (item: any) => { item.listings[0].sourceListingId = "another:123"; item.listings[0].units[0].externalId = "another:123:search-unit"; },
  ]) {
    const invalid = summary(); mutate(invalid);
    expect(otaDiscoverListingsExtractionSchema.safeParse(invalid).success).toBe(false);
  }
  expect(otaResolveListingExtractionSchema.safeParse({ ...value.listings[0],
    data_schema: "ota-public.resolve_listing", schema_version: "1.1.0" }).success).toBe(false);
  const known: any = summary(); known.schema_version = "1.0.0"; known.listings[0].units[0].entireOrShared = "ENTIRE";
  expect(otaDiscoverListingsExtractionSchema.safeParse(known).success).toBe(true);
});
