import { describe, expect, it } from "vitest";

import { locateOtaDiscoveryCandidate, matchOtaListingToConfirmedAddress } from "../src/ota-address-match";
import { otaArgusConnectorForSource, otaDiscoverListingsExtractionSchema, otaDiscoveryUrlForSource, otaProviderDetails, otaResolveListingExtractionSchema } from "../src/ota-argus-contracts";
import { parseOtaListingReference } from "../src/ota-adapters";

const confirmed = { address: "20 Customhouse Quay, Wellington 6011", city: "Wellington", region: "Wellington", countryCode: "NZ", latitude: -41.2818, longitude: 174.7792 };

describe("OTA listing to confirmed address match", () => {
  it("accepts the same New Zealand location", () => {
    expect(matchOtaListingToConfirmedAddress(confirmed, { ...confirmed, address: "20 Customhouse Quay, Wellington" })).toMatchObject({ status: "MATCH" });
  });

  it("rejects a listing in another city or country", () => {
    expect(matchOtaListingToConfirmedAddress(confirmed, { ...confirmed, city: "Auckland", region: "Auckland", latitude: -36.8485, longitude: 174.7633 })).toMatchObject({ status: "CONFLICT" });
    expect(matchOtaListingToConfirmedAddress(confirmed, { ...confirmed, countryCode: "AU" })).toMatchObject({ status: "CONFLICT", reasons: ["COUNTRY_MISMATCH"] });
  });

  it("does not bind a city-only listing without precise location", () => {
    expect(matchOtaListingToConfirmedAddress(confirmed, { address: null, city: "Wellington", region: "Wellington", countryCode: "NZ", latitude: null, longitude: null })).toMatchObject({ status: "INSUFFICIENT" });
  });

  it("accepts an explicit property-only Expedia resolution without inventing a room", () => {
    const result = otaResolveListingExtractionSchema.parse({
      ...resolvedListing(),
      provider: "expedia",
      providerFamily: "EXPEDIA_GROUP",
      sourceListingId: "expedia:18258191",
      canonicalUrl: "https://www.expedia.co.nz/Christchurch-Hotels-Novotel-Christchurch-Airport.h18258191.Hotel-Information",
      unitIdentityStatus: "not_public",
      units: [],
      quality: "partial",
      warnings: ["EXPEDIA_UNIT_IDENTITY_NOT_PUBLIC"],
    });
    expect(result).toMatchObject({ unitIdentityStatus: "not_public", units: [], quality: "partial" });
  });

  it("rejects empty resolved units without not_public semantics and empty discovery units", () => {
    expect(otaResolveListingExtractionSchema.safeParse({ ...resolvedListing(), units: [] }).success).toBe(false);
    expect(otaResolveListingExtractionSchema.safeParse({ ...resolvedListing(), unitIdentityStatus: "not_public", quality: "complete", units: [] }).success).toBe(false);
    expect(otaDiscoverListingsExtractionSchema.safeParse({
      data_schema: "ota-public.discover_listings",
      schema_version: "1.0.0",
      provider: "booking",
      query: "Christchurch",
      listings: [{ ...resolvedListing(), data_schema: undefined, schema_version: undefined, units: [] }],
      observedAt: "2026-08-09T00:00:00.000Z",
      warnings: [],
      quality: "partial",
    }).success).toBe(false);
  });

  it("accepts a coordinate-bounded comparable when the official listing omits city", () => {
    expect(locateOtaDiscoveryCandidate(confirmed, {
      address: "88 The Terrace",
      city: null,
      region: null,
      countryCode: "NZ",
      latitude: -41.278,
      longitude: 174.773,
    })).toMatchObject({ status: "COMPARABLE", city: "Wellington", citySource: "SEARCH_SCOPE", reasons: ["COORDINATES_IN_SEARCH_SCOPE"] });
  });

  it("excludes the target property and candidates outside the bounded discovery radius", () => {
    expect(locateOtaDiscoveryCandidate(confirmed, { ...confirmed, city: null })).toMatchObject({ status: "TARGET" });
    expect(locateOtaDiscoveryCandidate(confirmed, {
      address: "1 Coast Road",
      city: null,
      region: null,
      countryCode: "NZ",
      latitude: -41.35,
      longitude: 174.78,
    })).toMatchObject({ status: "OUT_OF_SCOPE", reasons: ["DISCOVERY_RADIUS_EXCEEDED"] });
  });

  it("canonicalises supported URLs without accepting a non-New-Zealand Booking path", () => {
    expect(parseOtaListingReference("https://booking.com/hotel/nz/example.html?aid=tracking")).toEqual({ sourceId: "booking", sourceListingId: "example", canonicalUrl: "https://www.booking.com/hotel/nz/example.html" });
    expect(() => parseOtaListingReference("https://booking.com/hotel/au/example.html")).toThrow(/does not identify/u);
  });

  it.each([
    ["https://www.expedia.co.nz/Auckland-Hotels-Example.h12345.Hotel-Information", "expedia", "12345", "https://www.expedia.co.nz/Auckland-Hotels-Example.h12345.Hotel-Information"],
    ["https://www.wotif.co.nz/Auckland-Hotels-Example.h12345.Hotel-Information", "wotif", "12345", "https://www.wotif.co.nz/Auckland-Hotels-Example.h12345.Hotel-Information"],
    ["https://nz.hotels.com/ho12345", "hotels", "12345", "https://nz.hotels.com/ho12345"],
    ["https://www.bookabach.co.nz/holiday-accommodation/p12345", "bookabach", "12345", "https://www.bookabach.co.nz/holiday-accommodation/p12345"],
    ["https://www.vrbo.com/12345ha", "vrbo", "12345", "https://www.vrbo.com/12345"],
    ["https://www.agoda.com/example-hotel/hotel/auckland-nz.html?hotel_id=12345", "agoda", "12345", "https://www.agoda.com/example-hotel/hotel/auckland-nz.html"],
    ["https://www.trip.com/hotels/auckland-hotel-detail-12345/example/", "trip", "12345", "https://nz.trip.com/hotels/example-hotel-detail-12345"],
  ])("recognises %s", (url, sourceId, sourceListingId, canonicalUrl) => {
    expect(parseOtaListingReference(url)).toEqual({ sourceId, sourceListingId, canonicalUrl });
  });

  it.each([
    ["booking", "BOOKING_HOLDINGS", "https://www.booking.com/searchresults.html"],
    ["expedia", "EXPEDIA_GROUP", "https://www.expedia.co.nz/Hotel-Search"],
    ["wotif", "EXPEDIA_GROUP", "https://www.wotif.co.nz/Hotel-Search"],
    ["hotels", "EXPEDIA_GROUP", "https://nz.hotels.com/Hotel-Search"],
    ["bookabach", "VRBO_GROUP", "https://www.bookabach.co.nz/searchResults.html"],
    ["vrbo", "VRBO_GROUP", "https://www.vrbo.com/searchResults.html"],
    ["agoda", "BOOKING_HOLDINGS", "https://www.agoda.com/search"],
    ["trip", "TRIP_COM", "https://nz.trip.com/hotels/list"],
  ])("maps %s to its family and bounded discovery route", (sourceId, family, url) => {
    expect(otaProviderDetails(sourceId)).toMatchObject({ family });
    expect(otaDiscoveryUrlForSource(sourceId, "20 Customhouse Quay, Wellington")).toBe(url);
  });

  it("routes every supported OTA source through its public browser connector", () => {
    expect(otaArgusConnectorForSource("booking")).toBe("booking-public");
    expect(otaArgusConnectorForSource("expedia")).toBe("expedia-public");
    expect(otaArgusConnectorForSource("wotif")).toBe("wotif-public");
    expect(otaArgusConnectorForSource("hotels")).toBe("hotels-public");
  });
});

function resolvedListing() {
  return {
    data_schema: "ota-public.resolve_listing",
    schema_version: "1.0.0",
    provider: "booking",
    sourceListingId: "booking:example",
    canonicalUrl: "https://www.booking.com/hotel/nz/example.html",
    canonicalName: "Example Stay",
    address: "20 Customhouse Quay, Wellington 6011",
    city: "Wellington",
    region: "Wellington",
    territorialAuthority: "Wellington City",
    postcode: "6011",
    countryCode: "NZ",
    latitude: -41.2818,
    longitude: 174.7792,
    propertyType: "Accommodation",
    units: [{ externalId: "room-1", officialName: "Room 1", unitType: "Room", capacity: 2, bedrooms: 1, bathrooms: 1, bedTypes: ["Queen"], amenities: [], entireOrShared: "PRIVATE" }],
    observedAt: "2026-08-09T00:00:00.000Z",
    fieldSources: { canonicalName: "heading" },
    warnings: [],
    quality: "complete",
  };
}
