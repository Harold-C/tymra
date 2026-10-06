import { expect, it } from "vitest";
import { otaListingIdentitySchema } from "@tymra/providers/ota-argus-contracts";
import { isSourceScopedRentalIdentity, selectBoundedOtaUnits } from "../src/operations/ota-catalog-identity";
import { otaIdentityRequiresDetail } from "../src/operations/production-ota";
import { otaDiscoveryGeography, otaObservedRegion } from "../src/operations/ota-discovery-geography";

function identity(provider: "airbnb" | "bookabach") {
  const sourceListingId = `${provider}:123`;
  return otaListingIdentitySchema.parse({ provider, sourceListingId,
    canonicalUrl: provider === "airbnb" ? "https://www.airbnb.co.nz/rooms/123" : "https://www.bookabach.co.nz/holiday-accommodation/p123",
    canonicalName: "Public rental", address: null, city: "Christchurch", region: "Canterbury", territorialAuthority: null, postcode: null,
    countryCode: "NZ", latitude: null, longitude: null, propertyType: "Holiday home",
    approximateLocation: { precision: "APPROXIMATE", label: "Woolston, Christchurch, New Zealand", neighborhood: "Woolston", point: { latitude: -43.5, longitude: 172.6 } },
    units: [{ externalId: provider === "airbnb" ? sourceListingId : `${sourceListingId}:entire-home`, officialName: "Public rental", unitType: "Holiday home", capacity: 4,
      bedrooms: 2, bathrooms: 1, bedTypes: [], amenities: [], entireOrShared: "ENTIRE" }],
    observedAt: "2026-10-01T00:00:00.000Z", fieldSources: { units: "public physical unit summary" }, warnings: [], quality: "partial" });
}

it("selects a fitting physical unit consistently rather than the first larger room", () => {
  const base = identity("airbnb").units[0]!;
  const units = [{ ...base, externalId: "family", capacity: 3 }, { ...base, externalId: "unknown", capacity: null },
    { ...base, externalId: "single", capacity: 1 }, { ...base, externalId: "twin", capacity: 2 },
    { ...base, externalId: "queen", capacity: 2 }];
  expect(selectBoundedOtaUnits(units, 2).map(unit => unit.externalId)).toEqual(["queen"]);
  expect(selectBoundedOtaUnits([...units].reverse(), 2).map(unit => unit.externalId)).toEqual(["queen"]);
  expect(selectBoundedOtaUnits(units, 3).map(unit => unit.externalId)).toEqual(["family"]);
  expect(selectBoundedOtaUnits(units, 4)).toEqual([]);
  expect(units[0]?.externalId).toBe("family");
});

it.each(["airbnb", "bookabach"] as const)("supports a stable %s source identity without manufacturing an exact address", provider => {
  const value = identity(provider);
  expect(isSourceScopedRentalIdentity(value)).toBe(true);
  expect(otaIdentityRequiresDetail(value)).toBe(false);
  expect(value.address).toBeNull(); expect(value.latitude).toBeNull();
  expect(isSourceScopedRentalIdentity({ ...value, approximateLocation: null })).toBe(false);
  expect(isSourceScopedRentalIdentity({ ...value, canonicalUrl: "https://evil.invalid/rooms/123" })).toBe(false);
  expect(isSourceScopedRentalIdentity({ ...value, sourceListingId: `${provider}:456` })).toBe(false);
  expect(isSourceScopedRentalIdentity({ ...value, countryCode: "GB" })).toBe(false);
  expect(isSourceScopedRentalIdentity({ ...value, units: [{ ...value.units[0]!, capacity: null }] })).toBe(false);
  expect(isSourceScopedRentalIdentity({ ...value, warnings: ["UNIT_CAPACITY_FROM_SEARCH_OCCUPANCY"] })).toBe(false);
  expect(isSourceScopedRentalIdentity({ ...value, address: "1 Street", latitude: -43.5, longitude: 172.6 })).toBe(false);
});

it("keeps city frontier scope explicit and never maps Northland to Christchurch", () => {
  for (const source of ["agoda", "trip"]) {
    expect(otaDiscoveryGeography(source, { key: "northland", name: "Northland" })).toEqual({ query: "Whangarei, New Zealand", queryScope: "CITY", searchCity: "Whangarei" });
    expect(otaDiscoveryGeography(source, { key: "canterbury", name: "Canterbury" }).query).toBe("Christchurch, New Zealand");
    expect(otaDiscoveryGeography(source, { key: "chatham-islands", name: "Chatham Islands" }).queryScope).toBe("REGION");
  }
  expect(otaDiscoveryGeography("booking", { key: "northland", name: "Northland" }).query).toBe("Northland, New Zealand");
  const frontier = { regionKey: "canterbury", regionName: "Canterbury" };
  expect(otaObservedRegion({ city: "Christchurch Airport", region: "Christchurch" }, frontier)).toBe("Canterbury");
  expect(otaObservedRegion({ city: "Whangarei", region: "Northland" }, frontier)).toBe("Northland");
  expect(otaObservedRegion({ city: null, region: null }, frontier)).toBeNull();
});

it.each(["vb", "ha"])("keeps Bookabach %s namespace identities separate from the bare property ID", suffix => {
  const value = identity("bookabach");
  const sourceListingId = `bookabach:123${suffix}`;
  const namespaced = { ...value, sourceListingId, canonicalUrl: `https://www.bookabach.co.nz/holiday-accommodation/p123${suffix}`,
    units: [{ ...value.units[0]!, externalId: `${sourceListingId}:entire-home` }] };
  expect(isSourceScopedRentalIdentity(namespaced)).toBe(true);
  expect(otaIdentityRequiresDetail(namespaced)).toBe(false);
  expect(isSourceScopedRentalIdentity({ ...namespaced, canonicalUrl: value.canonicalUrl })).toBe(false);
  expect(isSourceScopedRentalIdentity({ ...namespaced, units: value.units })).toBe(false);
  const airbnb = identity("airbnb");
  expect(isSourceScopedRentalIdentity({ ...airbnb, sourceListingId: `airbnb:123${suffix}`, canonicalUrl: `https://www.airbnb.co.nz/rooms/123${suffix}`,
    units: [{ ...airbnb.units[0]!, externalId: `airbnb:123${suffix}` }] })).toBe(false);
});
