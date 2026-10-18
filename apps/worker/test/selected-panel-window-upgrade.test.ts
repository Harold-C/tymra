import { describe, expect, it } from "vitest";
import { selectedFixture } from "./selected-panel-fixtures";
import { nextSelectedTasks, selectedCycle, selectedHash, selectedMemberAnchors, selectedMemberExecutionHash, selectedStateSchema, selectedTaskKey } from "../src/operations/selected-panel-plan";
import { prepareSelectedWindowUpgrade } from "../src/operations/selected-panel-window-upgrade";
import { prepareSelectedReplacementRollback } from "../src/operations/selected-panel-replacement";
import { selectedInput } from "../src/operations/selected-panel-production";

const now = new Date("2026-10-19T06:00:00Z");
const profile = { version: "reviewed-stay-windows-v1" as const, offsets: [-28, -24] as [number, number], reviewedOn: "2026-10-19", evidenceSha256: "a".repeat(64) };
function fixture() {
  const state = selectedStateSchema.parse({ ...selectedFixture(68), cadence: { version: "dual-window-weekly-v2", startsOn: "2026-10-16", bookingBootstrapDaily: 24, bookingSteadyDaily: 20 } });
  const changes = Array.from({ length: 10 }, (_, i) => ({ memberId: `sample${i}`, nights: i === 0 ? 3 : 1, profile }));
  return { state, request: { expectedStateHash: selectedHash(state), changes } };
}
describe("reviewed same-property windows", () => {
  it("preserves all 68 seats and exact 58 other task keys, including completed and failed windows", () => {
    const { state, request } = fixture(), updated = prepareSelectedWindowUpgrade(state, request);
    const progress = state.manifest.members.map(m => ({ memberId: m.id, lastQuoteAt: null, identityAt: now, unitExternalId: m.expectedUnitId }));
    const old = nextSelectedTasks(state, progress, new Set(), now).filter(t => Number(t.memberId.slice(6)) >= 10);
    expect(updated.unchangedMembers).toBe(58); expect(updated.state.manifest.members).toHaveLength(68);
    expect(nextSelectedTasks(updated.state, progress, new Set(), now)).toEqual(old);
    expect(nextSelectedTasks(updated.state, progress, new Set(old.map(selectedTaskKey)), now)).toEqual([]);
    expect(updated.state.held).toHaveLength(10);
    expect(selectedMemberExecutionHash(updated.state, updated.state.manifest.members[0])).toBe(updated.state.manifestHash);
  });
  it("uses fixed reviewed offsets from the cycle's Tuesday, including the January Saturday boundary", () => {
    const { state, request } = fixture(), { state: next } = prepareSelectedWindowUpgrade(state, request), member = next.manifest.members[0];
    expect(selectedMemberAnchors(member, selectedCycle(next, now))).toEqual(["2026-11-03", "2026-11-07"]);
    expect(selectedMemberAnchors(member, selectedCycle(next, new Date("2026-11-07T00:00:00Z")))).toEqual(["2026-12-08", "2026-12-12"]);
    next.held = [];
    const task = nextSelectedTasks(next, [], new Set(), now).find(t => t.memberId === member.id)!;
    expect(selectedInput(member, { ...task, phase: "quote", unitExternalId: "unit0" }, "parent")).toMatchObject({ checkIn: "2026-11-03", checkOut: "2026-11-06", adults: 2, maxAttempts: 1 });
  });
  it("rejects stale controls, duplicate changes, source stops and invalid offsets without applying any change", () => {
    const { state, request } = fixture(), before = structuredClone(state);
    expect(() => prepareSelectedWindowUpgrade(state, { ...request, expectedStateHash: "b".repeat(64) })).toThrow();
    expect(() => prepareSelectedWindowUpgrade(state, { ...request, changes: [request.changes[0], request.changes[0]] })).toThrow();
    expect(() => prepareSelectedWindowUpgrade(state, { ...request, changes: [{ ...request.changes[0], profile: { ...profile, offsets: [7, 7] } }] })).toThrow();
    expect(state).toEqual(before);
  });
  it("restores the old image's exact control shape and preserves later unrelated holds", () => {
    const { state, request } = fixture(), { state: next } = prepareSelectedWindowUpgrade(state, request);
    expect(prepareSelectedReplacementRollback(next, state, next.manifestHash)).toEqual(state);
    next.held.push({ memberId: "sample20", reason: "LATER_FAILURE" });
    expect(prepareSelectedReplacementRollback(next, state, next.manifestHash).held).toEqual([{ memberId: "sample20", reason: "LATER_FAILURE" }]);
  });
});
