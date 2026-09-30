import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "@tymra/config";
const mock = vi.hoisted(() => ({ sources: vi.fn(), target: vi.fn(), run: vi.fn(), capture: vi.fn() }));
vi.mock("@tymra/db", async (original) => ({ ...await original<typeof import("@tymra/db")>(), sourceHasCapability: async () => true, prisma: { dataSource: { findMany: mock.sources }, marketCoverage: { upsert: vi.fn() }, sourceCrawlTarget: { upsert: vi.fn(), findMany: mock.target }, collectionRun: { findFirst: mock.run, create: mock.run } } }));
vi.mock("../src/services/argus-orchestrator", async (original) => ({ ...await original<typeof import("../src/services/argus-orchestrator")>(), captureBrowserTaskWithDurableArgus: mock.capture }));
import { WorkerService } from "../src/services/worker-service";
import { DeferredJobError } from "../src/jobs/deferred-job";
import { otaDiscoveryUrlForSource } from "@tymra/providers";
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  mock.run.mockResolvedValue({ id: "run", status: "RUNNING", startedAt: new Date("2026-09-30T11:00:00Z"), scope: { operation: "NATIONAL_CATALOG_DISCOVERY", targetId: "target" } });
  mock.capture.mockRejectedValue(new DeferredJobError("Waiting", new Date()));
});
afterEach(() => vi.useRealTimers());
describe("OTA discovery request contract", () => {
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
