import { describe, expect, it } from "vitest";
import { marketSampleLabelsSchema, normalizeSampleType, sampleQuantitativeTags, selectRepresentativeSamples, unverifiedSampleLabels, type SampleCandidate, type SampleStratumTarget } from "../src/market-sample-labels";

const proof = { sourceRef: "fixture:reviewed", observedAt: "2026-10-14T00:00:00Z", methodVersion: "fixture-v1" };
const candidate = (id: string, locality = "a", rawType = "Hotel", capacity = 2): SampleCandidate => {
  const labels = unverifiedSampleLabels(rawType, proof.sourceRef, proof.observedAt);
  labels.geography = { regionId: "region", regionName: "Canterbury", authorityId: "city", authorityName: "Christchurch City", localityId: locality, localityName: `Fixture ${locality}`, latitude: -43.5, longitude: 172.6, boundaryVersion: "fixture-boundaries", assignmentMethod: "POINT_IN_POLYGON", ...proof };
  labels.capacityGuests = { value: capacity, unit: "guests", ...proof };
  labels.unitKind = { value: "PRIVATE_ROOM", rawValue: "fixture private room", ...proof };
  return { propertyId: id, unitId: `u-${id}`, listingId: `l-${id}`, source: "booking", profileKey: "profile", termsKey: "terms", identityReviewed: true, labels };
};
const target = (locality = "a", type: SampleStratumTarget["accommodationType"] = "HOTEL", count = 2): SampleStratumTarget => ({ regionId: "region", authorityId: "city", localityId: locality, accommodationType: type, targetCount: count, eligibleSupplyProperties: null, supplyFrameRef: null, supplyFrameAsOf: null });

