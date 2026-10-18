import { z } from "zod";
import { addNzCalendarDays, nzDayOfWeek } from "./nz-time";
import { marketCollectionProfileKey, normalizeRateTerms } from "./rate-terms";

const text = z.string().trim().min(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { addNzCalendarDays(value, 0); return true; } catch { return false; }
}, "Invalid NZ calendar date");
export const observationNightsSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const observationCandidateSchema = z.object({
  id: text, name: text, source: text, sourceListingId: text, sourceUrl: z.string().url(),
  market: z.literal("Christchurch City"), nights: observationNightsSchema,
  cadence: z.enum(["THREE_PER_WEEK", "ONCE_PER_WEEK"]),
  accommodationType: text, capacityGuests: z.number().int().positive().nullable(),
  twoAdultStayEvidenceRef: text.nullable(),
  unit: z.object({ kind: z.enum(["SOURCE_ROOM_ID", "ROOM_SIGNATURE", "ENTIRE_LISTING"]),
    key: text, description: text, reviewed: z.boolean() }).strict(),
  evidenceRefs: z.array(text).min(1), evidenceObservedOn: date,
  identityConflicts: z.array(text),
  geography: z.object({ locality: text.nullable(), physicalUnitKey: text.nullable(),
    precision: z.enum(["SOURCE_SCOPED", "PUBLIC_ADDRESS_AND_LOCALITY"]) }).strict(),
  possibleDuplicateGroup: text.nullable(), concentrationGroup: text.nullable(),
  quoteGaps: z.array(text), executionGaps: z.array(text), followUpGaps: z.array(text),
  reserve: z.object({ status: z.enum(["GAP", "RESEARCH_ONLY"]), candidateIds: z.array(text), reason: text }).strict(),
}).strict();
export type ObservationCandidate = z.infer<typeof observationCandidateSchema>;

/** Observation approval is neither comparable-price approval nor permission to execute. */
export function evaluateObservationAdmission(input: ObservationCandidate) {
  const candidate = observationCandidateSchema.parse(input);
  const blockers = [
    ...(!candidate.unit.reviewed ? ["REPEATABLE_UNIT_NOT_REVIEWED"] : []),
    // A selected two-adult quote proves this query is supported, not the maximum physical capacity.
    ...((candidate.capacityGuests !== null && candidate.capacityGuests < 2)
      || (candidate.capacityGuests === null && !candidate.twoAdultStayEvidenceRef) ? ["TWO_ADULT_CAPACITY_UNVERIFIED"] : []),
    ...candidate.identityConflicts,
  ];
  return { status: blockers.length ? "HOLD" as const : "ELIGIBLE_FOR_OBSERVATION" as const,
    blockers, identityScope: candidate.geography.precision,
    formalPanelContract: "christchurch-fixed-panel-v2", executionEnabled: false as const,
    dispatchable: false as const };
}

export const observationQuoteSchema = z.object({
  candidateId: text, sourceUnitKey: text, evidenceRef: text, observedAt: z.string().datetime({ offset: true }),
  checkIn: date, checkOut: date, nights: observationNightsSchema,
  adults: z.number().int().positive(), children: z.number().int().nonnegative(), units: z.number().int().positive(),
  currency: text, collectionProfile: z.record(z.unknown()).nullable(),
  bookingMode: z.enum(["INSTANT", "REQUEST_TO_BOOK", "UNKNOWN"]),
  outcome: z.enum(["QUOTED", "MEMBER_REFERENCE", "UNAVAILABLE", "MIN_STAY_RESTRICTION", "SOURCE_FAILURE", "IDENTITY_CHANGED"]),
  totalMinor: z.number().int().positive().safe().nullable(),
  mandatoryFees: z.enum(["COMPLETE", "UNKNOWN", "CONFLICT"]),
  mealPlan: text.nullable(), cancellationPolicy: text.nullable(), paymentTerms: text.nullable(),
  rateFence: text.nullable(), qualityFlags: z.array(text),
}).strict().refine(value => addNzCalendarDays(value.checkIn, value.nights) === value.checkOut,
  "Checkout must match the actual stay length");
export type ObservationQuote = z.infer<typeof observationQuoteSchema>;

