import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "@tymra/config";
const mock = vi.hoisted(() => ({ member: vi.fn(), memberUpsert: vi.fn(), source: vi.fn(), listingFind: vi.fn(), runFind: vi.fn(), runCreate: vi.fn(), runUpdate: vi.fn(), stay: vi.fn(), stayFind: vi.fn(), profile: vi.fn(), observation: vi.fn(), memberUpdate: vi.fn(), capture: vi.fn(), evidence: vi.fn() }));
vi.mock("@tymra/db", async (original) => ({ ...await original<typeof import("@tymra/db")>(), sourceHasCapability: async () => true, recordTransformation: vi.fn(), prisma: { dataSource: { findUniqueOrThrow: mock.source }, listing: { findFirst: mock.listingFind, count: async () => 1 }, property: { count: async () => 1 }, sellableUnit: { count: async () => 1 }, marketCoverage: { updateMany: async () => ({ count: 1 }) }, panelMembership: { findUniqueOrThrow: mock.member, upsert: mock.memberUpsert, update: mock.memberUpdate, count: async () => 1 }, collectionRun: { findFirst: mock.runFind, create: mock.runCreate, update: mock.runUpdate }, stayQuery: { create: mock.stay, findUniqueOrThrow: mock.stayFind }, collectionProfile: { upsert: mock.profile }, rateObservation: { upsert: mock.observation }, rawArtifact: { findMany: async () => [] }, $transaction: async (items: Promise<unknown>[]) => Promise.all(items) } }));
vi.mock("../src/services/argus-orchestrator", async (original) => ({ ...await original<typeof import("../src/services/argus-orchestrator")>(), captureBrowserTaskWithDurableArgus: mock.capture }));
import { WorkerService } from "../src/services/worker-service";
import { DeferredJobError } from "../src/jobs/deferred-job";
import { productionOtaPayload } from "../src/operations/production-ota";
const listing = { id: "listing", propertyId: "property", unitId: "unit", dataSourceId: "source", externalId: "hotel:room-1", sourceListingId: "hotel", canonicalUrl: "https://www.booking.com/hotel/nz/example.html", platformUnitName: "Queen room", dataSource: { key: "booking", operationalStatus: "HEALTHY" } };
const run = { id: "run-1", status: "RUNNING", scope: { checkIn: "2026-10-07", stayQueryId: "query", panelMembershipId: "member" } };
let rate: Record<string, unknown>;
let service: WorkerService;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T10:30:00Z"));
  service = new WorkerService({ NODE_ENV: "production", PROVIDER_MODE: "live", PUBLIC_COLLECTION_MODE: "live" } as Environment);
  Object.assign(service, { persistArgusEvidence: mock.evidence });
  mock.member.mockResolvedValue({ id: "member", sellableUnitId: "unit", membershipType: "ANCHOR", marketKey: "region-canterbury", sellableUnit: { canonicalName: "Queen room", capacity: 2, version: 1, listings: [listing] } });
  mock.runFind.mockResolvedValue(run); mock.runCreate.mockResolvedValue(run);
  mock.stayFind.mockResolvedValue({ id: "query" }); mock.stay.mockResolvedValue({ id: "query" });
  mock.profile.mockResolvedValue({ id: "profile" }); mock.observation.mockResolvedValue({ id: "observation", evidenceRef: "retained" });
  mock.source.mockResolvedValue({ id: "source", key: "booking", providerType: "OTA", sourceType: "OTA", enabled: true, isDemo: false, environments: ["PRODUCTION"], concurrencyLimit: 1, dailyBudget: 6, metadata: { productionOta: "ota-bounded-production-v1" }, accessMethod: "PUBLIC_WEB_ARGUS_READ_ONLY", operationalStatus: "HEALTHY" });
  mock.listingFind.mockResolvedValue({ ...listing, property: { region: "Canterbury" } }); mock.memberUpsert.mockResolvedValue({ id: "member" });
  rate = { sourceListingId: "hotel", unitExternalId: "room-1", checkIn: "2026-10-07", checkOut: "2026-10-08", currency: "NZD", basePriceMinor: 20000, mandatoryFeesMinor: 1000, taxesMinor: 3000, optionalFeesMinor: 0, totalPriceMinor: 24000, availabilityStatus: "AVAILABLE", restrictionReason: null, minimumStay: null, mealPlan: "ROOM_ONLY", cancellationPolicy: "STANDARD", paymentTerms: "PAY_LATER", rateFence: "PUBLIC", sourceUrl: listing.canonicalUrl, collectedAt: "2026-09-30T10:00:00.000Z", qualityFlags: [], fieldSources: { totalPriceMinor: "public rate card" } };
  mock.capture.mockImplementation(async () => ({ ok: true, payload: { status: "success", extracted: { data_schema: "ota-public.collect_rates", schema_version: "1.0.0", provider: "booking", sourceListingId: "hotel", rates: [rate], observedAt: rate.collectedAt, warnings: [], quality: "complete" } } }));
});
afterEach(() => vi.useRealTimers());
function referenceOnlyRate() {
  Object.assign(rate, { availabilityStatus: "UNKNOWN", rateFence: "REFERENCE_ONLY", basePriceMinor: null,
    mandatoryFeesMinor: null, taxesMinor: null, optionalFeesMinor: null, totalPriceMinor: null, referencePrices: [
      { kind: "ORIGINAL", amountMinor: 27500, ratePlanExternalId: "member-plan", sourceText: "Original price NZD 275" },
      { kind: "MEMBER_ONLY", amountMinor: 24750, ratePlanExternalId: "member-plan", sourceText: "Members-only price NZD 247.50" },
    ] });
}
describe("durable physical-unit panel prices", () => {
  it.each(["PARSING_ERROR", "RATE_LIMITED"])("preserves the actual %s rate failure in the failed batch", async (category) => {
    mock.capture.mockResolvedValue({ ok: true, payload: { status: category === "RATE_LIMITED" ? "manual_required" : "failed", error: { category, message: "Source capture failed" } } });
    await expect(service.collectPanelMemberRate("member", "job", "source")).rejects.toMatchObject({ code: category });
    expect(mock.runUpdate.mock.lastCall?.[0].data).toMatchObject({ status: "FAILED", errorCode: category });
    expect(mock.observation).not.toHaveBeenCalled();
  });
  it("resumes one run/query and appends a new observation for a later run on the same stay", async () => {
    await expect(service.collectPanelMemberRate("member", "job-1", "source")).resolves.toBe(true);
    expect(mock.runCreate).not.toHaveBeenCalled(); expect(mock.stay).not.toHaveBeenCalled();
    const first = mock.observation.mock.calls[0][0];
    expect(first.create.idempotencyKey).toBe(first.where.idempotencyKey);
    mock.runFind.mockResolvedValue({ ...run, id: "run-2" }); rate.totalPriceMinor = 25000; rate.basePriceMinor = 21000;
    await service.collectPanelMemberRate("member", "job-2", "source");
    expect(mock.observation.mock.calls[1][0].where.idempotencyKey).not.toBe(first.where.idempotencyKey);
    expect(mock.observation.mock.calls[1][0].create.totalAmountMinor).toBe(25000);
  });
  it("preserves waiting state without a failed batch or duplicate query", async () => {
    mock.capture.mockRejectedValue(new DeferredJobError("Waiting", new Date()));
    await expect(service.collectPanelMemberRate("member", "job", "source")).rejects.toBeInstanceOf(DeferredJobError);
    expect(mock.runUpdate).not.toHaveBeenCalled(); expect(mock.stay).not.toHaveBeenCalled(); expect(mock.observation).not.toHaveBeenCalled();
  });
  it.each([{ unitExternalId: "other-room" }, { checkIn: "2026-10-09" }, { adults: 3 }, { sourceListingId: "other-hotel" }])("rejects mismatched identity or stay %j", async (changed) => {
    Object.assign(rate, changed);
    await expect(service.collectPanelMemberRate("member", "job", "source")).rejects.toThrow("no matching rate");
    expect(mock.observation).not.toHaveBeenCalled();
  });
  it("preserves unknown mandatory fees and refuses production acceptance", async () => {
    rate.mandatoryFeesMinor = null;
    await expect(service.collectPanelMemberRate("member", "job", "source")).rejects.toThrow("complete mandatory fees");
    expect(mock.observation).not.toHaveBeenCalled();
  });
  it("distinguishes an unavailable exact stay from incomplete mandatory fees", async () => {
    Object.assign(rate, { availabilityStatus: "UNAVAILABLE", restrictionReason: "These dates are not available", basePriceMinor: null,
      mandatoryFeesMinor: null, taxesMinor: null, totalPriceMinor: null, priceStatus: "UNAVAILABLE" });
    await expect(service.collectPanelMemberRate("member", "job", "source")).rejects.toMatchObject({ code: "NO_AVAILABLE_PUBLIC_RATE" });
    expect(mock.runUpdate.mock.lastCall?.[0].data).toMatchObject({ status: "FAILED", errorCode: "NO_AVAILABLE_PUBLIC_RATE" });
    expect(mock.observation).not.toHaveBeenCalled();
  });
  it("retains reference-only evidence as a completed capture without a public observation or increased price coverage", async () => {
    referenceOnlyRate();
    await expect(service.collectPanelMemberRate("member", "job", "source")).resolves.toBe("REFERENCE_ONLY");
    expect(mock.evidence).toHaveBeenCalledWith("source", "run-1", expect.objectContaining({ extracted: expect.objectContaining({ rates: [expect.objectContaining({ referencePrices: rate.referencePrices })] }) }), "booking-public", listing.canonicalUrl);
    expect(mock.runUpdate.mock.lastCall?.[0].data).toMatchObject({ status: "SUCCEEDED", successCount: 0, failureCount: 0, errorCode: null, scope: { ...run.scope, rateOutcome: "REFERENCE_ONLY", referencePriceCount: 2 } });
    expect(mock.memberUpdate.mock.lastCall?.[0].data).toEqual({ coverageGap: { code: "REFERENCE_PRICES_ONLY", publicTotalVerified: false, referencePriceCount: 2, observedAt: rate.collectedAt }, collectionCost: { increment: 1 } });
    expect(mock.observation).not.toHaveBeenCalled();
  });
  it("resumes a reference-only capture without fetching again, charging again or claiming a public price", async () => {
    mock.runFind.mockResolvedValue({ ...run, status: "SUCCEEDED", scope: { ...run.scope, rateOutcome: "REFERENCE_ONLY", referencePriceCount: 2 } });
    await expect(service.collectPanelMemberRate("member", "job", "source")).resolves.toBe("REFERENCE_ONLY");
    expect(mock.capture).not.toHaveBeenCalled(); expect(mock.runUpdate).not.toHaveBeenCalled();
    expect(mock.memberUpdate).not.toHaveBeenCalled(); expect(mock.observation).not.toHaveBeenCalled();
  });
  it("completes a bounded reference-only parent and collects the next parent's verified public total", async () => {
    vi.spyOn(service, "refreshCatalog").mockResolvedValue({ marketScope: "new-zealand", discovered: 1, failed: 0 });
    const publicRate = { ...rate };
    referenceOnlyRate();
    await expect(service.collectProductionOta(productionOtaPayload("booking"), "job-1")).resolves.toMatchObject({ discovered: 1, publicPricesCollected: 0, referenceOnlyUnits: 1 });
    expect(mock.observation).not.toHaveBeenCalled();
    rate = publicRate; mock.runFind.mockResolvedValue({ ...run, id: "run-2" });
    await expect(service.collectProductionOta(productionOtaPayload("booking"), "job-2")).resolves.toMatchObject({ discovered: 1, publicPricesCollected: 1, referenceOnlyUnits: 0 });
    expect(mock.observation).toHaveBeenCalledOnce();
    expect(mock.observation.mock.lastCall?.[0].create).toMatchObject({ collectionRunId: "run-2", totalAmountMinor: 24000, rateFence: "PUBLIC", availabilityStatus: "AVAILABLE" });
  });
  it.each([{ referencePrices: [] }, { totalPriceMinor: 24750 }, { availabilityStatus: "AVAILABLE" }, { collectedAt: "2026-08-01T00:00:00Z" }, { unitExternalId: "other-room" }])("still rejects invalid or mismatched reference-only evidence %j", async (changed) => {
    referenceOnlyRate(); Object.assign(rate, changed);
    await expect(service.collectPanelMemberRate("member", "job", "source")).rejects.toThrow();
    expect(mock.runUpdate.mock.lastCall?.[0].data.status).toBe("FAILED"); expect(mock.observation).not.toHaveBeenCalled();
  });
  it.each([null, 24000])("keeps UNKNOWN availability distinct from unavailable, even with total %s", async (totalPriceMinor) => {
    Object.assign(rate, { availabilityStatus: "UNKNOWN", restrictionReason: null, basePriceMinor: null,
      mandatoryFeesMinor: null, taxesMinor: null, totalPriceMinor, priceStatus: totalPriceMinor === null ? "UNAVAILABLE" : "PARTIAL" });
    await expect(service.collectPanelMemberRate("member", "job", "source")).rejects.toMatchObject({
      code: "PUBLIC_RATE_AVAILABILITY_UNKNOWN", message: "Public availability for the exact stay could not be verified",
    });
    expect(mock.runUpdate.mock.lastCall?.[0].data).toMatchObject({ status: "FAILED", errorCode: "PUBLIC_RATE_AVAILABILITY_UNKNOWN" });
    expect(mock.observation).not.toHaveBeenCalled();
  });
  it("does not accept a historical or future observed timestamp as a current production price", async () => {
    rate.collectedAt = "2026-08-01T00:00:00Z";
    await expect(service.collectPanelMemberRate("member", "job", "source")).rejects.toThrow("current day");
    expect(mock.observation).not.toHaveBeenCalled();
  });
});
