import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ control: vi.fn(), jobs: vi.fn() }));
vi.mock("@tymra/db", () => ({ prisma: { scheduleDefinition: { findUnique: mocks.control }, job: { findMany: mocks.jobs } } }));
import { legacyOtaDailyWhere } from "../src/operations/selected-panel-budget";
import { selectedFixture } from "./selected-panel-fixtures";
import { nextSelectedTasks } from "../src/operations/selected-panel-plan";
const now = new Date("2026-10-16T06:00:00Z");
beforeEach(() => { vi.clearAllMocks(); mocks.control.mockResolvedValue(null); });
describe("isolated Booking panel allowance", () => {
  it("keeps the old accounting when no upgrade exists and never touches other channels", async () => {
    expect(await legacyOtaDailyWhere("b", "booking", now)).not.toHaveProperty("parentJobId");
    expect(await legacyOtaDailyWhere("e", "expedia", now)).not.toHaveProperty("parentJobId");
    expect(mocks.control).toHaveBeenCalledTimes(1);
  });
  it("excludes only valid dedicated Booking jobs, so increased panel traffic cannot consume other plans' six calls", async () => {
    mocks.control.mockResolvedValue({ payload: { ...selectedFixture(), cadence: { version: "dual-window-weekly-v2", startsOn: "2026-10-16", bookingBootstrapDaily: 24, bookingSteadyDaily: 20 } } });
    mocks.jobs.mockResolvedValue([{ id: "panel", payload: nextSelectedTasks(selectedFixture(), [], new Set(), now)[0] }, { id: "other", payload: {} }]);
    expect(await legacyOtaDailyWhere("b", "booking", now)).toMatchObject({ parentJobId: { notIn: ["panel"] } });
    expect(mocks.jobs).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ queueName: "christchurch-selected-samples", sourceId: "booking" }) }));
  });
});
