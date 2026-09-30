import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ source: vi.fn(), jobs: vi.fn(), runs: vi.fn(), rates: vi.fn(), executions: vi.fn(), artifacts: vi.fn(), parserCount: vi.fn(), listingCount: vi.fn(), schedule: vi.fn(), updateSource: vi.fn(), updateSchedule: vi.fn() }));
vi.mock("@tymra/db", async (original) => ({ ...await original<typeof import("@tymra/db")>(), prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ dataSource: { findUniqueOrThrow: mock.source, update: mock.updateSource }, job: { findMany: mock.jobs }, collectionRun: { findMany: mock.runs }, listing: { count: mock.listingCount }, rateObservation: { count: mock.rates }, argusExecution: { findMany: mock.executions }, rawArtifact: { findMany: mock.artifacts, count: mock.parserCount }, scheduleDefinition: { findUniqueOrThrow: mock.schedule, update: mock.updateSchedule } }) } }));
import { enableProductionOtaSchedule, isProductionOtaSchedule, otaIdentityRequiresDetail, otaSourceApproved, productionOtaPayload, OTA_PILOT_VERSION } from "../src/operations/production-ota";

const source = { id: "booking-source", key: "booking", providerType: "OTA", sourceType: "OTA", enabled: true, isDemo: false, environments: ["PRODUCTION"], concurrencyLimit: 1, dailyBudget: 6, metadata: { productionOta: OTA_PILOT_VERSION }, accessMethod: "PUBLIC_WEB_ARGUS_READ_ONLY" };
const schedule = { key: "pilot-ota-booking-daily", jobType: "CATALOG_DISCOVERY", queueName: "ota-production", cronExpression: "daily", payload: productionOtaPayload("booking") };
beforeEach(() => {
  vi.resetAllMocks();
  mock.source.mockResolvedValue(source);
  mock.schedule.mockResolvedValue(schedule);
  mock.jobs.mockResolvedValue([1, 2].map((i) => ({ id: `job-${i}`, payload: schedule.payload, status: "SUCCEEDED", attemptCount: 1, maxAttempts: 1, createdAt: new Date() })));
  mock.runs.mockResolvedValue([1, 2].map((i) => ({ id: `run-${i}`, status: "SUCCEEDED", successCount: 1, failureCount: 0, finishedAt: new Date(), scope: { deliveryVerified: true, operation: i === 1 ? "NATIONAL_CATALOG_DISCOVERY" : "OTA_PANEL_RATE" } })));
  mock.rates.mockResolvedValue(1);
  mock.listingCount.mockResolvedValue(1);
  mock.parserCount.mockResolvedValue(0);
  mock.executions.mockResolvedValue([1, 2].map((i) => ({ id: i, status: "COMPLETED", result: { result_sha256: "verified" }, completedAt: new Date(), submittedAt: new Date() })));
  mock.artifacts.mockResolvedValue([{ storageRef: "tymra-evidence:retained", parserFailure: false }]);
});
describe("production OTA pilot acceptance", () => {
  it("uses complete listing identities but requires details for search summaries and inferred capacity", () => {
    const identity = { countryCode: "NZ", address: "1 Example Street", latitude: -43, longitude: 172, warnings: [], units: [{ externalId: "room", unitType: "Queen room", capacity: 2 }] };
    expect(otaIdentityRequiresDetail(identity)).toBe(false);
    expect(otaIdentityRequiresDetail({ ...identity, units: [{ ...identity.units[0], unitType: "Search summary (not sellable)" }] })).toBe(true);
    expect(otaIdentityRequiresDetail({ ...identity, warnings: ["UNIT_CAPACITY_FROM_SEARCH_OCCUPANCY"] })).toBe(true);
    expect(otaIdentityRequiresDetail({ ...identity, countryCode: null })).toBe(true);
    expect(otaIdentityRequiresDetail({ ...identity, latitude: null })).toBe(true);
  });
  it("accepts exactly six daily contracts and rejects expanded scope and frequency", () => {
    for (const key of ["booking", "airbnb", "expedia", "bookabach", "agoda", "trip"]) expect(isProductionOtaSchedule({ ...schedule, key: `pilot-ota-${key}-daily`, payload: productionOtaPayload(key) })).toBe(true);
    expect(() => productionOtaPayload("vrbo")).toThrow();
    expect(isProductionOtaSchedule({ ...schedule, payload: { ...schedule.payload, maxDetails: 2 } })).toBe(false);
    expect(isProductionOtaSchedule({ ...schedule, cronExpression: "every-3-hours" })).toBe(false);
    expect(isProductionOtaSchedule({ ...schedule, payload: { ...schedule.payload, accountId: "synix-account" } })).toBe(false);
  });
  it("requires production source isolation and fixed capacity", () => {
    expect(otaSourceApproved(source)).toBe(true);
    for (const changed of [{ isDemo: true }, { accessMethod: "PARTNER_API" }, { concurrencyLimit: 2 }, { dailyBudget: 100 }, { environments: ["DEVELOPMENT"] }]) expect(otaSourceApproved({ ...source, ...changed })).toBe(false);
  });
  it("enables only the selected source after complete evidence", async () => {
    await enableProductionOtaSchedule("booking", "production");
    expect(mock.updateSchedule).toHaveBeenCalledOnce();
    expect(mock.source).toHaveBeenCalledWith({ where: { key: "booking" } });
    expect(mock.updateSource.mock.calls[0][0].where).toEqual({ id: source.id });
  });
  it.each(["FAILED", "PARTIAL", "CANCELLED"])("rejects terminal %s jobs", async (status) => {
    const jobs = await mock.jobs(); jobs[0].status = status; mock.jobs.mockResolvedValue(jobs);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("latest two");
    expect(mock.updateSchedule).not.toHaveBeenCalled();
  });
  it("rejects historical success, automatic retries and fixture payloads", async () => {
    const jobs = await mock.jobs(); jobs[0].attemptCount = 2; mock.jobs.mockResolvedValue(jobs);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("latest two");
    jobs[0].attemptCount = 1; jobs[0].createdAt = new Date(0);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("latest two");
  });
  it("rejects empty, unacknowledged, remote and parsing evidence", async () => {
    mock.rates.mockResolvedValue(0);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("no positive rate evidence");
    mock.rates.mockResolvedValue(1);
    const runs = await mock.runs(); runs[0].scope.deliveryVerified = false;
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("verified delivery");
    runs[0].scope.deliveryVerified = true;
    mock.artifacts.mockResolvedValue([{ storageRef: "argus-evidence:still-remote", parserFailure: false }]);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("retention");
    mock.artifacts.mockResolvedValue([{ storageRef: "tymra-evidence:retained", parserFailure: true }]);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("retention");
    expect(mock.updateSchedule).not.toHaveBeenCalled();
  });
});
