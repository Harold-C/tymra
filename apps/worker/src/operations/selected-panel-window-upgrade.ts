import { z } from "zod";
import { selectedHash, selectedMemberDefinitionHash, selectedMemberExecutionHash, selectedStateSchema, selectedWindowProfileSchema } from "./selected-panel-plan";

const requestSchema = z.object({ expectedStateHash: z.string().regex(/^[a-f0-9]{64}$/),
  changes: z.array(z.object({ memberId: z.string().min(1), nights: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    profile: selectedWindowProfileSchema,
    alternativeUnit: z.object({ expectedUnitId: z.string().min(1).nullable(), expectedUnitName: z.string().min(1),
      signature: z.object({ areaSquareMetres: z.number().positive(), capacity: z.number().int().min(2), bedType: z.string().min(1) }).strict() }).strict().optional(),
  }).strict()).min(1).max(10),
}).strict();

/** Operator-reviewed same-property changes, isolated from existing member task keys and history. */
export function prepareSelectedWindowUpgrade(inputState: unknown, input: unknown) {
  const state = selectedStateSchema.parse(inputState), request = requestSchema.parse(input);
  if (selectedHash(state) !== request.expectedStateHash) throw Error("WINDOW_UPGRADE_STATE_CHANGED");
  if (new Set(request.changes.map(c => c.memberId)).size !== request.changes.length) throw Error("DUPLICATE_WINDOW_UPGRADE");
  for (const c of request.changes) {
    const member = state.manifest.members.find(m => m.id === c.memberId);
    if (!member?.enabled || state.held.some(h => h.memberId === c.memberId) || state.stoppedSources.includes(member.source)) throw Error("WINDOW_UPGRADE_MEMBER_NOT_EXECUTABLE");
    if (c.alternativeUnit && member.source !== "expedia") throw Error("WINDOW_UPGRADE_ALTERNATIVE_NOT_REVIEWED");
  }
  const members = state.manifest.members.map(member => {
    const change = request.changes.find(c => c.memberId === member.id);
    if (!change) return { ...member, labels: { ...member.labels, selectedExecutionLineage: {
      manifestHash: selectedMemberExecutionHash(state, member), memberHash: selectedMemberDefinitionHash(member),
    } } };
    const labels = { ...member.labels, reviewedWindowProfile: change.profile };
    delete (labels as Record<string, unknown>).selectedExecutionLineage;
    return { ...member, ...change.alternativeUnit, nights: change.nights, labels };
  });
  const changed = new Set(request.changes.map(c => c.memberId)), manifest = { ...state.manifest, members };
  const next = selectedStateSchema.parse({ ...state, manifest, manifestHash: selectedHash(manifest),
    bindings: state.bindings.filter(b => !changed.has(b.memberId)),
    held: [...state.held, ...request.changes.map(c => ({ memberId: c.memberId, reason: "REVIEWED_WINDOW_ACCEPTANCE_REQUIRED" }))],
  });
  return { state: next, changes: request.changes, unchangedMembers: members.length - changed.size };
}
