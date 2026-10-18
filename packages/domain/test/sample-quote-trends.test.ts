import { describe, expect, it } from "vitest";
import { buildSampleQuoteTrends, sampleQuoteCycle, sampleReferenceTerms, type SampleTrendMember, type SampleTrendRun } from "../src/sample-quote-trends";

const member: SampleTrendMember = { id: "m1", name: "Sample hotel", source: "booking", sourceListingId: "123", sourceUrl: "https://www.booking.com/hotel/nz/sample.html",
  accommodationType: "HOTEL", locality: "Riccarton", nights: 1, executionHash: "original" };
const terms = { mealPlan: "breakfast included", cancellationPolicy: "Non-refundable", paymentTerms: "Pay online", rateFence: "PUBLIC" };
function run(id: string, date: string, amount = 10000, extras: Partial<SampleTrendRun> = {}): SampleTrendRun {
  return { id, memberId: member.id, manifestHash: "original", checkIn: "2026-12-01", unitExternalId: "room1", status: "SUCCEEDED",
    finishedAt: `${date}T00:00:00.000Z`, delivered: true, executor: "self_hosted", connectorId: "booking-public", connectorVersion: "1.0.0",
    evaluated: [{ status: "RAW_ONLY", raw: { candidateId: member.id, sourceUnitKey: "room1", evidenceRef: id, observedAt: `${date}T00:00:00.000Z`,
      checkIn: "2026-12-01", checkOut: "2026-12-02", nights: 1, adults: 2, children: 0, units: 1, currency: "NZD", collectionProfile: null,
      bookingMode: "UNKNOWN", outcome: "QUOTED", totalMinor: amount, mandatoryFees: "COMPLETE", qualityFlags: [], ...terms } }],
    rates: [{ sourceListingId: "sample", unitExternalId: "room1", ratePlanExternalId: "plan1", checkIn: "2026-12-01", checkOut: "2026-12-02",
      adults: 2, children: 0, units: 1, currency: "NZD", totalPriceMinor: amount, totalIncludesMandatoryFees: true,
      availabilityStatus: "AVAILABLE", fieldSources: { totalIncludesMandatoryFees: "Includes taxes and fees" }, ...terms }], ...extras };
}
function build(runs: SampleTrendRun[], members = [member], extra = {}) {
  return buildSampleQuoteTrends({ members, runs, startsOn: "2026-10-16", asOf: "2026-11-10T00:00:00Z",
    filter: { from: "2026-10-16", to: "2026-11-10", basis: "ALL", nights: "ALL", stay: "ALL", category: "ALL", lead: "ALL" }, ...extra });
}
function alterRaw(r: SampleTrendRun, changes: object) { const e = r.evaluated as { raw: object }[]; return { ...r, evaluated: [{ ...e[0], raw: { ...e[0].raw, ...changes } }] }; }
function alterRate(r: SampleTrendRun, changes: object) { return { ...r, rates: [{ ...(r.rates as object[])[0], ...changes }] }; }

