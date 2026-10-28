import { describe, expect, it } from "vitest";
import { observationCandidateSchema } from "@tymra/domain";
import { evaluateCapturedObservation } from "../src/operations/observation-evaluation";

const candidate = observationCandidateSchema.parse({ id: "member-reference", name: "Reviewed studio", source: "BOOKING",
  sourceListingId: "100", sourceUrl: "https://www.booking.com/hotel/nz/reference-test.html", market: "Christchurch City",
  nights: 1, cadence: "ONCE_PER_WEEK", accommodationType: "MOTEL", capacityGuests: 2, twoAdultStayEvidenceRef: "identity-proof",
  unit: { kind: "SOURCE_ROOM_ID", key: "10001", description: "Reviewed studio", reviewed: true },
  evidenceRefs: ["identity-proof"], evidenceObservedOn: "2026-10-14", identityConflicts: [],
  geography: { locality: "Riccarton", physicalUnitKey: null, precision: "SOURCE_SCOPED" },
  possibleDuplicateGroup: null, concentrationGroup: null, quoteGaps: [], executionGaps: [], followUpGaps: [],
  reserve: { status: "GAP", candidateIds: [], reason: "No automatic replacement" } });
function fixture() {
  return { data_schema: "ota-public.collect_rates", schema_version: "1.0.0", provider: "booking", sourceListingId: "reference-test",
    observedAt: "2026-10-17T00:00:00.000Z", warnings: ["REFERENCE_PRICES_ONLY"], quality: "partial",
    rates: [{ sourceListingId: "reference-test", unitExternalId: "10001", checkIn: "2026-12-01", checkOut: "2026-12-02",
      currency: "NZD", adults: 2, children: 0, units: 1, basePriceMinor: null as number | null, mandatoryFeesMinor: null as number | null,
      taxesMinor: null as number | null, optionalFeesMinor: null as number | null, totalPriceMinor: null as number | null,
      availabilityStatus: "UNKNOWN", restrictionReason: "No anonymous public total verified", minimumStay: null,
      mealPlan: "UNKNOWN", cancellationPolicy: "UNKNOWN", paymentTerms: "UNKNOWN", rateFence: "REFERENCE_ONLY",
      sourceUrl: candidate.sourceUrl, collectedAt: "2026-10-17T00:00:00.000Z", fieldSources: {},
      qualityFlags: ["REFERENCE_PRICES_ONLY", "NO_PRICE_FOR_REQUESTED_CONTEXT"], referencePrices: [
        { kind: "ORIGINAL", amountMinor: 17200, ratePlanExternalId: "plan-a", sourceText: "Original price NZD 172" },
        { kind: "MEMBER_ONLY", amountMinor: 15480, ratePlanExternalId: "plan-a", sourceText: "Members-only price NZD 154.80" }] }] };
}
const evaluate = (data: unknown) => evaluateCapturedObservation(candidate, "10001", "2026-12-01", data, "wire-proof");
describe("visible member prices as separate observation references", () => {
  it("retains member precision and provenance, without promoting the original price or claiming public eligibility", () => {
    const data = fixture(), before = structuredClone(data), result = evaluate(data);
    expect(result).toHaveLength(1); expect(data).toEqual(before);
    expect(result[0]).toMatchObject({ status: "RAW_ONLY", comparisonKey: null, totalMinor: null, nightlyEquivalentMinor: null,
      raw: { outcome: "MEMBER_REFERENCE", totalMinor: 15480, rateFence: "MEMBER_ONLY", mandatoryFees: "UNKNOWN",
        cancellationPolicy: "UNKNOWN", paymentTerms: "UNKNOWN", collectionProfile: null, bookingMode: "UNKNOWN" } });
    expect(result[0].raw.qualityFlags).toEqual(expect.arrayContaining(["MEMBERSHIP_ELIGIBILITY_UNVERIFIED", "REFERENCE_AVAILABILITY_UNVERIFIED", "REFERENCE_OCCUPANCY_UNVERIFIED"]));
    expect(result[0]).toHaveProperty("referencePrice.sourceText", "Members-only price NZD 154.80");
    expect(result.some(r => r.raw.outcome === "QUOTED")).toBe(false);
  });
  it("preserves separate member values even when the source reuses a rate-plan ID", () => {
    const data = fixture(); data.rates[0].referencePrices.push({ kind: "MEMBER_ONLY", amountMinor: 16650,
      ratePlanExternalId: "plan-a", sourceText: "Members-only price NZD 166.50" });
    expect(evaluate(data).map(r => r.raw.totalMinor)).toEqual([15480, 16650]);
  });
  it("keeps a public quote and member reference separate without copying public fees or refundable terms", () => {
    const data = fixture(), rate = data.rates[0]; rate.availabilityStatus = "AVAILABLE"; rate.rateFence = "PUBLIC";
    rate.totalPriceMinor = 17200; rate.cancellationPolicy = "Free cancellation"; rate.paymentTerms = "Pay at property";
    const result = evaluate(data); expect(result.map(r => r.raw.outcome)).toEqual(["QUOTED", "MEMBER_REFERENCE"]);
    expect(result[0].raw.totalMinor).toBe(17200); expect(result[1].raw).toMatchObject({ totalMinor: 15480,
      mandatoryFees: "UNKNOWN", cancellationPolicy: "UNKNOWN", paymentTerms: "UNKNOWN" });
    data.rates.push(structuredClone(rate)); expect(evaluate(data).filter(r => r.raw.outcome === "MEMBER_REFERENCE")).toHaveLength(1);
  });
  it("does not turn an unavailable target, another date or a different unit into a valid member reference", () => {
    const data = fixture(); data.rates[0].availabilityStatus = "UNAVAILABLE";
    expect(evaluate(data).map(r => r.raw.outcome)).toEqual(["UNAVAILABLE"]);
    data.rates[0].availabilityStatus = "UNKNOWN"; data.rates[0].checkIn = "2026-12-05";
    expect(() => evaluate(data)).toThrow("STAY_CONTEXT_UNVERIFIED");
    data.rates[0].checkIn = "2026-12-01"; data.rates[0].unitExternalId = "10002";
    expect(() => evaluate(data)).toThrow("EXACT_UNIT_NOT_RETURNED");
  });
  it("records original-only Booking results as a price gap without inventing availability or an amount", () => {
    const original = fixture(); original.rates[0].referencePrices = original.rates[0].referencePrices.slice(0, 1);
    const before = structuredClone(original), result = evaluate(original);
    expect(original).toEqual(before);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ status: "RAW_ONLY", comparisonKey: null, totalMinor: null,
      nightlyEquivalentMinor: null, raw: { outcome: "PUBLIC_PRICE_UNVERIFIED", totalMinor: null,
        checkIn: "2026-12-01", checkOut: "2026-12-02", sourceUnitKey: "10001", rateFence: "REFERENCE_ONLY" } });
    expect(result[0].raw.qualityFlags).toContain("ORIGINAL_PRICE_ONLY");
    expect(result[0]).not.toHaveProperty("referencePrice");
    original.rates[0].referencePrices = [];
    expect(() => evaluate(original)).toThrow();
    original.rates[0].referencePrices = before.rates[0].referencePrices;
    original.rates[0].rateFence = "PUBLIC";
    expect(() => evaluate(original)).toThrow("AVAILABILITY_OUTCOME_UNCLASSIFIED");
  });
  it("rejects unlabelled, non-Booking and mismatched guest references", () => {
    const unlabelled = fixture(); unlabelled.rates[0].referencePrices[1].sourceText = "Unattributed price";
    expect(() => evaluate(unlabelled)).toThrow("AVAILABILITY_OUTCOME_UNCLASSIFIED");
    const wrongGuests = fixture(); wrongGuests.rates[0].adults = 1;
    expect(() => evaluate(wrongGuests)).toThrow("STAY_CONTEXT_UNVERIFIED");
    const other = { ...fixture(), provider: "expedia" };
    expect(() => evaluate(other)).toThrow("LISTING_IDENTITY_MISMATCH");
  });
  it("retains the actual two-night stay and still provides no normalized comparable amount", () => {
    const data = fixture(); data.rates[0].checkOut = "2026-12-03";
    const result = evaluateCapturedObservation({ ...candidate, nights: 2 }, "10001", "2026-12-01", data, "wire-proof");
    expect(result[0].raw).toMatchObject({ nights: 2, checkOut: "2026-12-03", totalMinor: 15480, outcome: "MEMBER_REFERENCE" });
    expect(result[0].nightlyEquivalentMinor).toBeNull();
  });
});
