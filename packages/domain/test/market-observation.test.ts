import { describe, expect, it } from "vitest";
import { addNzCalendarDays } from "../src/nz-time";
import { evaluateObservationAdmission, evaluateObservationQuote, planChristchurchObservations,
  type ObservationCandidate, type ObservationQuote, type ObservationRoster } from "../src/market-observation";

const candidate = (id = "a", nights: 1 | 2 = 2): ObservationCandidate => ({
  id, name: id, source: "fixture", sourceListingId: id, sourceUrl: `https://example.com/${id}`,
  market: "Christchurch City", nights, cadence: "THREE_PER_WEEK", accommodationType: "HOLIDAY_HOME",
  capacityGuests: 2, twoAdultStayEvidenceRef: null,
  unit: { kind: "ENTIRE_LISTING", key: id, description: "Entire 1BR Queen", reviewed: true },
  evidenceRefs: ["fixture:reviewed"], evidenceObservedOn: "2026-10-14", identityConflicts: [],
  geography: { locality: null, physicalUnitKey: null, precision: "SOURCE_SCOPED" },
  possibleDuplicateGroup: null, concentrationGroup: null, quoteGaps: [], executionGaps: [], followUpGaps: [],
  reserve: { status: "GAP", candidateIds: [], reason: "No independent reserve" },
});
const quote = (): ObservationQuote => ({ candidateId: "a", sourceUnitKey: "a", evidenceRef: "fixture:checkout",
  observedAt: "2026-10-15T00:00:00Z", checkIn: "2026-11-17", checkOut: "2026-11-19", nights: 2,
  adults: 2, children: 0, units: 1, currency: "NZD",
  collectionProfile: { id: "fixture-public", version: 1, ipRegion: "NZ", locale: "en-NZ", currency: "NZD",
    deviceType: "DESKTOP", loggedInState: "LOGGED_OUT", memberState: "NON_MEMBER", mobilePriceContext: "NONE",
    publicRateContext: "PUBLIC_ANONYMOUS", browserProfileVersion: "fixture-v1" },
  bookingMode: "INSTANT", outcome: "QUOTED", totalMinor: 37146, mandatoryFees: "COMPLETE",
  mealPlan: "No meals", cancellationPolicy: "Non refundable", paymentTerms: "Pay now", rateFence: "PUBLIC", qualityFlags: [],
});
const roster = (): ObservationRoster => ({ version: "christchurch-observation-roster-v1", preparedOn: "2026-10-15",
  evidenceAsOf: "2026-10-14", proposedStart: "2026-10-19",
  candidates: Array.from({ length: 7 }, (_, index) => ({ ...candidate(String(index), index % 2 ? 1 : 2),
    cadence: index < 4 ? "THREE_PER_WEEK" : "ONCE_PER_WEEK" })),
});

describe("staged observation admission", () => {
  it("allows source-scoped observation with missing locality, reserve and longitudinal history", () => {
    expect(evaluateObservationAdmission(candidate())).toMatchObject({ status: "ELIGIBLE_FOR_OBSERVATION", blockers: [], dispatchable: false });
    expect(evaluateObservationAdmission({ ...candidate(), identityConflicts: ["UNIT_CONFLICT"] }).status).toBe("HOLD");
    expect(evaluateObservationAdmission({ ...candidate(), unit: { ...candidate().unit, reviewed: false } }).status).toBe("HOLD");
  });
  it("accepts attributable two-adult quote support without inventing maximum occupancy", () => {
    expect(evaluateObservationAdmission({ ...candidate(), capacityGuests: null }).status).toBe("HOLD");
    expect(evaluateObservationAdmission({ ...candidate(), capacityGuests: null, twoAdultStayEvidenceRef: "fixture:two-adult-stay" }).status).toBe("ELIGIBLE_FOR_OBSERVATION");
    expect(evaluateObservationAdmission({ ...candidate(), capacityGuests: 1, twoAdultStayEvidenceRef: "fixture:conflict" }).status).toBe("HOLD");
  });
  it("retains fee/contract conflicts as raw observations but excludes their numeric comparison", () => {
    for (const patch of [{ mandatoryFees: "UNKNOWN" as const }, { qualityFlags: ["CANCELLATION_FEE_CONFLICT"] },
      { collectionProfile: null }, { collectionProfile: { ...quote().collectionProfile, loggedInState: "LOGGED_IN" } },
      { collectionProfile: { id: "incomplete-context" } },
      { rateFence: "MEMBER" }, { paymentTerms: null }, { bookingMode: "UNKNOWN" as const }]) {
      const input = { ...quote(), ...patch }, result = evaluateObservationQuote(candidate(), input);
      expect(result).toMatchObject({ status: "RAW_ONLY", comparisonKey: null, totalMinor: null });
      expect(result.raw).toEqual(input);
      expect(evaluateObservationAdmission(candidate()).status).toBe("ELIGIBLE_FOR_OBSERVATION");
    }
  });
  it("cannot compare another room, stay length or unsupported query", () => {
    for (const patch of [{ sourceUnitKey: "other-room" }, { adults: 3 }, { currency: "USD" },
      { candidateId: "other-property" }, { units: 2 }, { children: 1 }])
      expect(evaluateObservationQuote(candidate(), { ...quote(), ...patch }).comparisonKey).toBeNull();
    expect(evaluateObservationQuote(candidate("a", 1), quote()).comparisonKey).toBeNull();
    expect(() => evaluateObservationQuote(candidate(), { ...quote(), checkOut: "2026-11-18" })).toThrow();
  });
  it("keeps two-night actual totals and booking modes separate without multiplying cleaning charges", () => {
    const two = evaluateObservationQuote(candidate(), quote());
    expect(two).toMatchObject({ status: "COMPARABLE", totalMinor: 37146, nightlyEquivalentMinor: 18573 });
    const one = evaluateObservationQuote(candidate("a", 1), { ...quote(), nights: 1, checkOut: "2026-11-18" });
    const request = evaluateObservationQuote(candidate(), { ...quote(), bookingMode: "REQUEST_TO_BOOK" });
    expect(new Set([one.comparisonKey, two.comparisonKey, request.comparisonKey]).size).toBe(3);
    expect(evaluateObservationQuote(candidate(), { ...quote(), outcome: "UNAVAILABLE", totalMinor: null }).status).toBe("RAW_ONLY");
    expect(evaluateObservationQuote(candidate(), { ...quote(), observedAt: "2026-10-20T00:00:00Z" }).comparisonKey).toBe(two.comparisonKey);
  });
});

