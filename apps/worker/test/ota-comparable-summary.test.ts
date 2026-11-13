import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ capture: vi.fn(), property: vi.fn(), unit: vi.fn(), updateRun: vi.fn(), persist: vi.fn() }));
vi.mock("@tymra/db", () => ({
  prisma: {
    priceCheck: { findUniqueOrThrow: vi.fn(async () => ({ property: { id: "target", address: "1 Target Street", city: "Christchurch" },
      unit: { unitType: "Hotel room", capacity: 2 }, stayQuery: { checkIn: new Date("2027-01-05T00:00:00Z"), checkOut: new Date("2027-01-06T00:00:00Z"), adults: 2, children: 0, units: 1, unitConstraints: {} } })) },
    dataSource: { findMany: vi.fn(async () => [{ id: "bookabach-source", key: "bookabach" }]) },
    collectionRun: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: "run", status: "RUNNING" })),
      update: mocks.updateRun, findMany: vi.fn(async () => [{ id: "run", failureCount: 1 }]) },
    property: { upsert: mocks.property }, sellableUnit: { upsert: mocks.unit },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  },
  Prisma: {}, recordIdentityEntityVersion: vi.fn(), recordListingVersion: vi.fn(), serviceMappedUnitId: vi.fn(),
  sourceHasCapability: vi.fn(async () => true),
}));
vi.mock("../src/services/argus-orchestrator", () => ({
  captureBrowserTaskWithDurableArgus: mocks.capture, durableArgusTraceId: () => "synthetic-summary-trace",
}));
import { discoverAndCollectAddressOtaComparables } from "../src/services/ota-pricing-orchestrator";

it("resolves a capacity-bearing unknown Bookabach summary and never persists it when detail is unresolved", async () => {
  mocks.updateRun.mockResolvedValue({ id: "run" });
  const listing = { provider: "bookabach", sourceListingId: "bookabach:123", canonicalUrl: "https://www.bookabach.co.nz/holiday-accommodation/p123",
    canonicalName: "Public search card", address: null, city: null, region: null, territorialAuthority: null, postcode: null,
    countryCode: "NZ", latitude: null, longitude: null, propertyType: "Accommodation", observedAt: "2026-11-13T00:00:00.000Z",
    fieldSources: {}, warnings: [], quality: "partial", units: [{ externalId: "bookabach:123:search-unit", officialName: "Public search card",
      unitType: "Search summary (not sellable)", capacity: 2, bedrooms: null, bathrooms: null, bedTypes: [], amenities: [], entireOrShared: null }] };
  mocks.capture.mockResolvedValueOnce({ ok: true, payload: { status: "success", extracted: {
    data_schema: "ota-public.discover_listings", schema_version: "1.1.0", provider: "bookabach", query: "1 Target Street",
    listings: [listing], observedAt: "2026-11-13T00:00:00.000Z", warnings: [], quality: "partial",
  } } }).mockResolvedValueOnce({ ok: false, httpStatus: 503, message: "Synthetic unresolved public detail" });
  await expect(discoverAndCollectAddressOtaComparables({ environment: {} as any, priceCheckId: "check", parentJobId: "job",
    reuseCachedComparable: false, persistEvidence: mocks.persist })).resolves.toEqual({ discovered: 0 });
  expect(mocks.capture.mock.calls.map(call => call[1].workflowId)).toEqual(["discover_listings", "resolve_listing"]);
  expect(mocks.capture.mock.calls[1]![1].url).toBe(listing.canonicalUrl);
  expect(mocks.property).not.toHaveBeenCalled();
  expect(mocks.unit).not.toHaveBeenCalled();
  expect(mocks.updateRun).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: "COMPARABLE_IDENTITY_UNRESOLVED" }) }));
});
