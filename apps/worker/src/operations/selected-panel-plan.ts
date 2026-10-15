import { z } from "zod";
import { createHash } from "node:crypto";
import { addNzCalendarDays, nzDayOfWeek, nzDateKey as nzDate } from "@tymra/domain";
export function selectedHash(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export const SELECTED_PANEL_KEY = "christchurch-selected-samples";
export const SELECTED_PANEL_QUEUE = "christchurch-selected-samples";
const source = z.enum(["booking", "expedia", "airbnb", "bookabach", "agoda", "trip"]);
const text = z.string().trim().min(1);
export const selectedMemberSchema = z.object({
  id: text, name: text, source, sourceListingId: text, sourceUrl: z.string().url(),
  locality: text.nullable(), accommodationType: text, nights: z.union([z.literal(1), z.literal(2)]),
  expectedUnitId: text.nullable(), expectedUnitName: text.nullable(),
  entireBedrooms: z.number().int().positive().nullable(),
  signature: z.object({ areaSquareMetres: z.number().positive(), capacity: z.number().int().positive(), bedType: text }).strict().optional(),
  physicalGroup: text.nullable(), evidenceRefs: z.array(text).min(1),
  concentrationGroup: text.nullable(), labels: z.record(z.unknown()),
  enabled: z.boolean(), holdReason: text.nullable(),
}).strict();
export type SelectedMember = z.infer<typeof selectedMemberSchema>;
export const selectedManifestSchema = z.object({
  version: z.literal("christchurch-selected-samples-v1"), start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalExecutionLimit: z.null(), automaticRetries: z.literal(false),
  anchorPolicy: z.literal("MONTH_LOCKED_60_DAY_TUESDAY_SATURDAY"),
  identityTtlDays: z.literal(28), members: z.array(selectedMemberSchema).min(1).max(200),
}).strict().superRefine((m, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
  if (new Set(m.members.map(c => c.id)).size !== m.members.length) invalid("Duplicate member");
  const active = m.members.filter(c => c.enabled);
  if (new Set(active.map(c => `${c.source}:${c.sourceListingId}`)).size !== active.length) invalid("Duplicate listing");
  const groups = active.flatMap(c => c.physicalGroup ? [c.physicalGroup] : []);
  if (new Set(groups).size !== groups.length) invalid("Possible aliases cannot occupy two active seats");
  const hosts: Record<string, string[]> = { booking: ["www.booking.com"], expedia: ["www.expedia.co.nz"], airbnb: ["www.airbnb.com", "www.airbnb.co.nz"], bookabach: ["www.bookabach.co.nz"], agoda: ["www.agoda.com"], trip: ["nz.trip.com", "www.trip.com"] };
  for (const c of m.members) {
    const u = new URL(c.sourceUrl);
    if (u.protocol !== "https:" || u.username || u.password || !hosts[c.source].includes(u.hostname)) invalid("Unapproved source URL");
    if (c.enabled && (c.holdReason || (!c.expectedUnitId && !c.expectedUnitName && !c.entireBedrooms))) invalid("Unresolved target cannot execute");
    if (!c.enabled && !c.holdReason) invalid("Held member needs a reason");
  }
});
export type SelectedManifest = z.infer<typeof selectedManifestSchema>;
export const selectedStateSchema = z.object({
  manifest: selectedManifestSchema, manifestHash: text,
  held: z.array(z.object({ memberId: text, reason: text }).strict()), stoppedSources: z.array(source),
  bindings: z.array(z.object({ memberId: text, unitExternalId: text, verifiedAt: z.string().datetime(), sourceRunId: text }).strict()).default([]),
}).strict().refine(s => selectedHash(s.manifest) === s.manifestHash, "Manifest changed");
export const selectedJobSchema = z.object({
  selectedPanel: z.literal(SELECTED_PANEL_KEY), manifestHash: text, memberId: text, sourceId: source,
  phase: z.enum(["identity", "quote"]), checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unitExternalId: text.nullable(), round: text,
}).strict().refine(t => (t.phase === "identity") === (t.unitExternalId === null), "Invalid phase/unit binding");
export type SelectedTask = z.infer<typeof selectedJobSchema>;
export function isSelectedPanelJob(value: unknown) { return selectedJobSchema.safeParse(value).success; }
export function selectedTaskKey(t: SelectedTask) { return `${SELECTED_PANEL_KEY}:${selectedHash(t)}`; }

/** Month-locked cohorts stay distinct. Never substitute a date in response to missing inventory. */
export function selectedAnchors(now: Date): [string, string] {
  const monthStart = `${nzDate(now).slice(0, 7)}-01`;
  const base = addNzCalendarDays(monthStart, 60);
  return [2, 6].map(day => addNzCalendarDays(base, (day - nzDayOfWeek(base) + 7) % 7)) as [string, string];
}
export function selectedWeek(now: Date) {
  const today = nzDate(now);
  return addNzCalendarDays(today, -((nzDayOfWeek(today) + 6) % 7));
}
export function selectedListingId(c: SelectedMember) {
  if (c.source === "booking") return new URL(c.sourceUrl).pathname.split("/").at(-1)!.replace(/\.html$/, "");
  return `${c.source}:${c.sourceListingId}`;
}

export type MemberProgress = { memberId: string; lastQuoteAt: Date | null; identityAt: Date | null; unitExternalId: string | null };
/** Least recently priced first, stable manifest order for ties; no all-members preflight barrier. */
export function nextSelectedTasks(state: z.infer<typeof selectedStateSchema>, progress: MemberProgress[], used: Set<string>, now: Date): SelectedTask[] {
  if (nzDate(now) < state.manifest.start) return [];
  const anchors = selectedAnchors(now), round = selectedWeek(now);
  const members = state.manifest.members.filter(c => c.enabled && !state.held.some(h => h.memberId === c.id) && !state.stoppedSources.includes(c.source));
  members.sort((a, b) => (progress.find(p => p.memberId === a.id)?.lastQuoteAt?.getTime() ?? 0) - (progress.find(p => p.memberId === b.id)?.lastQuoteAt?.getTime() ?? 0));
  return members.flatMap(c => {
    const p = progress.find(p => p.memberId === c.id);
    const common = { selectedPanel: SELECTED_PANEL_KEY as typeof SELECTED_PANEL_KEY, manifestHash: state.manifestHash, memberId: c.id, sourceId: c.source };
    const fresh = p?.identityAt && p.unitExternalId && now.getTime() - p.identityAt.getTime() < state.manifest.identityTtlDays * 86_400_000;
    const tasks: SelectedTask[] = fresh
      ? anchors.map(checkIn => ({ ...common, phase: "quote", checkIn, unitExternalId: p.unitExternalId, round }))
      : [{ ...common, phase: "identity", checkIn: anchors[0], unitExternalId: null, round: nzDate(now) }];
    return tasks.filter(t => !used.has(selectedTaskKey(t)));
  });
}
