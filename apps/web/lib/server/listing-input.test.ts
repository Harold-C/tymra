import { describe, expect, it } from "vitest";

import { resolveSupportedListingUrl, UnsupportedListingUrlError } from "./listing-input";

const fixedNow = new Date("2026-07-16T01:00:00.000Z");

describe("supported OTA listing input", () => {
  it("resolves a Booking.com New Zealand hotel URL with the observed default context", () => {
    expect(resolveSupportedListingUrl(
      "https://www.booking.com/hotel/nz/christchurch-central-stay.html",
      fixedNow,
    )).toEqual({
      platform: "BOOKING",
      listingId: "christchurch-central-stay",
      context: {
        source: "OTA_DEFAULT",
        checkIn: "2026-07-23",
        checkOut: "2026-07-24",
        adults: 2,
        children: 0,
        units: 1,
        currency: "NZD",
        timezone: "Pacific/Auckland",
      },
    });
  });

  it("uses the Auckland date when UTC is still on the previous day", () => {
    const resolved = resolveSupportedListingUrl(
      "https://www.booking.com/hotel/nz/christchurch-central-stay.html",
      new Date("2026-08-08T12:30:00.000Z"),
    );
    expect(resolved.context).toMatchObject({ checkIn: "2026-08-16", checkOut: "2026-08-17" });
  });

  it("uses valid pricing context carried by a supported OTA URL", () => {
    const resolved = resolveSupportedListingUrl(
      "https://booking.com/hotel/nz/example.html?checkin=2026-08-10&checkout=2026-08-12&group_adults=3&group_children=1&no_rooms=2",
      fixedNow,
    );

    expect(resolved.context).toMatchObject({
      source: "URL",
      checkIn: "2026-08-10",
      checkOut: "2026-08-12",
      adults: 3,
      children: 1,
      units: 2,
    });
  });

  it("resolves Airbnb room URLs and ignores unrelated tracking parameters", () => {
    const resolved = resolveSupportedListingUrl(
      "https://www.airbnb.co.nz/rooms/12345678?source_impression_id=tracking",
      fixedNow,
    );

    expect(resolved.platform).toBe("AIRBNB");
    expect(resolved.listingId).toBe("12345678");
    expect(resolved.context.source).toBe("OTA_DEFAULT");
  });

  it.each([
    ["https://www.expedia.co.nz/Auckland-Hotels-Example.h12345.Hotel-Information", "EXPEDIA", "12345"],
    ["https://www.wotif.co.nz/Auckland-Hotels-Example.h12345.Hotel-Information", "WOTIF", "12345"],
    ["https://nz.hotels.com/ho12345", "HOTELS_COM", "12345"],
    ["https://www.bookabach.co.nz/holiday-accommodation/p12345", "BOOKABACH", "12345"],
    ["https://www.vrbo.com/12345ha", "VRBO", "12345"],
    ["https://www.agoda.com/example-hotel/hotel/auckland-nz.html?hotel_id=12345", "AGODA", "12345"],
    ["https://www.trip.com/hotels/auckland-hotel-detail-12345/example/", "TRIP_COM", "12345"],
  ])("resolves %s", (url, platform, listingId) => {
    expect(resolveSupportedListingUrl(url, fixedNow)).toMatchObject({ platform, listingId });
  });

  it.each([
    "123 Colombo Street, Christchurch",
    "https://example.com/hotel/nz/example.html",
    "https://booking.com/hotel/au/sydney.html",
    "https://airbnb.co.nz/s/christchurch/homes",
  ])("rejects unsupported or non-listing input: %s", (input) => {
    expect(() => resolveSupportedListingUrl(input, fixedNow)).toThrow(UnsupportedListingUrlError);
  });
});
