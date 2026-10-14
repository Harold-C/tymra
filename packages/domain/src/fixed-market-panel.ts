import { z } from "zod";
import { addNzCalendarDays, nzDayOfWeek } from "./nz-time";
import { marketSampleLabelsSchema, normalizeSampleType, sampleStratumKey } from "./market-sample-labels";

const memberSchema = z.object({
  propertyId: z.string().min(1), unitId: z.string().min(1), listingId: z.string().min(1),
  source: z.string().min(1), category: z.string().min(1), market: z.literal("Christchurch City"),
  profileKey: z.string().min(1), termsKey: z.string().min(1),
  identityReviewed: z.literal(true), labels: marketSampleLabelsSchema,
}).strict().superRefine((member, context) => {
  if (!member.labels.geography || member.labels.geography.authorityName !== member.market || member.labels.geography.regionName.replace(/ Region$/, "") !== "Canterbury")
    context.addIssue({ code: "custom", message: "Frozen member needs reviewed suburb/city/region assignment" });
  if (member.labels.accommodationType.value === "UNKNOWN" || member.labels.accommodationType.value !== normalizeSampleType(member.category))
    context.addIssue({ code: "custom", message: "Frozen member needs a consistent known accommodation type" });
  if (!member.labels.capacityGuests || member.labels.capacityGuests.value < 2)
    context.addIssue({ code: "custom", message: "Frozen member must accommodate the pilot's two adults" });
  if (!member.labels.unitKind || member.labels.unitKind.value === "UNKNOWN")
    context.addIssue({ code: "custom", message: "Frozen member needs a verified physical unit kind" });
  const baseline = member.labels.priceBaseline;
  if (baseline && (baseline.profileKey !== member.profileKey || baseline.termsKey !== member.termsKey))
    context.addIssue({ code: "custom", message: "Price baseline does not match pinned quote conditions" });
});
export type FixedMarketMember = z.infer<typeof memberSchema>;
export const fixedMarketPanelSchema = z.object({
  version: z.literal("christchurch-fixed-panel-v2"), revision: z.number().int().positive(),
  frozenOn: z.string(), targetSize: z.number().int().positive().safe(), members: z.array(memberSchema),
}).strict().superRefine((panel, context) => {
  if (panel.members.length > panel.targetSize)
    context.addIssue({ code: "custom", message: "Members exceed reviewed target size" });
  if (new Set(panel.members.map(member => member.propertyId)).size !== panel.members.length)
    context.addIssue({ code: "custom", message: "Only one pinned unit/listing per property" });
  if (new Set(panel.members.map(member => member.unitId)).size !== panel.members.length || new Set(panel.members.map(member => member.listingId)).size !== panel.members.length)
    context.addIssue({ code: "custom", message: "A unit or listing cannot represent multiple properties" });
  try { addNzCalendarDays(panel.frozenOn, 0); } catch { context.addIssue({ code: "custom", message: "Invalid freeze date" }); }
});
export type FixedMarketPanel = z.infer<typeof fixedMarketPanelSchema>;

/** Once anchors exist, a refresh only revisits them; rotating selection cannot take them over. */
export function eligiblePanelIds(type: "ANCHOR" | "ROTATING", candidates: string[], active: { sellableUnitId: string; membershipType: "ANCHOR" | "ROTATING" }[]) {
  const anchors = new Set(active.filter(member => member.membershipType === "ANCHOR").map(member => member.sellableUnitId));
  const rotating = new Set(active.filter(member => member.membershipType === "ROTATING").map(member => member.sellableUnitId));
  return candidates.filter(id => type === "ROTATING" ? !anchors.has(id) : anchors.size ? anchors.has(id) : !rotating.has(id));
}

/** Freeze once. A refresh cannot add, remove, replace or repin a member. New revisions require explicit input. */
export function freezeMarketPanel(members: FixedMarketMember[], frozenOn: string, previous?: FixedMarketPanel, targetSize = 40): FixedMarketPanel {
  if (previous) return fixedMarketPanelSchema.parse(previous);
  return fixedMarketPanelSchema.parse({ version: "christchurch-fixed-panel-v2", revision: 1, frozenOn, targetSize,
    members: [...members].sort((a, b) => a.propertyId.localeCompare(b.propertyId)) });
}