/** Retain every raw outcome. Only matched, all-in, attributable quotes get a comparison key. */
export function evaluateObservationQuote(candidateInput: ObservationCandidate, quoteInput: ObservationQuote) {
  const candidate = observationCandidateSchema.parse(candidateInput);
  const quote = observationQuoteSchema.parse(quoteInput);
  const admission = evaluateObservationAdmission(candidate);
  const terms = normalizeRateTerms(quote);
  const profileKey = quote.collectionProfile ? marketCollectionProfileKey(quote.collectionProfile) : null;
  const blockers = [...admission.blockers, ...terms.blockers,
    ...(quote.candidateId !== candidate.id || quote.sourceUnitKey !== candidate.unit.key ? ["IDENTITY_MISMATCH"] : []),
    ...(quote.nights !== candidate.nights || quote.adults !== 2 || quote.children !== 0 || quote.units !== 1 || quote.currency !== "NZD" ? ["QUERY_MISMATCH"] : []),
    ...(quote.outcome !== "QUOTED" || quote.totalMinor === null ? ["NO_QUOTE"] : []),
    ...(quote.mandatoryFees !== "COMPLETE" ? ["MANDATORY_FEES_UNRESOLVED"] : []),
    ...(!profileKey ? ["PUBLIC_PROFILE_UNKNOWN_OR_INELIGIBLE"] : []),
    ...(quote.bookingMode === "UNKNOWN" ? ["BOOKING_MODE_UNKNOWN"] : []),
    ...quote.qualityFlags.filter(flag => /CONFLICT|MISMATCH|UNVERIFIED|UNRESOLVED|UNKNOWN|PARTIAL|NOT_CAPTURED|UNCLEAR|PROMOTION/i.test(flag)),
  ];
  const comparable = blockers.length === 0;
  return { status: comparable ? "COMPARABLE" as const : "RAW_ONLY" as const,
    blockers: [...new Set(blockers)], raw: quote, normalizedTerms: terms, profileKey,
    // Stay dates and request/instant mode stay separate, as do one- and two-night packages.
    comparisonKey: comparable ? JSON.stringify(["observation-comparison-v1", candidate.source,
      candidate.sourceListingId, candidate.unit.key, quote.checkIn, quote.checkOut, quote.nights,
      quote.adults, quote.children, quote.units, quote.currency, profileKey, quote.bookingMode, terms.comparisonKey]) : null,
    totalMinor: comparable ? quote.totalMinor : null,
    nightlyEquivalentMinor: comparable ? quote.totalMinor! / quote.nights : null,
    nightlyEquivalentMeaning: "DESCRIPTIVE_WITHIN_SAME_STAY_LENGTH_ONLY",
  };
}

export const observationRosterSchema = z.object({
  version: z.literal("christchurch-observation-roster-v1"), preparedOn: date,
  evidenceAsOf: date, proposedStart: date, candidates: z.array(observationCandidateSchema).min(1)
    .refine(members => members.every(member => member.nights <= 2), "Legacy four-week planner supports one/two-night stays only"),
}).strict().superRefine((roster, context) => {
  for (const keys of [roster.candidates.map(c => c.id), roster.candidates.map(c => `${c.source}:${c.sourceListingId}`),
    roster.candidates.flatMap(c => c.geography.physicalUnitKey ? [c.geography.physicalUnitKey] : []),
    roster.candidates.flatMap(c => c.possibleDuplicateGroup ? [c.possibleDuplicateGroup] : [])]) {
    if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "Duplicate or unresolved alias cannot occupy two observation seats" });
  }
  if (roster.evidenceAsOf > roster.preparedOn || roster.proposedStart < roster.preparedOn)
    context.addIssue({ code: "custom", message: "Evidence cannot be future-dated; start must be rebased after preparation" });
  if (roster.candidates.some(c => c.evidenceObservedOn > roster.evidenceAsOf))
    context.addIssue({ code: "custom", message: "Candidate evidence exceeds roster evidence date" });
});
export type ObservationRoster = z.infer<typeof observationRosterSchema>;

