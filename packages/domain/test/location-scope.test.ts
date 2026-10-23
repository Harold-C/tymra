import { describe, expect, it } from "vitest";
import { locationContains, readLocationScope, type LocationScope } from "../src/location-scope";

const area: LocationScope = { kind: "SUBURB_BOUNDARY", label: "Synthetic suburb", city: "Test", localityId: "1", sourceUrl: "https://example.test", resolvedAt: "2026-10-13", rings: [[[172,-44],[174,-44],[174,-42],[172,-42],[172,-44]], [[172.5,-43.5],[173.5,-43.5],[173.5,-42.5],[172.5,-42.5],[172.5,-43.5]]] };
describe("location search scope", () => {
  it("excludes polygon holes, outside points and unknown coordinates", () => {
    expect(locationContains(area, -43.8, 172.2)).toBe(true);
    expect(locationContains(area, -43, 173)).toBe(false);
    expect(locationContains(area, -41, 173)).toBe(false);
    expect(locationContains(area, null, 173)).toBe(false);
  });
  it("enforces the address radius", () => {
    const scope: LocationScope = { kind: "ADDRESS_RADIUS", label: "Test", latitude: -43.53, longitude: 172.63, radiusMetres: 5000 };
    expect(locationContains(scope, -43.531, 172.631)).toBe(true);
    expect(locationContains(scope, -43.7, 172.63)).toBe(false);
  });
  it("accepts older unscoped queries but fails closed on corrupted scopes", () => {
    expect(readLocationScope({})).toBe(null);
    expect(() => readLocationScope({ locationScope: { kind: "SUBURB_BOUNDARY", rings: [] } })).toThrow();
  });
});
