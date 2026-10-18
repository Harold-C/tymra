import { z } from "zod";
import { createHash } from "node:crypto";
import { addNzCalendarDays, nzDayOfWeek, nzDateKey as nzDate } from "@tymra/domain";
export function selectedHash(value: unknown): string {
  const canonical = (v: unknown): unknown => v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export const SELECTED_PANEL_KEY = "christchurch-selected-samples";
export const SELECTED_PANEL_QUEUE = "christchurch-selected-samples";
const source = z.enum(["booking", "expedia", "airbnb", "bookabach", "agoda", "trip"]);
const text = z.string().trim().min(1);
export const selectedMemberSchema = z.object({
  id: text, name: text, source, sourceListingId: text, sourceUrl: z.string().url(),
  locality: text.nullable(), accommodationType: text, nights: z.union([z.literal(1), z.literal(2), z.literal(3)]),
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
    if (c.labels.reviewedWindowProfile !== undefined && !selectedWindowProfileSchema.safeParse(c.labels.reviewedWindowProfile).success) invalid("Invalid reviewed stay windows");
    const u = new URL(c.sourceUrl);
    if (u.protocol !== "https:" || u.username || u.password || !hosts[c.source].includes(u.hostname)) invalid("Unapproved source URL");
    if (c.enabled && (c.holdReason || (!c.expectedUnitId && !c.expectedUnitName && !c.entireBedrooms))) invalid("Unresolved target cannot execute");
    if (!c.enabled && !c.holdReason) invalid("Held member needs a reason");
    try { selectedMemberExecutionHash({ manifestHash: "" }, c); } catch { invalid("Invalid unchanged-member execution lineage"); }
  }
});
export type SelectedManifest = z.infer<typeof selectedManifestSchema>;
export const selectedStateSchema = z.object({
  manifest: selectedManifestSchema, manifestHash: text,
  held: z.array(z.object({ memberId: text, reason: text }).strict()), stoppedSources: z.array(source),
  bindings: z.array(z.object({ memberId: text, unitExternalId: text, verifiedAt: z.string().datetime(), sourceRunId: text }).strict()).default([]),
  cadence: z.object({ version: z.enum(["dual-window-weekly-v2", "dual-window-daily-v1"]), startsOn: z.string().date(),
    bookingBootstrapDaily: z.literal(24), bookingSteadyDaily: z.literal(20), dailyStartsOn: z.string().date().optional() }).strict()
    .refine(c => c.version !== "dual-window-daily-v1" || (!!c.dailyStartsOn && c.dailyStartsOn >= c.startsOn), "Daily activation date required").optional(),
}).strict().refine(s => selectedHash(s.manifest) === s.manifestHash, "Manifest changed");
export const selectedJobSchema = z.object({
  selectedPanel: z.literal(SELECTED_PANEL_KEY), manifestHash: text, memberId: text, sourceId: source,
  phase: z.enum(["identity", "quote"]), checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unitExternalId: text.nullable(), round: text,
}).strict().refine(t => (t.phase === "identity") === (t.unitExternalId === null), "Invalid phase/unit binding");
export type SelectedTask = z.infer<typeof selectedJobSchema>;
const lineageSchema = z.object({ manifestHash: z.string().regex(/^[a-f0-9]{64}$/), memberHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
/** Preserve an unchanged member's original manifest context without borrowing a changed unit's history. */
export function selectedMemberDefinitionHash(member: SelectedMember): string {
  const labels = { ...member.labels }; delete labels.selectedExecutionLineage;
  return selectedHash({ ...member, labels });
}
export function selectedMemberExecutionHash(state: { manifestHash: string }, member: SelectedMember): string {
  if (member.labels.selectedExecutionLineage === undefined) return state.manifestHash;
  const lineage = lineageSchema.parse(member.labels.selectedExecutionLineage);
  if (lineage.memberHash !== selectedMemberDefinitionHash(member)) throw Error("SELECTED_MEMBER_LINEAGE_CHANGED");
  return lineage.manifestHash;
}
export function selectedTaskMatchesState(state: z.infer<typeof selectedStateSchema>, task: SelectedTask): boolean {
  const member = state.manifest.members.find(m => m.id === task.memberId);
  return !!member && task.sourceId === member.source && task.manifestHash === selectedMemberExecutionHash(state, member);
}
export function isSelectedPanelJob(value: unknown) { return selectedJobSchema.safeParse(value).success; }
export function selectedTaskKey(t: SelectedTask) { return `${SELECTED_PANEL_KEY}:${selectedHash(t)}`; }

/** Month-locked cohorts stay distinct. Never substitute a date in response to missing inventory. */
export function selectedAnchors(now: Date): [string, string] {
  const monthStart = `${nzDate(now).slice(0, 7)}-01`;
  const base = addNzCalendarDays(monthStart, 60);
  return [2, 6].map(day => addNzCalendarDays(base, (day - nzDayOfWeek(base) + 7) % 7)) as [string, string];
}
export const selectedWindowProfileSchema = z.object({
  version: z.literal("reviewed-stay-windows-v1"), offsets: z.tuple([z.number().int().min(-35).max(21), z.number().int().min(-35).max(21)]),
  reviewedOn: z.string().date(), evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine(p => p.offsets[0] < p.offsets[1], "Reviewed windows must be distinct and ordered");
/** Explicit reviewed offsets, never a search-for-any-price or automatic fallback. */
export function selectedMemberAnchors(member: SelectedMember, cycle: { anchors: string[] }): string[] {
  if (member.labels.reviewedWindowProfile === undefined) return cycle.anchors;
  const profile = selectedWindowProfileSchema.parse(member.labels.reviewedWindowProfile);
  return profile.offsets.map(offset => addNzCalendarDays(cycle.anchors[0], offset));
}
export function selectedWeek(now: Date) {
  const today = nzDate(now);
  return addNzCalendarDays(today, -((nzDayOfWeek(today) + 6) % 7));
}
export function selectedListingId(c: SelectedMember) {
  if (c.source === "booking") return new URL(c.sourceUrl).pathname.split("/").at(-1)!.replace(/\.html$/, "");
  return `${c.source}:${c.sourceListingId}`;
}

export type MemberProgress = { memberId: string; lastQuoteAt: Date | null; identityAt: Date | null; unitExternalId: string | null;
  windows?: { checkIn: string; finishedAt: Date }[] };
/** A midnight delivery delay must not consume the next observation date's window. */
export function selectedWindowTime(finishedAt: Date, observedAt: unknown, daily: boolean): Date {
  return daily && typeof observedAt === "string" && Number.isFinite(Date.parse(observedAt)) ? new Date(observedAt) : finishedAt;
}
export function selectedCycle(state: z.infer<typeof selectedStateSchema>, now: Date) {
  if (!state.cadence) return { round: selectedWeek(now), anchors: selectedAnchors(now) };
  const days = Math.floor((Date.parse(nzDate(now)) - Date.parse(state.cadence.startsOn)) / 86_400_000);
  const round = addNzCalendarDays(state.cadence.startsOn, Math.floor(Math.max(0, days) / 7) * 7);
  // Noon NZ time also avoids UTC/month-boundary and DST ambiguities.
  // Observation frequency never moves the reviewed weekly/monthly stay cohort.
  const daily = state.cadence.version === "dual-window-daily-v1" && nzDate(now) >= state.cadence.dailyStartsOn!;
  return { round: daily ? nzDate(now) : round, anchors: selectedAnchors(new Date(`${round}T00:00:00Z`)) };
}
/** The selected roster has no daily count ceiling. Legacy cadence fields remain readable for rollback. */
export function selectedDailyLimit(_state: z.infer<typeof selectedStateSchema>, _sourceKey: string, _normalDaily: number, _now: Date) {
  return Number.POSITIVE_INFINITY;
}
/** Least recently priced first, stable manifest order for ties; no all-members preflight barrier. */
export function nextSelectedTasks(state: z.infer<typeof selectedStateSchema>, progress: MemberProgress[], used: Set<string>, now: Date): SelectedTask[] {
  if (nzDate(now) < state.manifest.start) return [];
  const cycle = selectedCycle(state, now), { round } = cycle;
  const members = state.manifest.members.filter(c => c.enabled && !state.held.some(h => h.memberId === c.id) && !state.stoppedSources.includes(c.source));
  members.sort((a, b) => (progress.find(p => p.memberId === a.id)?.lastQuoteAt?.getTime() ?? 0) - (progress.find(p => p.memberId === b.id)?.lastQuoteAt?.getTime() ?? 0));
  return members.flatMap(c => {
    const anchors = selectedMemberAnchors(c, cycle).filter(day => day > nzDate(now));
    if (!anchors.length) return [];
    const p = progress.find(p => p.memberId === c.id);
    const common = { selectedPanel: SELECTED_PANEL_KEY as typeof SELECTED_PANEL_KEY, manifestHash: selectedMemberExecutionHash(state, c), memberId: c.id, sourceId: c.source };
    const fresh = p?.identityAt && p.unitExternalId && now.getTime() - p.identityAt.getTime() < state.manifest.identityTtlDays * 86_400_000;
    const tasks: SelectedTask[] = fresh
      ? anchors.filter(checkIn => !state.cadence || !p.windows?.some(w => w.checkIn === checkIn && nzDate(w.finishedAt) >= round))
        .map(checkIn => ({ ...common, phase: "quote", checkIn, unitExternalId: p.unitExternalId, round }))
      : [{ ...common, phase: "identity", checkIn: anchors[0], unitExternalId: null, round: nzDate(now) }];
    // Renew in spare capacity during the final valid week; avoid a synchronized 28-day spike.
    if (state.cadence && fresh && !tasks.length && now.getTime() - p.identityAt!.getTime() >= 21 * 86_400_000)
      tasks.push({ ...common, phase: "identity", checkIn: anchors[0], unitExternalId: null, round: nzDate(now) });
    return tasks.filter(t => !used.has(selectedTaskKey(t)));
  }).sort((a, b) => {
    if (!state.cadence) return 0;
    const renewal = (t: SelectedTask) => { const p = progress.find(p => p.memberId === t.memberId);
      return t.phase === "identity" && p?.identityAt && now.getTime() - p.identityAt.getTime() < 28 * 86_400_000; };
    if (!!renewal(a) !== !!renewal(b)) return renewal(a) ? 1 : -1;
    if (renewal(a) && renewal(b)) return progress.find(p => p.memberId === a.memberId)!.identityAt!.getTime()
      - progress.find(p => p.memberId === b.memberId)!.identityAt!.getTime();
    // Fairness is per exact stay window, not per member's most recent other-window price.
    const last = (t: SelectedTask) => progress.find(p => p.memberId === t.memberId)?.windows
      ?.filter(w => w.checkIn === t.checkIn).reduce((n, w) => Math.max(n, w.finishedAt.getTime()), 0) ?? 0;
    return last(a) - last(b);
  });
}
