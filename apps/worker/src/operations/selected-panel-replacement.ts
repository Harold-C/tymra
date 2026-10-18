import { z } from "zod";
import { selectedHash, selectedMemberSchema, selectedMemberDefinitionHash, selectedMemberExecutionHash, selectedStateSchema } from "./selected-panel-plan";

export const selectedReplacementSchema = z.object({
  expectedStateHash: z.string().regex(/^[a-f0-9]{64}$/),
  changes: z.array(z.object({ oldMemberId: z.string().min(1), replacement: selectedMemberSchema,
    reason: z.string().min(1), evidenceRefs: z.array(z.string().min(1)).min(1) }).strict()).min(1).max(5),
}).strict();

/** A reviewed seat change starts a new series; other members retain their exact task keys and history. */
export function prepareSelectedReplacement(inputState: unknown, input: unknown) {
  const state = selectedStateSchema.parse(inputState), request = selectedReplacementSchema.parse(input);
  if (selectedHash(state) !== request.expectedStateHash) throw Error("REPLACEMENT_STATE_CHANGED");
  const retired = request.changes.map(c => c.oldMemberId), replacements = request.changes.map(c => c.replacement.id);
  if (new Set(retired).size !== retired.length || new Set(replacements).size !== replacements.length) throw Error("DUPLICATE_REPLACEMENT_SEAT");
  for (const c of request.changes) {
    const old = state.manifest.members.find(m => m.id === c.oldMemberId);
    if (!old || !state.held.some(h => h.memberId === old.id)) throw Error("ONLY_HELD_MEMBERS_MAY_CHANGE");
    if (!c.replacement.enabled || c.replacement.holdReason || c.replacement.labels.selectedExecutionLineage !== undefined) throw Error("REPLACEMENT_MUST_START_NEW_HELD_SERIES");
    if (state.stoppedSources.includes(c.replacement.source)) throw Error("REPLACEMENT_SOURCE_STOPPED");
    if (selectedMemberDefinitionHash(old) === selectedMemberDefinitionHash(c.replacement)) throw Error("REPLACEMENT_IS_UNCHANGED");
    if (state.manifest.members.some(m => !retired.includes(m.id) && m.id === c.replacement.id)) throw Error("REPLACEMENT_ALREADY_ACTIVE");
  }
  const members = state.manifest.members.map(member => {
    const change = request.changes.find(c => c.oldMemberId === member.id);
    if (change) return change.replacement;
    const manifestHash = selectedMemberExecutionHash(state, member);
    return { ...member, labels: { ...member.labels, selectedExecutionLineage: {
      manifestHash, memberHash: selectedMemberDefinitionHash(member),
    } } };
  });
  const manifest = { ...state.manifest, members }, manifestHash = selectedHash(manifest);
  const next = selectedStateSchema.parse({ ...state, manifest, manifestHash,
    held: [...state.held.filter(h => !retired.includes(h.memberId)), ...request.changes.map(c => ({ memberId: c.replacement.id, reason: "MANUAL_ACCEPTANCE_REQUIRED" }))],
    bindings: state.bindings.filter(b => !retired.includes(b.memberId)),
  });
  return { state: next, changes: request.changes, priorManifestHash: state.manifestHash,
    unchangedMembers: state.manifest.members.length - retired.length };
}

/** Restore the previous cohort before rolling back an image; preserve later observations and unrelated holds. */
export function prepareSelectedReplacementRollback(currentState: unknown, beforeState: unknown, appliedManifestHash: string) {
  const current = selectedStateSchema.parse(currentState), before = selectedStateSchema.parse(beforeState);
  if (current.manifestHash !== appliedManifestHash) throw Error("REPLACEMENT_ROLLBACK_MANIFEST_CHANGED");
  const unchanged = before.manifest.members.filter(old => current.manifest.members.some(m =>
    m.id === old.id && selectedMemberDefinitionHash(m) === selectedMemberDefinitionHash(old)
    && selectedMemberExecutionHash(current, m) === selectedMemberExecutionHash(before, old)));
  const keep = new Set(unchanged.map(m => m.id));
  if (selectedHash(current.cadence ?? null) !== selectedHash(before.cadence ?? null)) throw Error("REPLACEMENT_ROLLBACK_CADENCE_CHANGED");
  const restoreRows = <T extends { memberId: string }>(prior: T[], latest: T[]) => {
    const retained = new Map(latest.filter(row => keep.has(row.memberId)).map(row => [row.memberId, row]));
    const ordered = prior.flatMap(row => {
      const value = keep.has(row.memberId) ? retained.get(row.memberId) : row;
      retained.delete(row.memberId);
      return value ? [value] : [];
    });
    return [...ordered, ...retained.values()];
  };
  return selectedStateSchema.parse({ ...current, manifest: before.manifest, manifestHash: before.manifestHash,
    held: restoreRows(before.held, current.held),
    bindings: restoreRows(before.bindings, current.bindings),
  });
}
