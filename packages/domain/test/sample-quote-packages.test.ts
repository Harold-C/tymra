import { describe, expect, it } from "vitest";
import { bookingReferencePackages } from "../src/sample-quote-packages";

const context = { checkIn: "2026-12-01", checkOut: "2026-12-02", adults: 2 as const, children: 0 as const, units: 1 as const, currency: "NZD" as const };
const expected = { ...context, sourceUrl: "https://www.booking.com/hotel/nz/synthetic.html", unitExternalId: "1001" };
function row(suffix: string, amount: string, meal: string | null = null) {
  return { unitExternalId: "1001", ratePlanId: "2001", occupancy: 2, rateFence: "MEMBER_ONLY", availableUnits: 2,
    itemizedTotalPriceText: `NZD ${amount}`, sourceText: `#policyModal_1001_2001_2_${suffix}_0`,
    feeInclusionText: meal ? "breakfast included" : "Very good breakfast NZD 36", mealPlan: meal,
    cancellationPolicy: "Free cancellation before November 29, 2026", paymentTerms: "Pay nothing until November 27, 2026" };
}
function html(rows: unknown[], changes = {}) { return `<script type="application/json" id="argus-booking-page-snapshot">${JSON.stringify({
  schema: "argus.booking-public-page@1.0.0", kind: "detail", canonicalUrl: expected.sourceUrl, context, requested: context, rates: rows, ...changes })}</script>`; }
describe("retained Booking member package evidence", () => {
  it("separates repeated source plan IDs by their actual row identity and meals, preserving native precision", () => {
    const result = bookingReferencePackages(html([row("2", "308.70"), row("1", "366.30", "breakfast included"),
      { ...row("1", "337.50", "breakfast included"), occupancy: 1 }]), expected);
    expect(result.map(p => [p.amountMinor, p.mealPlan, p.selector])).toEqual([
      [30870, "BREAKFAST_EXTRA", "1001_2001_2_2_0"], [36630, "BREAKFAST_INCLUDED", "1001_2001_2_1_0"]]);
  });
  it("does not turn rounded displays, originals, other rooms, or unknown occupancy into target prices", () => {
    expect(bookingReferencePackages(html([{ ...row("2", "308.70"), itemizedTotalPriceText: null, priceText: "NZD 309" },
      { ...row("2", "308.70"), unitExternalId: "1002" }, { ...row("2", "308.70"), occupancy: null }]), expected)).toEqual([]);
  });
  it("rejects contradictory row selectors, mismatched dates, properties and ambiguous snapshots", () => {
    expect(bookingReferencePackages(html([row("2", "100"), row("2", "200")]), expected)).toEqual([]);
    expect(bookingReferencePackages(html([row("2", "100")], { context: { ...context, checkIn: "2026-12-05" } }), expected)).toEqual([]);
    expect(bookingReferencePackages(html([row("2", "100")], { canonicalUrl: expected.sourceUrl.replace("synthetic", "other") }), expected)).toEqual([]);
    expect(bookingReferencePackages(html([row("2", "100")]) + html([row("2", "100")]), expected)).toEqual([]);
    expect(bookingReferencePackages(html([{ ...row("2", "100"), sourceText: "#policyModal_1002_2001_2_2_0" }]), expected)).toEqual([]);
  });
});
