import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "@tymra/config";
const mock = vi.hoisted(() => ({ sources: vi.fn(), target: vi.fn(), run: vi.fn(), capture: vi.fn(), artifact: vi.fn(), listing: vi.fn() }));
vi.mock("@tymra/db", async (original) => ({ ...await original<typeof import("@tymra/db")>(), sourceHasCapability: async () => true, prisma: { dataSource: { findMany: mock.sources }, marketCoverage: { upsert: vi.fn() }, sourceCrawlTarget: { upsert: vi.fn(), findMany: mock.target }, collectionRun: { findFirst: mock.run, create: mock.run }, rawArtifact: { upsert: mock.artifact }, listing: { findFirst: mock.listing } } }));
vi.mock("../src/services/argus-orchestrator", async (original) => ({ ...await original<typeof import("../src/services/argus-orchestrator")>(), captureBrowserTaskWithDurableArgus: mock.capture }));
import { WorkerService } from "../src/services/worker-service";
import { DeferredJobError } from "../src/jobs/deferred-job";
import { otaDiscoveryUrlForSource } from "@tymra/providers/ota-argus-contracts";
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  mock.run.mockResolvedValue({ id: "run", status: "RUNNING", startedAt: new Date("2026-09-30T11:00:00Z"), scope: { operation: "NATIONAL_CATALOG_DISCOVERY", targetId: "target" } });
  mock.capture.mockRejectedValue(new DeferredJobError("Waiting", new Date()));
});
afterEach(() => vi.useRealTimers());
describe("OTA discovery request contract", () => {
  it.each(["trip", "agoda", "booking"])("uses the original stay for dated room providers and keeps Booking dateless (%s)", async (key) => {
    const source = { id: "source", key, enabled: true };
    mock.sources.mockResolvedValue([source]);
    mock.target.mockResolvedValue([{ id: "target", dataSourceId: source.id, dataSource: source, url: otaDiscoveryUrlForSource(key, "Canterbury, New Zealand"), metadata: { query: "Canterbury, New Zealand", regionKey: "canterbury" } }]);
    mock.listing.mockResolvedValue(null);
    const candidate = { provider: key, ...(key === "trip" ? { providerBrand: "TRIP_COM", providerFamily: "TRIP_COM" } : {}), sourceListingId: "hotel", providerPropertyId: "hotel", canonicalUrl: key === "trip" ? "https://nz.trip.com/hotels/christchurch-hotel-detail-123/fixture/" : key === "agoda" ? "https://www.agoda.com/fixture/hotel/christchurch-nz.html" : "https://www.booking.com/hotel/nz/fixture.html", canonicalName: "Fixture hotel", address: null, city: "Christchurch", region: "Canterbury", territorialAuthority: null, postcode: null, countryCode: "NZ", latitude: null, longitude: null, propertyType: "Hotel", units: [{ externalId: "summary", officialName: "Search summary", unitType: "Search summary (not sellable)", capacity: null, bedrooms: null, bathrooms: null, bedTypes: [], amenities: [], entireOrShared: "PRIVATE" }], observedAt: "2026-09-30T12:00:00Z", fieldSources: {}, warnings: [], quality: "partial" };
    mock.capture.mockResolvedValueOnce({ ok: true, payload: { status: "success", extracted: { data_schema: "ota-public.discover_listings", schema_version: "1.0.0", provider: key, query: "Canterbury, New Zealand", listings: [candidate], observedAt: candidate.observedAt, warnings: [], quality: "partial" } } }).mockRejectedValueOnce(new DeferredJobError("Waiting for detail", new Date()));
    const service = new WorkerService({ NODE_ENV: "production" } as Environment);
    Object.assign(service, { persistArgusEvidence: vi.fn() });
    await expect(service.refreshCatalog("new-zealand", "job", { sourceId: source.id })).rejects.toBeInstanceOf(DeferredJobError);
    const detail = mock.capture.mock.lastCall?.[1];
    expect(detail).toMatchObject({ connectorId: `${key}-public`, workflowId: "resolve_listing", maxRecords: 1 });
    if (["trip", "agoda"].includes(key)) expect(detail.identityStay).toEqual({ checkIn: "2026-10-08", checkOut: "2026-10-09", adults: 2, children: 0, units: 1, currency: "NZD" });
    else expect(detail.identityStay).toBeUndefined();
  });
  it.each(["PARSING_ERROR", "RATE_LIMITED", "TIMEOUT", "CAPTCHA_REQUIRED"])("keeps %s evidence without labelling every failed capture a parser failure", async (category) => {
    const service = new WorkerService({ NODE_ENV: "production", RAW_ARTIFACT_TTL_HOURS: 72, RAW_ARTIFACT_FAILURE_TTL_HOURS: 168 } as Environment);
    const result = { status: "failed", error: { category }, page: null, evidence: [{ kind: "html", traceId: "public-capture", storageRef: "argus-evidence:public-capture/page.html", sha256: "a".repeat(64), sizeBytes: 100, containsSensitiveData: false }] };
    await Reflect.get(service, "persistArgusEvidence").call(service, "source", "run", result, "expedia-public", "https://www.expedia.co.nz/");
    expect(mock.artifact.mock.lastCall?.[0].create).toMatchObject({ collectionRunId: "run", dataSourceId: "source", parserFailure: category === "PARSING_ERROR", contentHash: "a".repeat(64) });
  });
  it("saves validated reference prices in retained artifact metadata even when no public price can be accepted", async () => {
    const service = new WorkerService({ NODE_ENV: "production", RAW_ARTIFACT_TTL_HOURS: 72, RAW_ARTIFACT_FAILURE_TTL_HOURS: 168 } as Environment);
    const referencePrices = [
      { kind: "ORIGINAL", amountMinor: 27500, ratePlanExternalId: "member-plan", sourceText: "Original price NZD 275" },
      { kind: "MEMBER_ONLY", amountMinor: 24750, ratePlanExternalId: "member-plan", sourceText: "Members-only price NZD 247.50" },
    ];
    const rate = { sourceListingId: "example", unitExternalId: "room-1", checkIn: "2026-10-14", checkOut: "2026-10-15", currency: "NZD",
      basePriceMinor: null, mandatoryFeesMinor: null, taxesMinor: null, optionalFeesMinor: null, totalPriceMinor: null,
      availabilityStatus: "UNKNOWN", restrictionReason: "No anonymous public total", minimumStay: null, mealPlan: "UNKNOWN", cancellationPolicy: "UNKNOWN", paymentTerms: "UNKNOWN",
      rateFence: "REFERENCE_ONLY", sourceUrl: "https://www.booking.com/hotel/nz/example.html", collectedAt: "2026-09-30T12:00:00.000Z", qualityFlags: ["REFERENCE_PRICES_ONLY"], fieldSources: {}, referencePrices };
    const result = { status: "success", error: null, page: null,
      extracted: { data_schema: "ota-public.collect_rates", schema_version: "1.0.0", provider: "booking", sourceListingId: "example", rates: [rate], observedAt: rate.collectedAt, warnings: ["REFERENCE_PRICES_ONLY"], quality: "partial" },
      evidence: [{ kind: "html", traceId: "member-capture", storageRef: "argus-evidence:member-capture/page.html", sha256: "a".repeat(64), sizeBytes: 100, containsSensitiveData: false }] };
    await Reflect.get(service, "persistArgusEvidence").call(service, "source", "run", result, "booking-public", rate.sourceUrl);
    expect(mock.artifact.mock.lastCall?.[0].create).toMatchObject({ parserFailure: false, payload: { otaReferenceRates: [{ unitExternalId: "room-1", currency: "NZD", rateFence: "REFERENCE_ONLY", referencePrices }] } });
    await Reflect.get(service, "persistArgusEvidence").call(service, "source", "other-run", result, "expedia-public", rate.sourceUrl);
    expect(mock.artifact.mock.lastCall?.[0].create.payload.otaReferenceRates).toBeUndefined();
  });
  it.each(["booking", "airbnb", "expedia", "bookabach", "agoda", "trip"])("sends a complete future public stay and resumes its NZ date for %s", async (key) => {
    const source = { id: "source", key, enabled: true };
    mock.sources.mockResolvedValue([source]);
    mock.target.mockResolvedValue([{ id: "target", dataSourceId: source.id, dataSource: source, url: otaDiscoveryUrlForSource(key, "Canterbury, New Zealand"), metadata: { query: "Canterbury, New Zealand", regionKey: "canterbury" } }]);
    const service = new WorkerService({ NODE_ENV: "production" } as Environment);
    for (const now of ["2026-09-30T12:00:00Z", "2026-10-01T12:00:00Z"]) {
      vi.setSystemTime(new Date(now));
      await expect(service.refreshCatalog("new-zealand", "job", { sourceId: source.id })).rejects.toBeInstanceOf(DeferredJobError);
      expect(mock.capture.mock.lastCall?.[1]).toMatchObject({ connectorId: `${key}-public`, workflowId: "discover_listings", checkIn: "2026-10-08", checkOut: "2026-10-09", adults: 2, children: 0, units: 1, currency: "NZD", maxRecords: 1 });
      expect(mock.capture.mock.lastCall?.[2]).toMatchObject({ parentJobId: "job", collectionRunId: "run", dataSourceId: "source" });
    }
  });
});
