import { z } from "zod";
import { addNzCalendarDays, nzDateKey } from "./nz-time";
import { observationQuoteSchema } from "./market-observation";

export const SAMPLE_QUOTE_TRENDS_VERSION = "sample-quote-trends-v1";
export type SampleQuoteBasis = "PUBLIC_TOTAL" | "MEMBER_REFERENCE";
export type SampleTrendMember = {
  id: string; name: string; source: string; sourceListingId: string; sourceUrl: string;
  accommodationType: string; locality: string | null; nights: 1 | 2; executionHash: string;
};
export type SampleTrendRun = {
  id: string; memberId: string; manifestHash: string; checkIn: string; unitExternalId: string | null;
  status: string; finishedAt: string; delivered: boolean; evaluated: unknown;
  rates: unknown; executor: string | null; connectorId: string | null; connectorVersion: string | null;
};
export const sampleTrendFilterSchema = z.object({
  from: z.string().date(), to: z.string().date(),
  basis: z.enum(["ALL", "PUBLIC_TOTAL", "MEMBER_REFERENCE"]).default("PUBLIC_TOTAL"),
  nights: z.enum(["ALL", "1", "2"]).default("ALL"),
  stay: z.union([z.literal("ALL"), z.string().date()]).default("ALL"),
  category: z.string().max(80).default("ALL"),
  lead: z.enum(["ALL", "0-30", "31-60", "61-90", "91+"]).default("ALL"),
}).refine(f => f.to >= f.from && daysBetween(f.from, f.to) <= 89, "Observation range must be at most 90 NZ dates");
export type SampleTrendFilter = z.infer<typeof sampleTrendFilterSchema>;

const referenceSchema = z.object({ kind: z.literal("MEMBER_ONLY"), amountMinor: z.number().int().positive(),
  ratePlanExternalId: z.string().min(1), sourceText: z.string().min(1).max(250) });
const offerSchema = z.object({ sourceListingId: z.string(), unitExternalId: z.string(), ratePlanExternalId: z.string().min(1).nullish(),
  checkIn: z.string().date(), checkOut: z.string().date(), adults: z.number().int(), children: z.number().int(), units: z.number().int(),
  currency: z.literal("NZD"), totalPriceMinor: z.number().int().positive().nullable(),
  totalIncludesMandatoryFees: z.boolean().nullish(), availabilityStatus: z.string(),
  mealPlan: z.string(), cancellationPolicy: z.string(), paymentTerms: z.string(), rateFence: z.string(),
  fieldSources: z.record(z.string()).default({}), referencePrices: z.array(referenceSchema.extend({ kind: z.enum(["ORIGINAL", "MEMBER_ONLY"]) })).nullish() });
type Observation = {
  member: SampleTrendMember; runId: string; observedAt: string; observedOn: string; cycle: string;
  checkIn: string; checkOut: string; leadDays: number; basis: SampleQuoteBasis; amountMinor: number;
  offerKey: string; terms: string; sourceContext: string;
};
export type SampleTrendPoint = {
  cycle: string; observations: number; sampleCount: number; medianTotalMinor: number;
  leadDaysMin: number; leadDaysMax: number; pairedSamples: number; changePct: number | null;
};
export type SampleTrendSeries = {
  key: string; basis: SampleQuoteBasis; nights: number; category: string; checkIn: string; checkOut: string;
  points: SampleTrendPoint[];
};
export type SampleQuoteTrendSummary = {
  version: string; asOf: string; filter: SampleTrendFilter; startsOn: string;
  configuredMembers: number; observedMembers: number; pricedMembers: number; includedMembers: number;
  completedWindows: number; noPriceWindows: number; failedWindows: number; rejectedOffers: number;
  series: SampleTrendSeries[]; stayDates: string[]; categories: string[];
  gaps: { memberId: string; name: string; reasons: string[] }[];
  recentQuotes: { name: string; source: string; sourceUrl: string; basis: SampleQuoteBasis; nights: number;
    checkIn: string; checkOut: string; observedOn: string; leadDays: number; amountMinor: number; included: boolean }[];
  complete: boolean;
};

