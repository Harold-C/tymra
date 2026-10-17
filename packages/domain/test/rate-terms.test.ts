import { describe, expect, it } from "vitest";
import { marketCollectionProfileKey, normalizeRateTerms } from "../src/rate-terms";

const base = { mealPlan: "ROOM_ONLY", cancellationPolicy: "NON_REFUNDABLE", paymentTerms: "PAY_AT_PROPERTY", rateFence: "PUBLIC", checkIn: "2026-10-20" };
describe("versioned public rate terms", () => {
  it("captures immutable anonymous context and rejects absent or member contexts", () => {
    const profile = { id: "p", version: 1, ipRegion: "NZ", locale: "en-NZ", currency: "NZD", deviceType: "DESKTOP", loggedInState: "LOGGED_OUT", memberState: "NON_MEMBER", mobilePriceContext: "STANDARD", publicRateContext: "PUBLIC_ANONYMOUS", browserProfileVersion: "v1" };
    const key = marketCollectionProfileKey(profile);
    expect(key).not.toBeNull();
    expect(marketCollectionProfileKey({ ...profile, ipRegion: "AU" })).not.toBe(key);
    expect(marketCollectionProfileKey({ ...profile, memberState: "MEMBER" })).toBeNull();
    expect(marketCollectionProfileKey({ id: "p" })).toBeNull();
    profile.version = 2;
    expect(key).toContain(',1,'); expect(marketCollectionProfileKey(profile)).not.toBe(key);
  });
  it("unifies explicit aliases without overwriting source text", () => {
    const variant = normalizeRateTerms({ ...base, mealPlan: "No meals included", cancellationPolicy: "Non-refundable.", paymentTerms: "Pay at the property", rateFence: "PUBLIC_SIGNED_OUT" });
    expect(variant.comparisonKey).toBe(normalizeRateTerms(base).comparisonKey);
    expect(variant.raw.cancellationPolicy).toBe("Non-refundable.");
  });
  it.each(["UNKNOWN", "NO_MEAL_DISCLOSED", "No extras", "Breakfast available optional"])("does not infer absent meal terms: %s", mealPlan => {
    expect(normalizeRateTerms({ ...base, mealPlan }).comparisonKey).toBeNull();
  });
  it("keeps breakfast, prepayment and refundable products separate", () => {
    expect(normalizeRateTerms({ ...base, mealPlan: "breakfast included" }).comparisonKey).not.toBe(normalizeRateTerms(base).comparisonKey);
    expect(normalizeRateTerms({ ...base, paymentTerms: "Pay now" }).comparisonKey).not.toBe(normalizeRateTerms(base).comparisonKey);
    expect(normalizeRateTerms({ ...base, cancellationPolicy: "FREE_CANCELLATION" }).blockers).toContain("CANCELLATION_DEADLINE_UNKNOWN");
    expect(normalizeRateTerms({ ...base, cancellationPolicy: "free cancellationFree Cancellat" }).comparisonKey).toBeNull();
  });
  it("compares explicit cancellation deadlines relative to NZ stay date", () => {
    const a = normalizeRateTerms({ ...base, cancellationPolicy: "Free cancellation before 2026-10-18T00:00:00+13:00" });
    const b = normalizeRateTerms({ ...base, checkIn: "2026-10-21", cancellationPolicy: "Free cancellation before 2026-10-19T00:00:00+13:00" });
    expect(a.cancellationDeadlineHours).toBe(48); expect(a.comparisonKey).toBe(b.comparisonKey);
    expect(normalizeRateTerms({ ...base, cancellationPolicy: "Free cancellation before October 18, 2026" }).comparisonKey).toBeNull();
  });
  it("retains source quality exclusions and public-fence protection", () => {
    expect(normalizeRateTerms({ ...base, qualityFlags: ["UNIT_IDENTITY_PARTIAL"] }).comparisonKey).toBeNull();
    expect(normalizeRateTerms({ ...base, rateFence: "MEMBER_ONLY" }).comparisonKey).toBeNull();
    const partner = normalizeRateTerms({ ...base, rateFence: "PARTNER_OFFER" });
    expect(partner.comparisonKey).toBeNull();
    expect(partner.raw.rateFence).toBe("PARTNER_OFFER");
    expect(normalizeRateTerms({ ...base, paymentTerms: null }).comparisonKey).toBeNull();
  });
});