/** Pure plan only: no DB, queue, transport, live profile or source-state mutation. */
export function planChristchurchObservations(input: ObservationRoster) {
  const roster = observationRosterSchema.parse(input);
  const end = addNzCalendarDays(roster.proposedStart, 27);
  // Next Tuesday and Saturday AFTER the observation period, so both anchors survive all four weeks.
  const lockedStayDates = [2, 6].map(weekday => addNzCalendarDays(end, (weekday - nzDayOfWeek(end) + 7) % 7 || 7));
  const admissions = roster.candidates.map(candidate => ({ candidate, observation: evaluateObservationAdmission(candidate),
    quoteComparison: { status: "NOT_ASSESSED", gaps: candidate.quoteGaps },
    formalPanel: { status: "NOT_SUBMITTED", contract: "christchurch-fixed-panel-v2",
      note: "Requires separate reviewed canonical identity, geographic labels and terms; observation approval does not freeze a panel." },
    execution: { status: "NOT_AUTHORIZED", executionEnabled: false, dispatchable: false, gaps: candidate.executionGaps },
  }));
  const admitted = admissions.filter(row => row.observation.status === "ELIGIBLE_FOR_OBSERVATION");
  const days = Array.from({ length: 28 }, (_, index) => {
    const observedOn = addNzCalendarDays(roster.proposedStart, index);
    const queries = admitted.flatMap(({ candidate }) => {
      const due = candidate.cadence === "THREE_PER_WEEK" ? [0, 2, 4].includes(index % 7) : index % 7 === 0;
      return due ? lockedStayDates.map(checkIn => ({ candidateId: candidate.id, source: candidate.source,
        sourceListingId: candidate.sourceListingId, unit: candidate.unit,
        cohortId: `CHCH_${candidate.nights}_NIGHT`, checkIn, checkOut: addNzCalendarDays(checkIn, candidate.nights),
        nights: candidate.nights, adults: 2, children: 0, units: 1, currency: "NZD", access: "PUBLIC_ANONYMOUS" })) : [];
    });
    return { day: index + 1, observedOn, plannedRateQueries: queries.length, queries };
  });
  const plannedRateQueries = days.reduce((sum, day) => sum + day.plannedRateQueries, 0);
  const initialDetailAndCapabilityReserve = admitted.length * 2;
  const weeklyIdentityReserve = admitted.length * 4;
  const base = plannedRateQueries + initialDetailAndCapabilityReserve + weeklyIdentityReserve;
  const retryReserve = Math.ceil(base * 0.2);
  const sourceBudgets = [...new Set(admitted.map(row => row.candidate.source))].sort().map(source => {
    const count = admitted.filter(row => row.candidate.source === source).length;
    return { source, candidates: count, plannedRateQueries: days.reduce((sum, day) => sum + day.queries.filter(q => q.source === source).length, 0),
      initialDetailAndCapabilityReserve: count * 2, weeklyIdentityReserve: count * 4 };
  });
  return { version: "christchurch-observation-plan-v1", status: "DRAFT_NOT_ENABLED", roster,
    proposedStart: roster.proposedStart, proposedEnd: end, lockedStayDates, admissions, days,
    budget: { plannedRateQueries, initialDetailAndCapabilityReserve, weeklyIdentityReserve, retryReserve,
      maximumCaptureExecutions: base + retryReserve, maximumAttemptsPerQuery: 2, concurrency: 1,
      dailyHardCeiling: admitted.length * 6, sourceBudgets, retryPoolSharedAcrossSources: true,
      moneyBudgetNZD: null, actualCostPerCaptureNZD: null, authorizedExecutions: 0 },
    stageCounts: { observationCandidates: admissions.length, observationEligible: admitted.length,
      observationHolds: admissions.length - admitted.length, comparableQuotesAssessed: 0,
      formalPanelMembers: 0, approvedIndependentReserves: 0, readyToSubmitJobs: 0 },
    executionEnabled: false, dispatchable: false,
    activationBlockers: ["EXPLICIT_COLLECTION_AUTHORIZATION_REQUIRED", "REFRESH_IDENTITY_AND_ANCHOR_PREFLIGHT",
      "VERIFY_ARGUS_EXACT_UNIT_AND_ONE_TWO_NIGHT_CAPABILITY", "PIN_IMMUTABLE_PUBLIC_PROFILE",
      "REVIEW_SOURCE_LIMITS_AND_MEASURE_COST", "EXECUTOR_WIRING_AND_LOCAL_ACCEPTANCE_REQUIRED",
      ...admitted.flatMap(row => row.candidate.executionGaps.map(gap => `${row.candidate.id}: ${gap}`))],
    stopConditions: ["LOGIN_OR_CHALLENGE", "RATE_LIMIT", "IDENTITY_CHANGED", "BUDGET_EXHAUSTED"],
    missingPricePolicy: "KEEP_SEAT_AND_DATE; CLASSIFY_UNAVAILABLE_RESTRICTION_FAILURE; NEVER_AUTO_REPLACE",
    publicationStatus: "SAMPLE_OBSERVATION_ONLY_NOT_REGIONAL_INDEX",
  };
}