export function fixedPanelCoverage(panel: FixedMarketPanel, observed: FixedMarketMember[]) {
  panel = fixedMarketPanelSchema.parse(panel);
  const key = (member: FixedMarketMember) => JSON.stringify([member.propertyId, member.unitId, member.listingId, member.source, member.category, member.market, member.profileKey, member.termsKey, sampleStratumKey(member.labels), member.labels.geography?.boundaryVersion]);
  const actual = new Set(observed.map(key));
  const missing = panel.members.filter(member => !actual.has(key(member)));
  return { expected: panel.members.length, matched: panel.members.length - missing.length,
    missingPropertyIds: missing.map(member => member.propertyId), shortfall: panel.targetSize - panel.members.length };
}

/** Planning only: no network, database, source settings or queue dependencies. */
export function planChristchurchPilot(panelInput: FixedMarketPanel, proposedStart: string, stayNights: 1 | 2 = 1) {
  const panel = fixedMarketPanelSchema.parse(panelInput);
  const nights = z.union([z.literal(1), z.literal(2)]).parse(stayNights);
  addNzCalendarDays(proposedStart, 0);
  const lockedStayDates = [21, 27].map(offset => addNzCalendarDays(proposedStart, offset));
  const days = Array.from({ length: 28 }, (_, index) => {
    const observedOn = addNzCalendarDays(proposedStart, index);
    const dates = new Map<string, string[]>();
    const add = (date: string, reason: string) => dates.set(date, [...(dates.get(date) ?? []), reason]);
    for (const offset of [7, 14, 30, 60, 90]) add(addNzCalendarDays(observedOn, offset), `D+${offset}`);
    for (const weekday of [2, 6]) {
      const offset = (weekday - nzDayOfWeek(observedOn) + 7) % 7 || 7;
      add(addNzCalendarDays(observedOn, offset), weekday === 2 ? "NEXT_TUESDAY" : "NEXT_SATURDAY");
    }
    for (const date of lockedStayDates) if (date > observedOn) add(date, "LOCKED_STAY_TRACKING");
    const plannedRateQueries = panel.targetSize * dates.size;
    const retryReserve = Math.ceil(plannedRateQueries * 0.2);
    const discoveryReserve = index % 7 === 0 ? 20 : 0; // 10 separate discovery candidates, max 2 captures each.
    return { day: index + 1, observedOn, localWindow: "02:00–04:00 Pacific/Auckland", stayDates: [...dates].sort().map(([checkIn, reasons]) => ({ checkIn, checkOut: addNzCalendarDays(checkIn, nights), reasons })),
      plannedRateQueries, retryReserve, discoveryReserve, maximumCaptureExecutions: plannedRateQueries + retryReserve + discoveryReserve,
      pinnedMemberQueries: panel.members.length * dates.size };
  });
  const sum = (field: "plannedRateQueries" | "retryReserve" | "discoveryReserve" | "maximumCaptureExecutions") => days.reduce((total, day) => total + day[field], 0);
  return { version: "christchurch-four-week-plan-v1", status: "DRAFT_NOT_ENABLED", executionEnabled: false,
    proposedStart, proposedEnd: addNzCalendarDays(proposedStart, 27), panel,
    cohortId: `CHCH_${nights}_NIGHT`,
    query: { nights, adults: 2, children: 0, units: 1, currency: "NZD", publicRateContext: "PUBLIC_ANONYMOUS" },
    lockedStayDates, days,
    budget: { capacityProperties: panel.targetSize, dailyHardCeiling: 500, concurrency: 1, maximumAttemptsPerQuery: 2,
      plannedRateQueries: sum("plannedRateQueries"), retryReserve: sum("retryReserve"), discoveryReserve: sum("discoveryReserve"),
      fourWeekCaptureCeiling: sum("maximumCaptureExecutions"), preflightCaptureReserve: Math.ceil(panel.targetSize * 2 * 1.2),
      moneyBudgetNZD: null, actualCostPerCaptureNZD: null },
    activationBlockers: ["PRODUCTION_AUTHORIZATION_REQUIRED", "SCHEDULER_AND_BUDGET_APPROVAL_REQUIRED", "MEASURE_EXECUTION_TIME_AND_COST", "VERIFY_SOURCE_AND_EXACT_UNIT_CAPABILITY", "MANIFEST_REVIEW_REQUIRED",
      ...(panel.members.length < panel.targetSize ? [`FIXED_PANEL_SHORTFALL_${panel.targetSize - panel.members.length}`] : []),
      ...(days.some(day => day.maximumCaptureExecutions > 500) ? ["DAILY_CAPACITY_EXCEEDS_UNAPPROVED_BUDGET"] : [])],
  };
}