describe("sample source-quote trends (separate from formal market comparability)", () => {
  it("compares continuous refundable quotes despite payment dates and cancellation deadline changes", () => {
    const quoted = (id: string, day: string, amount: number, deadline: string, plan: string | null = "plan1") => {
      const changes = { cancellationPolicy: `Free cancellation before ${deadline}`, paymentTerms: `Pay nothing until ${deadline}` };
      return alterRate(alterRaw(run(id, day, amount), changes), { ...changes, ratePlanExternalId: plan });
    };
    for (const plan of ["plan1", null]) {
      const result = build([quoted("a", "2026-10-16", 10000, "November 28, 2026", plan), quoted("b", "2026-10-23", 11000, "November 29, 2026", plan)]);
      expect(result.series).toHaveLength(1);
      expect(result.series[0].refundGroup).toBe("REFUNDABLE");
      expect(result.series[0].points[1]).toMatchObject({ pairedSamples: 1, unpairedSamples: 0, previousCycle: "2026-10-16", baseline: false });
      expect(result.series[0].points[1].changePct).toBeCloseTo(10);
      expect(result.recentQuotes[0].notes.payment).toContain("November 29");
    }
    expect(sampleReferenceTerms({ cancellationPolicy: "Free cancellation before November 29, 2026 at 2:00 pm NZDT" }).refundGroup).toBe("REFUNDABLE");
  });
  it("never matches changed refundability, room or source plan, and does not call a later first appearance a baseline", () => {
    const a = run("a", "2026-10-16"), changes = { cancellationPolicy: "Free cancellation before November 29, 2026" };
    const b = alterRate(alterRaw(run("b", "2026-10-23", 11000), changes), changes);
    const result = build([a, b]);
    expect(result.series).toHaveLength(2); expect(result.series.every(s => s.points.every(p => p.changePct === null))).toBe(true);
    expect(result.series.find(s => s.refundGroup === "REFUNDABLE")!.points[0].baseline).toBe(false);
    const unknown = { cancellationPolicy: "UNKNOWN" };
    expect(build([a, alterRate(alterRaw(run("c", "2026-10-23"), unknown), unknown)]).series).toHaveLength(2);
    expect(build([a, alterRate(run("d", "2026-10-23"), { ratePlanExternalId: "changed" })]).series[0].points[1].pairedSamples).toBe(0);
    const room = alterRate(alterRaw(run("e", "2026-10-23", 11000, { unitExternalId: "room2" }), { sourceUnitKey: "room2" }), { unitExternalId: "room2" });
    expect(build([a, room]).series[0].points[1].pairedSamples).toBe(0);
  });
  it("does not collapse two differently priced rows with the same coarse conditions and source plan", () => {
    const r = run("a", "2026-10-16");
    r.rates = [...r.rates as object[], { ...(r.rates as object[])[0], paymentTerms: "Pay at property", totalPriceMinor: 12000 }];
    expect(build([r]).includedMembers).toBe(0);
  });
  it("groups flexible dates by weekday and lead time without presenting composition changes as matched inflation", () => {
    const dated = (id: string, observed: string, checkIn: string, checkOut: string, amount: number) => {
      const r = run(id, observed, amount, { checkIn });
      return alterRate(alterRaw(r, { checkIn, checkOut }), { checkIn, checkOut });
    };
    const filter = { from: "2026-10-16", to: "2026-11-10", basis: "ALL", nights: "ALL", stay: "ALL", category: "ALL", lead: "ALL", comparison: "ROLLING" };
    const result = build([dated("a", "2026-10-16", "2026-12-01", "2026-12-02", 10000),
      dated("b", "2026-10-23", "2026-12-08", "2026-12-09", 20000),
      dated("c", "2026-10-23", "2026-12-12", "2026-12-13", 30000)], [member], { filter });
    expect(result.series).toHaveLength(2);
    const weekdays = result.series.find(s => s.arrivalKind === "WEEKDAY")!;
    expect(weekdays.arrivalDates).toEqual(["2026-12-01", "2026-12-08"]);
    expect(weekdays.points.map(p => p.medianTotalMinor)).toEqual([10000, 20000]);
    expect(result.series.every(s => s.points.every(p => p.changePct === null && p.pairedSamples === 0))).toBe(true);
  });
  it("keeps an approved three-night total separate and rejects a mismatched two-night quote", () => {
    const home = { ...member, nights: 3 as const };
    const r = alterRate(alterRaw(run("three", "2026-10-16", 48100), { nights: 3, checkOut: "2026-12-04" }), { checkOut: "2026-12-04" });
    const good = build([r], [home]); expect(good.includedMembers).toBe(1); expect(good.series[0].nights).toBe(3);
    expect(build([r], [{ ...home, nights: 2 }]).includedMembers).toBe(0);
  });
  it("shows one baseline without manufacturing change or upgrading raw facts", () => {
    const r = run("a", "2026-10-16"), before = structuredClone(r), result = build([r]);
    expect(result.includedMembers).toBe(1); expect(result.series[0].points[0].changePct).toBeNull(); expect(r).toEqual(before);
  });
  it("pairs exact plans in adjacent NZ cycles and reports a member-median percentage", () => {
    const result = build([run("a", "2026-10-16"), run("b", "2026-10-23", 11000)]);
    expect(result.series[0].points[1]).toMatchObject({ cycle: "2026-10-23", pairedSamples: 1, leadDaysMin: 39 });
    expect(result.series[0].points[1].changePct).toBeCloseTo(10);
  });
  it("repeated acceptance captures remain one point and latest completed failure removes the earlier price", () => {
    expect(build([run("a", "2026-10-16"), run("b", "2026-10-17", 20000)]).series[0].points).toHaveLength(1);
    const failed = run("b", "2026-10-17", 20000, { status: "FAILED" });
    expect(build([run("a", "2026-10-16"), failed])).toMatchObject({ includedMembers: 0, failedWindows: 1 });
  });
  it("unavailable is not zero and does not carry forward an earlier available quote", () => {
    const missing = alterRaw(run("b", "2026-10-17"), { outcome: "UNAVAILABLE", totalMinor: null });
    const result = build([run("a", "2026-10-16"), missing]); expect(result.series).toHaveLength(0); expect(result.noPriceWindows).toBe(1);
  });
  it("changed terms, source executor and missing periods do not produce false pairs", () => {
    const a = run("a", "2026-10-16"), b = alterRate(alterRaw(run("b", "2026-10-23"), { mealPlan: "ROOM_ONLY" }), { mealPlan: "ROOM_ONLY" });
    expect(build([a, b]).series.every(s => s.points.every(p => p.changePct === null))).toBe(true);
    expect(build([a, run("c", "2026-10-30", 5000)]).series[0].points[1].changePct).toBeNull();
    expect(build([a, run("d", "2026-10-23", 5000, { executor: "managed" })]).includedMembers).toBe(1);
  });
  it("tracks unique displayed references with missing detail without claiming equivalent fees or meals", () => {
    const a = alterRaw(run("a", "2026-10-16"), { mandatoryFees: "UNKNOWN" });
    expect(build([a]).series[0].feeGroup).toBe("UNDISCLOSED");
    const changes = { mealPlan: "UNKNOWN", cancellationPolicy: "free cancellationGreat breakfast for NZD 38.00 (opt", paymentTerms: "You won't be charged yet" };
    const b = alterRate(alterRaw(run("b", "2026-10-23"), changes), { ...changes, ratePlanExternalId: null });
    const result = build([a, b]);
    expect(result.includedMembers).toBe(1); expect(result.series).toHaveLength(2);
    expect(result.series.every(s => s.points.every(p => p.changePct === null))).toBe(true);
    expect(result.recentQuotes.find(q => q.observedOn === "2026-10-23")?.disclosures).toEqual(["MEAL_TERMS_MISSING", "PAYMENT_TERMS_MISSING", "CANCELLATION_TERMS_MISSING"]);
    expect(sampleReferenceTerms(changes).signature).toContain("UNDISCLOSED");
  });
  it("parses Expedia and Trip literal labels without treating extras or a CTA as a meal/payment promise", () => {
    expect(sampleReferenceTerms({ mealPlan: "No extras", cancellationPolicy: "Non-refundable, + NZ$0.", paymentTerms: "Reserve now, pay later" }))
      .toMatchObject({ mealGroup: "UNDISCLOSED", disclosures: ["MEAL_TERMS_MISSING"] });
    expect(sampleReferenceTerms({ mealPlan: "NO_MEAL_DISCLOSED", cancellationPolicy: "NON_REFUNDABLE", paymentTerms: "PAY_NOW" }).signature).toContain("NON_REFUNDABLE");
    expect(sampleReferenceTerms({ cancellationPolicy: "Fully refundable before Fri, 4 Dec. More about the cancellation policy." }).signature)
      .toContain("REFUNDABLE");
    const changes = { mealPlan: "NO_MEAL_DISCLOSED", cancellationPolicy: "NON_REFUNDABLE", paymentTerms: "PAY_NOW", rateFence: "PUBLIC_SIGNED_OUT" };
    const r = alterRate(alterRaw(run("a", "2026-10-16"), changes), changes);
    expect(build([r]).includedMembers).toBe(1);
  });
  it("keeps fee inclusion separate but permits unknown policy wording changes on the same source plan", () => {
    const a = alterRaw(run("a", "2026-10-16"), { mandatoryFees: "UNKNOWN" });
    expect(build([a, run("b", "2026-10-23")]).series.every(s => s.points.every(p => p.changePct === null))).toBe(true);
    const x = { cancellationPolicy: "Unknown package A" }, y = { cancellationPolicy: "Unknown package B" };
    const result = build([alterRate(alterRaw(run("a", "2026-10-16"), x), x), alterRate(alterRaw(run("b", "2026-10-23"), y), y)]);
    expect(result.series[0].points[1].changePct).toBe(0);
    const conflict = build([alterRaw(run("a", "2026-10-16"), { mandatoryFees: "CONFLICT" })]);
    expect(conflict.includedMembers).toBe(0); expect(conflict.gaps[0].reasons).toContain("SOURCE_CONFLICT");
  });
  it("members-only amounts form independent displayed-reference series without borrowed terms", () => {
    function ref(r: SampleTrendRun) {
      const reference = { kind: "MEMBER_ONLY", amountMinor: 9000, ratePlanExternalId: "member-plan", sourceText: "Members-only price" };
      const e = (r.evaluated as { raw: object }[])[0];
      return { ...alterRate(r, { referencePrices: [reference] }), evaluated: [{ ...e,
        raw: { ...e.raw, outcome: "MEMBER_REFERENCE", totalMinor: 9000, mandatoryFees: "UNKNOWN", mealPlan: "UNKNOWN", cancellationPolicy: "UNKNOWN", paymentTerms: "UNKNOWN", rateFence: "MEMBER_ONLY" }, referencePrice: reference }] };
    }
    const result = build([run("a", "2026-10-16"), ref(run("b", "2026-10-23"))]);
    expect(result.series).toHaveLength(2); expect(result.series.every(s => s.points[0].changePct === null)).toBe(true);
    expect(build([ref(run("a", "2026-10-16")), ref(run("b", "2026-10-23"))]).series[0].points[1].changePct).toBe(0);
    expect(build([alterRate(ref(run("a", "2026-10-16")), { referencePrices: [] })]).includedMembers).toBe(0);
  });
  it("reused member plan IDs need exact retained row packages; changing prices still pair the same package", () => {
    function memberRun(id: string, day: string, increase = 0) {
      const r = run(id, day), refs = [9000 + increase, 12000 + increase].map(amountMinor => ({ kind: "MEMBER_ONLY", amountMinor,
        ratePlanExternalId: "reused-plan", sourceText: `Members-only price NZD ${amountMinor / 100}` }));
      const first = (r.evaluated as { raw: object }[])[0];
      r.evaluated = refs.map(ref => ({ raw: { ...first.raw, totalMinor: ref.amountMinor, outcome: "MEMBER_REFERENCE", mandatoryFees: "UNKNOWN",
        rateFence: "MEMBER_ONLY", mealPlan: "UNKNOWN", paymentTerms: "UNKNOWN", cancellationPolicy: "UNKNOWN" }, referencePrice: ref }));
      r.rates = [{ ...(r.rates as object[])[0], referencePrices: refs }];
      r.referencePackages = refs.map((ref, i) => ({ amountMinor: ref.amountMinor, unitExternalId: "room1", ratePlanExternalId: ref.ratePlanExternalId,
        selector: `source-row-${i}`, mealPlan: i === 0 ? "BREAKFAST_EXTRA" : "BREAKFAST_INCLUDED",
        paymentTerms: "Pay online", cancellationPolicy: "Non-refundable" }));
      return r;
    }
    const a = memberRun("a", "2026-10-16"), b = memberRun("b", "2026-10-23", 900);
    expect(build([{ ...a, referencePackages: [] }]).includedMembers).toBe(0);
    const result = build([a, b]);
    expect(result.includedMembers).toBe(1); expect(result.series).toHaveLength(2);
    expect(result.series.map(s => s.mealGroup).sort()).toEqual(["BREAKFAST_EXTRA", "BREAKFAST_INCLUDED"]);
    expect(result.series.find(s => s.mealGroup === "BREAKFAST_EXTRA")!.points[1].changePct).toBeCloseTo(10);
    expect(result.series.find(s => s.mealGroup === "BREAKFAST_INCLUDED")!.points[1].changePct).toBeCloseTo(7.5);
    const single = { ...b, evaluated: (b.evaluated as unknown[]).slice(0, 1), referencePackages: (b.referencePackages as unknown[]).slice(0, 1),
      rates: [{ ...(b.rates as { referencePrices: unknown[] }[])[0], referencePrices: (b.rates as { referencePrices: unknown[] }[])[0].referencePrices.slice(0, 1) }] };
    expect(build([a, single]).series.find(s => s.mealGroup === "BREAKFAST_EXTRA")!.points[1].changePct).toBeCloseTo(10);
    const conflict = (a.referencePackages as object[]).map(p => ({ ...p, selector: "same-row" }));
    expect(build([{ ...a, referencePackages: conflict }]).includedMembers).toBe(0);
    const wrongRoom = (a.referencePackages as object[]).map(p => ({ ...p, unitExternalId: "other-room" }));
    expect(build([{ ...a, referencePackages: wrongRoom }]).includedMembers).toBe(0);
  });
  it("does not compare different stay dates at a month boundary or mix actual one/two night packages", () => {
    const other = { ...member, id: "m2", nights: 2 as const };
    const two = alterRate(alterRaw(run("b", "2026-10-23", 12000, { memberId: "m2" }), { candidateId: "m2", nights: 2, checkOut: "2026-12-03" }), { checkOut: "2026-12-03" });
    const jan = alterRate(alterRaw(run("c", "2026-11-06", 8000, { checkIn: "2027-01-05" }), { checkIn: "2027-01-05", checkOut: "2027-01-06" }), { checkIn: "2027-01-05", checkOut: "2027-01-06" });
    const result = build([run("a", "2026-10-16"), two, jan], [member, other]);
    expect(result.series).toHaveLength(3); expect(result.series.every(s => s.points[0].changePct === null)).toBe(true);
  });
  it("retired members, wrong manifest lineage, mismatched query, missing ACK and ambiguous plans stay excluded", () => {
    const rows = [run("a", "2026-10-16", 10000, { memberId: "retired" }), run("b", "2026-10-16", 10000, { manifestHash: "changed" }),
      alterRaw(run("c", "2026-10-16"), { adults: 1 })];
    expect(build(rows).includedMembers).toBe(0);
    expect(build([run("a", "2026-10-16", 10000, { delivered: false })]).includedMembers).toBe(0);
    const a = run("a", "2026-10-16"); a.rates = [...a.rates as object[], { ...(a.rates as object[])[0], ratePlanExternalId: "other" }];
    expect(build([a]).includedMembers).toBe(0);
  });
  it("one listing with multiple offers does not outweigh another listing", () => {
    const m2 = { ...member, id: "m2" };
    const runs = [run("a", "2026-10-16"), run("b", "2026-10-23", 20000), run("c", "2026-10-16"), run("d", "2026-10-23", 10000)];
    for (const r of runs.slice(2)) { r.memberId = "m2"; r.evaluated = (r.evaluated as { raw: object }[]).map(e => ({ ...e, raw: { ...e.raw, candidateId: "m2" } })); }
    for (const [index, r] of runs.slice(0, 2).entries()) {
      const amount = index === 0 ? 15000 : 30000;
      r.rates = [...r.rates as object[], { ...(r.rates as object[])[0], ratePlanExternalId: "plan2", totalPriceMinor: amount }];
      const first = (r.evaluated as { raw: object }[])[0];
      r.evaluated = [...r.evaluated as object[], { ...first, raw: { ...first.raw, totalMinor: amount } }];
    }
    expect(build(runs, [member, m2]).series[0].points[1].changePct).toBeCloseTo(50);
  });
  it("a newly observed cheap sample cannot create an artificial fall in the matched change", () => {
    const cheap = { ...member, id: "cheap" };
    const newRun = alterRaw(run("c", "2026-10-23", 1000, { memberId: "cheap" }), { candidateId: "cheap" });
    const result = build([run("a", "2026-10-16", 10000), run("b", "2026-10-23", 11000), newRun], [member, cheap]);
    const point = result.series[0].points[1]; expect(point.sampleCount).toBe(2); expect(point.medianTotalMinor).toBe(6000);
    expect(point.pairedSamples).toBe(1); expect(point.changePct).toBeCloseTo(10);
  });
  it("conflicting amounts for one exact plan cannot be selected by response order", () => {
    const r = run("a", "2026-10-16"); r.rates = [...r.rates as object[], { ...(r.rates as object[])[0], totalPriceMinor: 15000 }];
    expect(build([r]).includedMembers).toBe(0); expect(build([r]).gaps[0].reasons).toContain("SOURCE_CONFLICT");
  });
  it("uniquely explicit terms can select an offer without inventing an OTA plan ID; ambiguity stays excluded", () => {
    const a = alterRate(run("a", "2026-10-16"), { ratePlanExternalId: null });
    const b = alterRate(run("b", "2026-10-23", 11000), { ratePlanExternalId: null });
    expect(build([a, b]).series[0].points[1].changePct).toBeCloseTo(10);
    a.rates = [...a.rates as object[], { ...(a.rates as object[])[0], totalPriceMinor: 15000 }];
    expect(build([a]).includedMembers).toBe(0);
  });
  it("an amount embedded in the native membership label is verified but never becomes an identity field", () => {
    function ref(r: SampleTrendRun, amount: number) {
      const reference = { kind: "MEMBER_ONLY", amountMinor: amount, ratePlanExternalId: "member-plan", sourceText: `Members-only price NZD ${(amount / 100).toFixed(2)}` };
      const e = (r.evaluated as { raw: object }[])[0];
      return { ...alterRate(r, { referencePrices: [reference] }), evaluated: [{ ...e, raw: { ...e.raw, outcome: "MEMBER_REFERENCE", totalMinor: amount, rateFence: "MEMBER_ONLY" }, referencePrice: reference }] };
    }
    const result = build([ref(run("a", "2026-10-16"), 17567), ref(run("b", "2026-10-23"), 18567)]);
    expect(result.series[0].points[1].pairedSamples).toBe(1);
    expect(result.series[0].points[1].changePct).toBeCloseTo((18567 / 17567 - 1) * 100);
    const bad = ref(run("a", "2026-10-16"), 17567); (bad.evaluated as { referencePrice: { sourceText: string } }[])[0].referencePrice.sourceText = "Members-only price NZD 200.00";
    expect(build([bad]).includedMembers).toBe(0);
  });
  it("incomplete reads never publish a partial-data change", () => {
    const result = build([run("a", "2026-10-16"), run("b", "2026-10-23", 15000)], [member], { complete: false });
    expect(result.complete).toBe(false); expect(result.series[0].points[1].changePct).toBeNull();
  });
  it("NZ dates and fixed seven-date cycles handle daylight saving and month crossings", () => {
    expect(sampleQuoteCycle("2026-10-16", "2026-11-01")).toBe("2026-10-30");
    expect(sampleQuoteCycle("2026-10-16", "2026-11-06")).toBe("2026-11-06");
    let r = run("a", "2026-10-22"); r.finishedAt = "2026-10-22T12:00:00.000Z";
    expect(build([r]).series[0].points[0].cycle).toBe("2026-10-16");
    r = alterRaw(r, { observedAt: "2026-10-22T11:00:00.000Z" });
    expect(build([r]).series[0].points[0].cycle).toBe("2026-10-23");
  });
});
