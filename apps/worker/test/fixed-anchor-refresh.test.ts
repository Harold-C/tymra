import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ candidates: vi.fn(), members: vi.fn(), deactivate: vi.fn(), upsert: vi.fn() }));
vi.mock("@tymra/db", async original => ({ ...await original<typeof import("@tymra/db")>(), prisma: {
  sellableUnit: { findMany: db.candidates }, rateObservation: { findMany: async () => [] },
  panelMembership: { findMany: db.members, updateMany: db.deactivate, upsert: db.upsert },
  marketCoverage: { updateMany: async () => ({ count: 1 }) },
} }));
import { WorkerService } from "../src/services/worker-service";
import type { Environment } from "@tymra/config";
const candidate = (id: string) => ({ id, capacity: 2, unitType: "ROOM", property: { region: "Canterbury", latitude: -43.5, longitude: 172.6 }, listings: [{ id: `listing-${id}` }], panelMemberships: [] });
beforeEach(() => {
  vi.resetAllMocks(); db.candidates.mockResolvedValue([candidate("new"), candidate("anchor")]);
  db.members.mockResolvedValueOnce([{ sellableUnitId: "anchor", membershipType: "ANCHOR" }]).mockResolvedValue([]);
});
describe("anchor refresh persistence boundary", () => {
  it("does not replace anchors with newly ranked candidates", async () => {
    const service = new WorkerService({ NODE_ENV: "development" } as Environment);
    vi.spyOn(service, "refreshOtaMarketSignals").mockResolvedValue({} as never);
    await service.refreshPanel("ANCHOR", "region-canterbury");
    expect(db.deactivate).not.toHaveBeenCalled();
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.upsert.mock.calls[0][0].create.sellableUnitId).toBe("anchor");
    expect(db.upsert.mock.calls[0][0].where.membershipType).toBe("ANCHOR");
    expect(db.upsert.mock.calls[0][0].update).not.toHaveProperty("membershipType");
    expect(db.upsert.mock.calls[0][0].update).not.toHaveProperty("weight");
  });
  it("keeps a missing anchor active rather than replacing it", async () => {
    db.candidates.mockResolvedValue([candidate("new")]);
    const service = new WorkerService({ NODE_ENV: "development" } as Environment);
    vi.spyOn(service, "refreshOtaMarketSignals").mockResolvedValue({} as never);
    await service.refreshPanel("ANCHOR", "region-canterbury");
    expect(db.deactivate).not.toHaveBeenCalled(); expect(db.upsert).not.toHaveBeenCalled();
  });
  it("does not convert an anchor into a rotating member", async () => {
    const service = new WorkerService({ NODE_ENV: "development" } as Environment);
    vi.spyOn(service, "refreshOtaMarketSignals").mockResolvedValue({} as never);
    await service.refreshPanel("ROTATING", "region-canterbury");
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.upsert.mock.calls[0][0].create.sellableUnitId).toBe("new");
    expect(db.deactivate.mock.calls[0][0].where.membershipType).toBe("ROTATING");
  });
});