const text = (v: string) => v.normalize("NFKC").replace(/\s+/gu, " ").trim();
const token = (v: string) => text(v).toUpperCase().replace(/[_–—-]+/gu, " ");
export function daysBetween(from: string, to: string) { return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000); }
export function sampleQuoteCycle(startsOn: string, observedOn: string) {
  return addNzCalendarDays(startsOn, Math.floor(daysBetween(startsOn, observedOn) / 7) * 7);
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b), half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}
function knownTerms(raw: z.infer<typeof observationQuoteSchema>) {
  const meal = token(raw.mealPlan ?? ""), pay = token(raw.paymentTerms ?? ""), cancel = text(raw.cancellationPolicy ?? "");
  const blockers: string[] = [];
  if (!["ROOM ONLY", "NO MEALS", "NO MEALS INCLUDED", "BREAKFAST INCLUDED", "NOT APPLICABLE"].includes(meal)) blockers.push("MEAL_TERMS_MISSING");
  if (!/^(?:PAY ONLINE|PAY NOW|PREPAYMENT(?: REQUIRED)?|PAY AT (?:THE )?PROPERTY|NO PREPAYMENT NEEDED|RESERVE NOW, PAY LATER|PAY NOTHING UNTIL [A-Z]+ \d{1,2}, \d{4})$/u.test(pay)) blockers.push("PAYMENT_TERMS_MISSING");
  if (!/^(?:NON[- ]REFUNDABLE\.?|FREE CANCELLATION BEFORE [A-Za-z]+ \d{1,2}, \d{4}\.?)$/iu.test(cancel)) blockers.push("CANCELLATION_TERMS_MISSING");
  return { blockers, signature: JSON.stringify([meal, token(cancel), pay]) };
}
function memberLabelIdentity(value: string, amountMinor: number) {
  const match = /^Members-only price(?: NZD ([\d,]+)(?:\.(\d{1,2}))?)?$/iu.exec(text(value));
  if (!match) return null;
  if (match[1] && Number(match[1].replaceAll(",", "")) * 100 + Number((match[2] ?? "").padEnd(2, "0")) !== amountMinor) return null;
  // The displayed amount is the measure, never part of the matching identity.
  return "MEMBERS_ONLY_PRICE";
}
function leadMatches(value: number, filter: SampleTrendFilter["lead"]) {
  return filter === "ALL" || (filter === "0-30" && value >= 0 && value <= 30)
    || (filter === "31-60" && value >= 31 && value <= 60) || (filter === "61-90" && value >= 61 && value <= 90)
    || (filter === "91+" && value >= 91);
}
function observationTime(run: SampleTrendRun) {
  const first = Array.isArray(run.evaluated) ? run.evaluated[0]?.raw?.observedAt : undefined;
  return typeof first === "string" && Number.isFinite(Date.parse(first)) ? first : run.finishedAt;
}

