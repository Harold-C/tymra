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
    "123 Colombo Street, Christchurch",
    "https://example.com/hotel/nz/example.html",
    "https://booking.com/hotel/au/sydney.html",
    "https://airbnb.co.nz/s/christchurch/homes",
  ])("rejects unsupported or non-listing input: %s", (input) => {
    expect(() => resolveSupportedListingUrl(input, fixedNow)).toThrow(UnsupportedListingUrlError);
  });
});
