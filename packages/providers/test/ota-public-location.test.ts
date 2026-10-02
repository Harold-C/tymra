import {expect, it} from "vitest";
import {otaApproximateLocationSchema, otaListingIdentitySchema} from "../src/ota-argus-contracts";
import {matchOtaListingToConfirmedAddress} from "../src/ota-address-match";

it("retains approximate map evidence without promoting it to precise address matching", () => {
  const approximateLocation = {precision: "APPROXIMATE", label: "Woolston, Christchurch, Canterbury, New Zealand",
    neighborhood: "Woolston", point: {latitude: -43.5, longitude: 172.6}};
  const value = otaListingIdentitySchema.parse({provider: "bookabach", sourceListingId: "bookabach:1",
    canonicalUrl: "https://www.bookabach.co.nz/holiday-accommodation/p1", canonicalName: "Fixture",
    address: null, city: "Christchurch", region: "Canterbury", territorialAuthority: null, postcode: null,
    countryCode: "NZ", latitude: null, longitude: null, approximateLocation, propertyType: "Holiday home", units: [],
    observedAt: "2026-10-01T00:00:00.000Z", fieldSources: {approximateLocation: "public listing map"}, warnings: [], quality: "partial"});
  expect(value.approximateLocation).toEqual(approximateLocation);
  expect(value.latitude).toBeNull();
  expect(value.address).toBeNull();
  expect(matchOtaListingToConfirmedAddress({address: "1 Fixture Street", city: "Christchurch", region: "Canterbury",
    countryCode: "NZ", latitude: -43.5, longitude: 172.6}, value).status).toBe("INSUFFICIENT");
  const {approximateLocation: _location, ...olderPayload} = value;
  expect(otaListingIdentitySchema.parse(olderPayload).approximateLocation).toBeUndefined();
});

it("rejects exact precision and locality carrying a point, and accepts older payloads", () => {
  const base = {label: "Christchurch", neighborhood: null, point: null};
  expect(otaApproximateLocationSchema.safeParse({...base, precision: "EXACT"}).success).toBe(false);
  expect(otaApproximateLocationSchema.safeParse({...base, precision: "LOCALITY", point: {latitude: -43, longitude: 172}}).success).toBe(false);
  expect(otaApproximateLocationSchema.safeParse({...base, precision: "APPROXIMATE", point: {latitude: 91, longitude: 172}}).success).toBe(false);
  expect(otaListingIdentitySchema.shape.approximateLocation.safeParse(undefined).success).toBe(true);
});
