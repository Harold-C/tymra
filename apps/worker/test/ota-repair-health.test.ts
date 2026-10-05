import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ sources: vi.fn(), runs: vi.fn(), executions: vi.fn(), listings: vi.fn(), rates: vi.fn(), artifacts: vi.fn(), latestListing: vi.fn(), latestRate: vi.fn() }));
vi.mock("@tymra/db", async original => ({ ...await original<typeof import("@tymra/db")>(), prisma: {
  dataSource: { findMany: mock.sources }, collectionRun: { findMany: mock.runs }, argusExecution: { findMany: mock.executions },
  listing: { count: mock.listings, findFirst: mock.latestListing }, rateObservation: { count: mock.rates, findFirst: mock.latestRate }, rawArtifact: { count: mock.artifacts },
} }));
import { WorkerService } from "../src/services/worker-service";
import { OTA_REPAIR_ACCEPTANCE_VERSION } from "../src/operations/ota-health";

const now = new Date();
const startedAt = new Date(now.getTime() - 60_000);
const acceptance = { version: OTA_REPAIR_ACCEPTANCE_VERSION, startedAt: startedAt.toISOString(), authorizedAt: new Date(now.getTime() - 30_000).toISOString(), startingJobId: "cmuur4kcd0000phm32h2jyhpb", tymraRevision: "a".repeat(40), argusRevision: "b".repeat(40) };
const source = { id: "expedia-source", key: "expedia", enabled: true, lifecycle: "PILOT", operationalStatus: "HEALTHY", metadata: { productionOtaRepairAcceptance: acceptance } };
const freshRuns = [1, 2].map(i => ({ status: "SUCCEEDED", successCount: 1, failureCount: 0, errorCode: null, scope: { operation: i === 1 ? "NATIONAL_CATALOG_DISCOVERY" : "OTA_PANEL_RATE" }, finishedAt: now }));
const freshExecutions = [1, 2].map(() => ({ status: "COMPLETED", errorCategory: null, result: { status: "success" }, submittedAt: startedAt, completedAt: now }));
type Query = { where: { createdAt?: { gte: Date }; submittedAt?: { gte: Date } } };
const repaired = (query: Query) => (query.where.createdAt?.gte ?? query.where.submittedAt!.gte).getTime() >= startedAt.getTime();
beforeEach(() => {
  vi.resetAllMocks();
  mock.sources.mockResolvedValue([source]);
  mock.runs.mockImplementation((query: Query) => repaired(query) ? freshRuns : [...freshRuns, { ...freshRuns[0], status: "FAILED", successCount: 0, failureCount: 1, errorCode: "PARSING_ERROR" }]);
  mock.executions.mockResolvedValue(freshExecutions);
  mock.artifacts.mockImplementation((query: Query) => repaired(query) ? 0 : 2);
  mock.listings.mockResolvedValue(1); mock.rates.mockResolvedValue(1);
  mock.latestListing.mockResolvedValue({ lastConfirmedAt: now }); mock.latestRate.mockResolvedValue({ collectedAt: now });
});
const report = () => WorkerService.prototype.otaHealth.call(Object.create(WorkerService.prototype) as WorkerService);

it("reports preserved 30-day failures alongside a clean explicitly frozen repair window", async () => {
  const [value] = await report();
  expect(value).toMatchObject({ key: "expedia", parsingFailures: 0, acceptanceWindow: acceptance, historicalWindowDays: 30, releaseGate: { ready: true }, historicalMetrics: { parsingFailures: 3 } });
  expect(value!.evidenceWindowStartedAt).toEqual(startedAt);
  expect(mock.runs).toHaveBeenCalledTimes(2);
  expect(source.metadata.productionOtaRepairAcceptance).toEqual(acceptance);
});
it("keeps the original historical gate when no operator repair boundary exists", async () => {
  mock.sources.mockResolvedValue([{ ...source, metadata: {} }]);
  const [value] = await report();
  expect(value!.parsingFailures).toBe(3);
  expect(value!.acceptanceWindow).toBeNull();
  expect(value!.releaseGate.ready).toBe(false);
  expect(mock.runs).toHaveBeenCalledOnce();
});
it("blocks a new parser failure without silently moving the accepted start", async () => {
  mock.executions.mockResolvedValue([...freshExecutions, { ...freshExecutions[0], status: "FAILED", errorCategory: "PARSING_ERROR", result: { status: "failed" } }]);
  const [value] = await report();
  expect(value!.parsingFailures).toBe(1);
  expect(value!.releaseGate.ready).toBe(false);
  expect(value!.historicalMetrics.parsingFailures).toBe(4);
  expect(value!.acceptanceWindow).toEqual(acceptance);
});
