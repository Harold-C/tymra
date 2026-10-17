import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ control: vi.fn(), jobs: vi.fn() }));
vi.mock("@tymra/db", () => ({ prisma: { scheduleDefinition: { findUnique: mocks.control }, job: { findMany: mocks.jobs } } }));
import { legacyOtaDailyWhere } from "../src/operations/selected-panel-budget";
import { selectedFixture } from "./selected-panel-fixtures";
import { nextSelectedTasks } from "../src/operations/selected-panel-plan";
const now = new Date("2026-10-16T06:00:00Z");
beforeEach(() => { vi.clearAllMocks(); mocks.control.mockResolvedValue(null); });
describe("selected-roster source accounting", () => {
  it("keeps legacy accounting when no valid selected plan exists", async () => {
    expect(await legacyOtaDailyWhere("b", "booking", now)).not.toHaveProperty("parentJobId");
    expect(await legacyOtaDailyWhere("e", "expedia", now)).not.toHaveProperty("parentJobId");
    expect(mocks.control).toHaveBeenCalledTimes(2);
  });
  it.each(["booking", "expedia", "airbnb", "bookabach", "agoda", "trip"] as const)("isolates valid selected %s jobs from other plans' allowance", async sourceKey => {
    mocks.control.mockResolvedValue({ payload: { ...selectedFixture(), cadence: { version: "dual-window-weekly-v2", startsOn: "2026-10-16", bookingBootstrapDaily: 24, bookingSteadyDaily: 20 } } });
    const task = { ...nextSelectedTasks(selectedFixture(), [], new Set(), now)[0], sourceId: sourceKey };
    mocks.jobs.mockResolvedValue([{ id: "panel", payload: task }, { id: "other", payload: {} },
      { id: "wrong-source", payload: { ...task, sourceId: sourceKey === "booking" ? "expedia" : "booking" } }]);
    expect(await legacyOtaDailyWhere("source", sourceKey, now)).toMatchObject({ parentJobId: { notIn: ["panel"] } });
    expect(mocks.jobs).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ queueName: "christchurch-selected-samples", sourceId: sourceKey }) }));
  });
});
