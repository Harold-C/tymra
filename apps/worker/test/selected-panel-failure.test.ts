import { describe, expect, it } from "vitest";
import { selectedFailureScope } from "../src/operations/selected-panel-failure";
import { nextSelectedTasks, selectedTaskKey, type MemberProgress } from "../src/operations/selected-panel-plan";
import { selectedFixture } from "./selected-panel-fixtures";

describe("selected failure scope", () => {
  it("keeps retryable DNS/navigation and timeout failures in their original window without automatic retries", () => {
    const now = new Date("2026-10-20T06:00:00Z");
    const state = { ...selectedFixture(), cadence: { version: "dual-window-daily-v1" as const, startsOn: "2026-10-16", dailyStartsOn: "2026-10-19", bookingBootstrapDaily: 24 as const, bookingSteadyDaily: 20 as const } };
    state.held.push({ memberId: "sample2", reason: "UNIT_IDENTITY_AMBIGUOUS" });
    const before = structuredClone(state);
    const progress: MemberProgress[] = state.manifest.members.map((m, i) => ({ memberId: m.id, identityAt: now, unitExternalId: `unit${i}`, lastQuoteAt: null, windows: [] }));
    const task = nextSelectedTasks(state, progress, new Set(), now).find(t => t.memberId === "sample0" && t.phase === "quote")!;
    for (const error of ["NAVIGATION_ERROR", "TIMEOUT"]) {
      expect(selectedFailureScope(error, true)).toBe("window");
      const used = new Set([selectedTaskKey(task)]);
      const rest = nextSelectedTasks(state, progress, used, now);
      expect(rest.some(t => selectedTaskKey(t) === selectedTaskKey(task))).toBe(false);
      expect(rest.some(t => t.memberId === task.memberId && t.phase === "quote" && t.checkIn !== task.checkIn)).toBe(true);
      const tomorrow = nextSelectedTasks(state, progress, used, new Date("2026-10-21T06:00:00Z"));
      expect(tomorrow.filter(t => t.memberId === task.memberId && t.phase === "quote")).toHaveLength(2);
      expect(tomorrow.every(t => t.memberId !== "sample2")).toBe(true);
      expect(state).toEqual(before);
    }
  });
  it("retains identity, parsing, unknown-error and nonretryable safeguards", () => {
    for (const code of ["PARSING_ERROR", "INTERNAL_ERROR", "UNIT_IDENTITY_AMBIGUOUS", "SELECTED_ROOM_NOT_RETURNED", "LISTING_IDENTITY_MISMATCH"])
      expect(selectedFailureScope(code, true)).toBe("member");
    for (const retryable of [false, null, undefined]) expect(selectedFailureScope("NAVIGATION_ERROR", retryable)).toBe("member");
    for (const code of ["ACCESS_CHALLENGE", "LOGIN_REQUIRED", "RATE_LIMITED", "SOURCE_CIRCUIT_OPEN", "SOURCE_DAILY_BUDGET_EXHAUSTED"])
      expect(selectedFailureScope(code, true)).toBe("source");
    expect(selectedFailureScope("SELECTED_DAILY_WINDOW_EXPIRED")).toBe("window");
  });
});