describe("representative sample labels and proposals", () => {
  it("leaves missing measurements null and distinguishes rating scales from stars", () => {
    const labels = candidate("a").labels;
    labels.reviews = [{ source: "A", score: 8.5, scaleMaximum: 10, count: 300, ...proof }, { source: "B", score: 4.5, scaleMaximum: 5, count: 20, ...proof }];
    const tags = sampleQuantitativeTags(labels);
    expect(tags.reviewScores.map(item => item.score100)).toEqual([85, 90]);
    expect(tags.officialStars).toBeNull(); expect(tags.bedrooms).toBeNull(); expect(tags.baselineObservations).toBeNull(); expect(tags.comparableCaptureRate).toBeNull();
    expect(normalizeSampleType("Accommodation")).toBe("UNKNOWN");
  });
  it("validates units, score bounds and evidence instead of fabricating tags", () => {
    const labels = candidate("a").labels;
    expect(() => marketSampleLabelsSchema.parse({ ...labels, capacityGuests: { ...labels.capacityGuests, value: -1 } })).toThrow();
    expect(() => marketSampleLabelsSchema.parse({ ...labels, reviews: [{ source: "A", score: 11, scaleMaximum: 10, count: 5, ...proof }] })).toThrow();
    expect(() => marketSampleLabelsSchema.parse({ ...labels, priceBand: { value: "UPPER", referenceGroup: "fixture", cutoffsNZDMinor: [10000, 20000], ...proof } })).toThrow();
  });
  it("satisfies suburb/type quotas without replacing a scarce stratum with abundant hotels", () => {
    const candidates = [candidate("hotel-1"), candidate("hotel-2"), candidate("hotel-3"), candidate("motel", "b", "Motel")];
    const result = selectRepresentativeSamples(candidates, [target("a", "HOTEL", 2), target("b", "MOTEL", 2)]);
    expect(result.selected.map(item => item.propertyId).sort()).toEqual(["hotel-1", "hotel-2", "motel"]);
    expect(result.strata.find(stratum => stratum.localityId === "b")?.shortfall).toBe(1);
    expect(result.scope).toEqual({ localities: 2, authorities: 1, regions: 1, accommodationTypes: 2 });
    expect(result.publicationBlockers).toContain("STRATUM_SHORTFALL");
  });
  it("diversifies capacity and spatial coverage without using high ratings or input order", () => {
    const a = candidate("a"), b = candidate("b"), c = candidate("c", "a", "Hotel", 4);
    b.labels.reviews = [{ source: "fixture", score: 10, scaleMaximum: 10, count: 900, ...proof }];
    const first = selectRepresentativeSamples([a, b, c], [target()]);
    expect(first.selected.map(item => item.propertyId)).toEqual(["a", "c"]);
    expect(selectRepresentativeSamples([c, b, a], [target()]).selected).toEqual(first.selected);
    c.labels.capacityGuests!.value = 2; c.labels.geography!.longitude = 172.7;
    expect(selectRepresentativeSamples([b, c, a], [target()]).selected.map(item => item.propertyId)).toEqual(["a", "c"]);
  });
  it("deduplicates properties across platforms and excludes contradictory geographic assignments", () => {
    const a = candidate("same"), duplicate = { ...candidate("same"), listingId: "other-listing", source: "expedia" };
    expect(selectRepresentativeSamples([a, duplicate], [target()]).selected).toHaveLength(1);
    duplicate.labels.geography!.localityId = "other";
    const result = selectRepresentativeSamples([a, duplicate], [target()]);
    expect(result.selected).toHaveLength(0); expect(result.excluded[0].reasons).toContain("CONFLICTING_GEOGRAPHY_OR_TYPE");
  });
  it("excludes unresolved geography, capacity, identity and quote conditions", () => {
    const a = candidate("a"); a.identityReviewed = false; a.labels.geography = null; a.profileKey = null; a.labels.capacityGuests = null;
    const result = selectRepresentativeSamples([a], [target()]);
    expect(result.selected).toEqual([]); expect(result.excluded[0].reasons).toContain("GEOGRAPHY_UNVERIFIED");
    expect(result.excluded[0].reasons).toContain("CAPACITY_NOT_VERIFIED_FOR_TWO_ADULTS");
  });
  it("blocks a unit or listing attributed to different properties", () => {
    const a = candidate("a"), b = candidate("b"); b.unitId = a.unitId;
    const result = selectRepresentativeSamples([a, b], [target()]);
    expect(result.selected).toHaveLength(0);
    expect(result.excluded.every(item => item.reasons.includes("CONFLICTING_PROPERTY_IDENTITY"))).toBe(true);
  });
  it("diversifies evidenced price bands and rejects mismatched baselines", () => {
    const a = candidate("a"), b = candidate("b"), c = candidate("c");
    for (const item of [a, b, c]) {
      item.labels.priceBaseline = { medianNZDMinor: item === c ? 25000 : 9000, quoteCount: 4, distinctObservedDays: 2,
        from: proof.observedAt, to: proof.observedAt, querySignature: "two-adults-one-night", termsKey: "terms", profileKey: "profile", ...proof };
      item.labels.priceBand = { value: item === c ? "UPPER" : "LOWER", referenceGroup: "fixture-city-type", cutoffsNZDMinor: [10000, 20000], ...proof };
    }
    expect(selectRepresentativeSamples([a, b, c], [target()]).selected.map(item => item.propertyId)).toEqual(["a", "c"]);
    c.labels.priceBaseline!.termsKey = "different";
    expect(selectRepresentativeSamples([c], [target()]).excluded[0].reasons).toContain("BASELINE_CONDITIONS_MISMATCH");
    a.labels.priceBand!.value = "UPPER";
    expect(() => marketSampleLabelsSchema.parse(a.labels)).toThrow();
  });
  it("does not invent supply weights and rejects incompatible or oversized targets", () => {
    const candidates = [candidate("a"), candidate("b")];
    expect(selectRepresentativeSamples(candidates, [target()]).strata[0].supplyExpansionFactor).toBeNull();
    expect(selectRepresentativeSamples(candidates, [{ ...target(), eligibleSupplyProperties: 20, supplyFrameRef: "fixture:inventory", supplyFrameAsOf: proof.observedAt }]).strata[0].supplyExpansionFactor).toBe(10);
    expect(() => selectRepresentativeSamples(candidates, [target(), target()])).toThrow();
    expect(() => selectRepresentativeSamples(candidates, [target("a", "HOTEL", 30), target("b", "MOTEL", 30)], 50)).toThrow();
    expect(selectRepresentativeSamples(candidates, [target("a", "HOTEL", 30), target("b", "MOTEL", 30)], 60).strata).toHaveLength(2);
    expect(selectRepresentativeSamples(candidates, []).publicationBlockers).toContain("GEOGRAPHY_TYPE_TARGETS_REQUIRED");
  });
});
