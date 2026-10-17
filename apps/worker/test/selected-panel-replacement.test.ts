import { describe, it, expect } from "vitest";
import { selectedFixture, selectedMember } from "./selected-panel-fixtures";
import { nextSelectedTasks, selectedHash, selectedMemberExecutionHash, selectedStateSchema, selectedTaskKey, selectedTaskMatchesState } from "../src/operations/selected-panel-plan";
import { prepareSelectedReplacement, prepareSelectedReplacementRollback } from "../src/operations/selected-panel-replacement";
const now = new Date("2026-10-18T00:00:00Z");
function fixture() {
  const state = selectedStateSchema.parse({ ...selectedFixture(68), held: [{ memberId: "sample0", reason: "MISSING_UNIT" }],
    cadence: { version: "dual-window-weekly-v2", startsOn: "2026-10-16", bookingBootstrapDaily: 24, bookingSteadyDaily: 20 } });
  const replacement = { ...selectedMember(99), id: "new-home", nights: 2 as const, accommodationType: "HOLIDAY_HOME", expectedUnitName: "Two-Bedroom House" };
  const request = { expectedStateHash: selectedHash(state), changes: [{ oldMemberId: "sample0", replacement, reason: "Reviewed unavailable target; new separately analysed series", evidenceRefs: ["source-review"] }] };
  return { state, request };
}
describe("reviewed seat replacement preserves other collection history", () => {
  it("retains the exact 67 unchanged members' task keys, used failures and double-window completion", () => {
    const { state, request } = fixture(), next = prepareSelectedReplacement(state, request).state;
    const identity = state.manifest.members.slice(1).map(m => ({ memberId: m.id, lastQuoteAt: null, identityAt: now, unitExternalId: m.expectedUnitId }));
    const oldTasks = nextSelectedTasks(state, identity, new Set(), now);
    expect(nextSelectedTasks(next, identity, new Set(), now)).toEqual(oldTasks);
    expect(nextSelectedTasks(next, identity, new Set(oldTasks.map(selectedTaskKey)), now)).toEqual([]);
    expect(oldTasks.every(t => selectedTaskMatchesState(next, t))).toBe(true);
    const completed = identity.map(m => ({ ...m, windows: ["2026-12-01", "2026-12-05"].map(checkIn => ({ checkIn, finishedAt: now })) }));
    expect(nextSelectedTasks(next, completed, new Set(), now)).toEqual([]);
    expect(next.held).toEqual([{ memberId: "new-home", reason: "MANUAL_ACCEPTANCE_REQUIRED" }]);
    expect(next.manifest.members).toHaveLength(68);
  });
  it("rejects a changed room, occupancy label or identity carrying an unchanged-member lineage", () => {
    const { state, request } = fixture(), next = prepareSelectedReplacement(state, request).state;
    for (const change of [{ expectedUnitId: "foreign-room" }, { nights: 2 }, { labels: { ...next.manifest.members[1].labels, bedrooms: 7 } }]) {
      const manifest = { ...next.manifest, members: next.manifest.members.map((m, i) => i === 1 ? { ...m, ...change } : m) };
      expect(() => selectedStateSchema.parse({ ...next, manifest, manifestHash: selectedHash(manifest) })).toThrow();
    }
  });
  it("does not inherit a retired member's identity binding, while other bindings and source stops remain", () => {
    const { state, request } = fixture();
    state.bindings = [0, 1].map(i => ({ memberId: `sample${i}`, unitExternalId: `unit${i}`, sourceRunId: `run${i}`, verifiedAt: now.toISOString() }));
    request.expectedStateHash = selectedHash(state);
    const next = prepareSelectedReplacement(state, request).state;
    expect(next.bindings).toEqual([state.bindings[1]]); expect(next.stoppedSources).toEqual(state.stoppedSources);
    expect(selectedMemberExecutionHash(next, next.manifest.members[0])).toBe(next.manifestHash);
  });
  it("rejects changing a normal member, stale controls, an already active listing or inherited replacement history", () => {
    const { state, request } = fixture();
    expect(() => prepareSelectedReplacement(state, { ...request, expectedStateHash: "a".repeat(64) })).toThrow("REPLACEMENT_STATE_CHANGED");
    expect(() => prepareSelectedReplacement(state, { ...request, changes: [{ ...request.changes[0], oldMemberId: "sample1" }] })).toThrow("ONLY_HELD_MEMBERS_MAY_CHANGE");
    expect(() => prepareSelectedReplacement(state, { ...request, changes: [{ ...request.changes[0], replacement: selectedMember(1) }] })).toThrow("REPLACEMENT_ALREADY_ACTIVE");
    expect(() => prepareSelectedReplacement(state, { ...request, changes: [{ ...request.changes[0], replacement: { ...request.changes[0].replacement, sourceListingId: "101", sourceUrl: selectedMember(1).sourceUrl } }] })).toThrow();
  });
  it("preserves the original execution context through a second independent seat change", () => {
    const { state, request } = fixture(), first = prepareSelectedReplacement(state, request).state;
    first.held.push({ memberId: "sample1", reason: "OTHER_MISSING_ROOM" });
    const second = prepareSelectedReplacement(first, { expectedStateHash: selectedHash(first), changes: [{ ...request.changes[0], oldMemberId: "sample1", replacement: { ...selectedMember(100), id: "second-home" } }] }).state;
    expect(selectedMemberExecutionHash(second, second.manifest.members[2])).toBe(state.manifestHash);
    expect(second.manifest.members[2].labels.selectedExecutionLineage).toEqual(first.manifest.members[2].labels.selectedExecutionLineage);
  });
  it("restores rollback-image controls while retaining later unrelated holds and source stops", () => {
    const { state, request } = fixture(), next = prepareSelectedReplacement(state, request).state;
    next.held.push({ memberId: "sample2", reason: "LATER_SOURCE_FAILURE" }); next.stoppedSources = ["trip"];
    const recovered = prepareSelectedReplacementRollback(next, state, next.manifestHash);
    expect(recovered.manifest).toEqual(state.manifest);
    expect(recovered.held).toEqual([{ memberId: "sample2", reason: "LATER_SOURCE_FAILURE" }, ...state.held]);
    expect(recovered.stoppedSources).toEqual(["trip"]);
    expect(() => prepareSelectedReplacementRollback(next, state, "f".repeat(64))).toThrow("REPLACEMENT_ROLLBACK_MANIFEST_CHANGED");
  });
});