/** A descriptive source-quote read model. Never upgrades raw observations or writes a price index. */
export function buildSampleQuoteTrends(input: { members: SampleTrendMember[]; runs: SampleTrendRun[];
  startsOn: string; asOf: string; filter: SampleTrendFilter; complete?: boolean }): SampleQuoteTrendSummary {
  const filter = sampleTrendFilterSchema.parse(input.filter), members = new Map(input.members.map(m => [m.id, m]));
  const gaps = new Map<string, Set<string>>(), observed = new Set<string>(), priced = new Set<string>();
  const addGap = (id: string, reason: string) => { if (!gaps.has(id)) gaps.set(id, new Set()); gaps.get(id)!.add(reason); };
  const matches = (m: SampleTrendMember) => (filter.nights === "ALL" || String(m.nights) === filter.nights)
    && (filter.category === "ALL" || m.accommodationType === filter.category);
  const latest = new Map<string, SampleTrendRun>();
  for (const run of input.runs) {
    const m = members.get(run.memberId);
    if (!m || !matches(m) || run.manifestHash !== m.executionHash || !["SUCCEEDED", "FAILED"].includes(run.status)
      || !Number.isFinite(Date.parse(run.finishedAt)) || !/^\d{4}-\d{2}-\d{2}$/u.test(run.checkIn)) continue;
    const day = nzDateKey(new Date(observationTime(run)));
    if (day < input.startsOn || day < filter.from || day > filter.to || (filter.stay !== "ALL" && run.checkIn !== filter.stay)) continue;
    if (!leadMatches(daysBetween(day, run.checkIn), filter.lead)) continue;
    const key = JSON.stringify([m.id, run.checkIn, sampleQuoteCycle(input.startsOn, day)]), prior = latest.get(key);
    // Latest completed window wins, including unavailable/error outcomes. No carry-forward of an earlier quote.
    if (!prior || Date.parse(observationTime(run)) > Date.parse(observationTime(prior)) || (Date.parse(observationTime(run)) === Date.parse(observationTime(prior)) && run.id > prior.id)) latest.set(key, run);
  }
  const included: Observation[] = [], recentQuotes: SampleQuoteTrendSummary["recentQuotes"] = [];
  let noPriceWindows = 0, failedWindows = 0, rejectedOffers = 0;
  for (const run of latest.values()) {
    const m = members.get(run.memberId)!; observed.add(m.id);
    if (run.status !== "SUCCEEDED" || !run.delivered) { failedWindows++; addGap(m.id, "DELIVERY_OR_CAPTURE_FAILED"); continue; }
    if (!Array.isArray(run.evaluated)) { addGap(m.id, "QUOTE_EVIDENCE_MISSING"); continue; }
    const offers = Array.isArray(run.rates) ? run.rates.flatMap(r => { const parsed = offerSchema.safeParse(r); return parsed.success ? [parsed.data] : []; }) : [];
    const observedOn = nzDateKey(new Date(observationTime(run))), cycle = sampleQuoteCycle(input.startsOn, observedOn);
    const usableContext = run.executor === "self_hosted" && run.connectorId === `${m.source}-public` && !!run.connectorVersion;
    let windowHasPrice = false;
    for (const e of run.evaluated) {
      const parsed = observationQuoteSchema.safeParse((e as { raw?: unknown } | null)?.raw); if (!parsed.success) { rejectedOffers++; addGap(m.id, "QUOTE_EVIDENCE_MISSING"); continue; }
      const raw = parsed.data;
      if (raw.checkIn !== run.checkIn || raw.checkOut !== addNzCalendarDays(raw.checkIn, m.nights) || raw.nights !== m.nights
        || raw.candidateId !== m.id || raw.sourceUnitKey !== run.unitExternalId || raw.adults !== 2 || raw.children !== 0 || raw.units !== 1 || raw.currency !== "NZD") {
        rejectedOffers++; addGap(m.id, "QUERY_OR_UNIT_CONFLICT"); continue;
      }
      if (!["QUOTED", "MEMBER_REFERENCE"].includes(raw.outcome) || !raw.totalMinor) continue;
      const basis: SampleQuoteBasis = raw.outcome === "MEMBER_REFERENCE" ? "MEMBER_REFERENCE" : "PUBLIC_TOTAL";
      if (filter.basis !== "ALL" && filter.basis !== basis) continue;
      windowHasPrice = true; priced.add(m.id);
      const reasons: string[] = [];
      if (!usableContext) reasons.push("SOURCE_EXECUTION_CONTEXT_MISSING");
      if (raw.qualityFlags.some(f => /(?:IDENTITY|QUERY|OCCUPANCY|CURRENCY|PRICE|FEE|TERMS|POLICY).*CONFLICT|CONTEXT_DRIFT|AMOUNT_MISMATCH/iu.test(f))) reasons.push("SOURCE_CONFLICT");
      const matching = offers.filter(r => r.unitExternalId === raw.sourceUnitKey && r.checkIn === raw.checkIn && r.checkOut === raw.checkOut
        && r.adults === 2 && r.children === 0 && r.units === 1);
      let plan: string | null = null, terms = "";
      if (basis === "MEMBER_REFERENCE") {
        const reference = referenceSchema.safeParse((e as { referencePrice?: unknown }).referencePrice);
        if (!reference.success || reference.data.amountMinor !== raw.totalMinor || !memberLabelIdentity(reference.data.sourceText, reference.data.amountMinor)) reasons.push("MEMBER_PLAN_MISSING");
        else {
          const ref = reference.data;
          const sameRefs = matching.flatMap(r => r.referencePrices ?? []).filter(r => r.kind === "MEMBER_ONLY" && r.ratePlanExternalId === ref.ratePlanExternalId
            && r.amountMinor === ref.amountMinor && text(r.sourceText) === text(ref.sourceText));
          if (!sameRefs.length) reasons.push("MEMBER_PLAN_MISSING");
          if (new Set(matching.flatMap(r => r.referencePrices ?? []).filter(r => r.kind === "MEMBER_ONLY" && r.ratePlanExternalId === ref.ratePlanExternalId).map(r => r.amountMinor)).size > 1) reasons.push("SOURCE_CONFLICT");
          plan = ref.ratePlanExternalId; terms = JSON.stringify(["DISPLAYED_MEMBER_REFERENCE", memberLabelIdentity(ref.sourceText, ref.amountMinor)]);
        }
      } else {
        const sameTerms = matching.filter(r => token(r.mealPlan) === token(raw.mealPlan ?? "")
          && token(r.cancellationPolicy) === token(raw.cancellationPolicy ?? "") && token(r.paymentTerms) === token(raw.paymentTerms ?? "")
          && r.rateFence === raw.rateFence && r.availabilityStatus === "AVAILABLE");
        const same = sameTerms.filter(r => r.totalPriceMinor === raw.totalMinor);
        const plans = [...new Set(same.flatMap(r => r.ratePlanExternalId ? [r.ratePlanExternalId] : []))];
        const known = knownTerms(raw); terms = known.signature; reasons.push(...known.blockers);
        if (plans.length === 1 && same.every(r => r.ratePlanExternalId === plans[0])) {
          plan = JSON.stringify(["SOURCE_PLAN", plans[0]]);
          if (sameTerms.some(r => r.ratePlanExternalId === plans[0] && r.totalPriceMinor !== raw.totalMinor)) reasons.push("SOURCE_CONFLICT");
        } else if (plans.length === 0 && same.length && !known.blockers.length && sameTerms.every(r => !r.ratePlanExternalId)
          && new Set(sameTerms.map(r => r.totalPriceMinor)).size === 1) {
          // An exact visible condition set is a selector, never a fabricated provider plan ID.
          plan = JSON.stringify(["UNIQUE_VISIBLE_TERMS", known.signature]);
        } else reasons.push("EXACT_RATE_PLAN_MISSING");
        if (raw.mandatoryFees !== "COMPLETE" || !same.some(r => r.totalIncludesMandatoryFees === true && r.fieldSources.totalIncludesMandatoryFees)) reasons.push("TOTAL_FEES_UNVERIFIED");
        if (!["PUBLIC", "PARTNER_OFFER"].includes(raw.rateFence ?? "")) reasons.push("PRICE_FENCE_UNSUPPORTED");
      }
      const valid = !reasons.length && plan !== null;
      recentQuotes.push({ name: m.name, source: m.source, sourceUrl: m.sourceUrl, basis, nights: m.nights, checkIn: raw.checkIn,
        checkOut: raw.checkOut, observedOn, leadDays: daysBetween(observedOn, raw.checkIn), amountMinor: raw.totalMinor, included: valid });
      if (!valid) { rejectedOffers++; for (const reason of reasons) addGap(m.id, reason); continue; }
      included.push({ member: m, runId: run.id, observedAt: raw.observedAt, observedOn, cycle, checkIn: raw.checkIn, checkOut: raw.checkOut,
        leadDays: daysBetween(observedOn, raw.checkIn), basis, amountMinor: raw.totalMinor, terms,
        sourceContext: JSON.stringify([run.executor, run.connectorId, run.connectorVersion]),
        offerKey: JSON.stringify([m.source, m.sourceListingId, raw.sourceUnitKey, plan, raw.rateFence, terms, raw.nights, raw.adults, raw.children, raw.units, raw.currency]) });
    }
    if (!windowHasPrice && (filter.basis === "ALL" || run.evaluated.every(e => !["QUOTED", "MEMBER_REFERENCE"].includes(e?.raw?.outcome)))) {
      noPriceWindows++; addGap(m.id, "NO_PRICE_FOR_WINDOW");
    }
  }
  for (const m of input.members) if (matches(m) && !observed.has(m.id)) addGap(m.id, "NO_COMPLETED_WINDOW");
  const groups = new Map<string, Observation[]>();
  for (const row of included) {
    const key = JSON.stringify([row.basis, row.member.nights, row.member.accommodationType, row.checkIn, row.checkOut]);
    if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(row);
  }
  const series: SampleTrendSeries[] = [];
  for (const [key, rows] of groups) {
    const sample = rows[0], cycles = [...new Set(rows.map(r => r.cycle))].sort(), points: SampleTrendPoint[] = [];
    for (const cycle of cycles) {
      const current = rows.filter(r => r.cycle === cycle), prior = rows.filter(r => r.cycle === addNzCalendarDays(cycle, -7));
      const prices = new Map<string, number[]>(), changes = new Map<string, number[]>();
      // Multiple duplicated offers/runs never make a listing count twice.
      const unique = new Map(current.map(r => [JSON.stringify([r.member.id, r.offerKey, r.sourceContext]), r]));
      for (const row of unique.values()) {
        if (!prices.has(row.member.id)) prices.set(row.member.id, []); prices.get(row.member.id)!.push(row.amountMinor);
        const old = prior.find(p => p.member.id === row.member.id && p.offerKey === row.offerKey && p.sourceContext === row.sourceContext);
        if (!old) continue;
        if (!changes.has(row.member.id)) changes.set(row.member.id, []);
        changes.get(row.member.id)!.push((row.amountMinor / old.amountMinor - 1) * 100);
      }
      points.push({ cycle, observations: unique.size, sampleCount: prices.size,
        medianTotalMinor: median([...prices.values()].map(median)), leadDaysMin: Math.min(...current.map(r => r.leadDays)),
        leadDaysMax: Math.max(...current.map(r => r.leadDays)), pairedSamples: changes.size,
        changePct: input.complete === false || !changes.size ? null : median([...changes.values()].map(median)) });
    }
    series.push({ key, basis: sample.basis, nights: sample.member.nights, category: sample.member.accommodationType,
      checkIn: sample.checkIn, checkOut: sample.checkOut, points });
  }
  return { version: SAMPLE_QUOTE_TRENDS_VERSION, asOf: input.asOf, filter, startsOn: input.startsOn,
    configuredMembers: input.members.length, observedMembers: observed.size, pricedMembers: priced.size,
    includedMembers: new Set(included.map(r => r.member.id)).size, completedWindows: latest.size, noPriceWindows, failedWindows, rejectedOffers,
    series: series.sort((a, b) => a.key.localeCompare(b.key)),
    stayDates: [...new Set(input.runs.map(r => r.checkIn).filter(d => /^\d{4}-\d{2}-\d{2}$/u.test(d)))].sort(),
    categories: [...new Set(input.members.map(m => m.accommodationType))].sort(),
    gaps: [...gaps].map(([memberId, reasons]) => ({ memberId, name: members.get(memberId)!.name, reasons: [...reasons].sort() })),
    recentQuotes: recentQuotes.sort((a, b) => b.observedOn.localeCompare(a.observedOn) || a.name.localeCompare(b.name)), complete: input.complete !== false };
}