describe("disabled four-week mixed-duration plan", () => {
  it("budgets 120 quote checks, explicit details and a bounded retry pool", () => {
    const plan = planChristchurchObservations(roster());
    expect(plan).toMatchObject({ executionEnabled: false, dispatchable: false, proposedEnd: "2026-11-15",
      lockedStayDates: ["2026-11-17", "2026-11-21"],
      stageCounts: { observationCandidates: 7, observationEligible: 7, comparableQuotesAssessed: 0, readyToSubmitJobs: 0 },
      budget: { plannedRateQueries: 120, initialDetailAndCapabilityReserve: 14, weeklyIdentityReserve: 28,
        retryReserve: 33, maximumCaptureExecutions: 195, authorizedExecutions: 0 } });
    for (const day of plan.days) for (const q of day.queries) {
      expect(q.checkIn > plan.proposedEnd).toBe(true);
      expect(q.checkOut).toBe(addNzCalendarDays(q.checkIn, q.nights));
      expect(q.cohortId).toBe(`CHCH_${q.nights}_NIGHT`);
    }
  });
  it("rebases across NZ daylight saving and rejects bad dates or unsupported stays", () => {
    const plan = planChristchurchObservations({ ...roster(), proposedStart: "2027-03-15" });
    expect(plan.proposedEnd).toBe("2027-04-11");
    expect(plan.lockedStayDates).toEqual(["2027-04-13", "2027-04-17"]);
    expect(() => planChristchurchObservations({ ...roster(), proposedStart: "2026-02-30" })).toThrow();
    expect(() => planChristchurchObservations({ ...roster(), proposedStart: "2026-10-14" })).toThrow();
    expect(() => planChristchurchObservations({ ...roster(), candidates: [{ ...candidate(), nights: 3 as 2 }] })).toThrow();
  });
  it("rejects cross-platform duplicate/possible-alias seats while preserving building concentration", () => {
    for (const patch of [{ possibleDuplicateGroup: "possible-same-home" },
      { geography: { locality: "Addington", precision: "PUBLIC_ADDRESS_AND_LOCALITY" as const, physicalUnitKey: "same-home" } }]) {
      expect(() => planChristchurchObservations({ ...roster(), candidates: [{ ...candidate("a"), ...patch }, { ...candidate("b"), ...patch }] })).toThrow();
    }
    const plan = planChristchurchObservations({ ...roster(), candidates: ["unit7", "unit18"].map(id => ({ ...candidate(id), concentrationGroup: "same-building" })) });
    expect(plan.stageCounts.observationEligible).toBe(2);
    expect(plan.stageCounts.approvedIndependentReserves).toBe(0);
  });
  it("reports held candidates without silently planning or replacing them", () => {
    const input = roster(); input.candidates[0].identityConflicts = ["AMBIGUOUS_UNIT"];
    const plan = planChristchurchObservations(input);
    expect(plan.stageCounts.observationHolds).toBe(1);
    expect(plan.days.flatMap(day => day.queries).some(q => q.candidateId === "0")).toBe(false);
    expect(plan.budget.plannedRateQueries).toBe(96);
  });
});
