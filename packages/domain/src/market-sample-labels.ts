import { z } from "zod";

export const sampleAccommodationType = z.enum(["HOTEL", "MOTEL", "SERVICED_APARTMENT", "HOLIDAY_HOME", "GUESTHOUSE", "LODGE", "BACKPACKER", "HOLIDAY_PARK", "FARM_STAY", "OTHER", "UNKNOWN"]);
export const samplePriceBand = z.enum(["LOWER", "MIDDLE", "UPPER", "UNKNOWN"]);
export const sampleUnitKind = z.enum(["PRIVATE_ROOM", "ENTIRE_PLACE", "SHARED_ROOM", "BED", "PITCH", "OTHER", "UNKNOWN"]);
const evidence = { sourceRef: z.string().min(1), observedAt: z.string().datetime(), methodVersion: z.string().min(1) };
const measurement = <T extends z.ZodTypeAny, U extends string>(value: T, unit: U) => z.object({ value, unit: z.literal(unit), ...evidence }).strict().nullable();
const count = z.number().int().nonnegative();
export const sampleGeographySchema = z.object({
  regionId: z.string().min(1), regionName: z.string().min(1), authorityId: z.string().min(1), authorityName: z.string().min(1),
  localityId: z.string().min(1), localityName: z.string().min(1),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  boundaryVersion: z.string().min(1), assignmentMethod: z.enum(["POINT_IN_POLYGON", "VERIFIED_ADDRESS"]),
  ...evidence,
}).strict();

/** A frozen label snapshot. Values may be unknown; missing evidence is never a zero or an inferred amenity. */
export const marketSampleLabelsSchema = z.object({
  version: z.literal("market-sample-labels-v1"), geography: sampleGeographySchema.nullable(),
  accommodationType: z.object({ value: sampleAccommodationType, rawValue: z.string(), ...evidence }).strict(),
  unitKind: z.object({ value: sampleUnitKind, rawValue: z.string(), ...evidence }).strict().nullable(),
  capacityGuests: measurement(z.number().int().positive(), "guests"),
  bedrooms: measurement(count, "bedrooms"), beds: measurement(count, "beds"),
  floorArea: measurement(z.number().positive(), "m2"),
  kitchen: measurement(z.boolean(), "boolean"), parking: measurement(z.boolean(), "boolean"),
  privateBathroom: measurement(z.boolean(), "boolean"),
  officialStars: measurement(z.number().min(0).max(5), "stars"),
  reviews: z.array(z.object({ source: z.string().min(1), score: z.number().nonnegative(), scaleMaximum: z.number().positive(), count,
    ...evidence }).strict().refine(value => value.score <= value.scaleMaximum, "Review score exceeds its scale")).max(6),
  priceBaseline: z.object({ medianNZDMinor: z.number().int().positive(), quoteCount: z.number().int().positive(),
    distinctObservedDays: z.number().int().positive(), from: z.string().datetime(), to: z.string().datetime(),
    querySignature: z.string().min(1), termsKey: z.string().min(1), profileKey: z.string().min(1), ...evidence,
  }).strict().refine(value => value.from <= value.to && value.distinctObservedDays <= value.quoteCount, "Invalid price baseline window/counts").nullable(),
  priceBand: z.object({ value: samplePriceBand, referenceGroup: z.string().min(1), cutoffsNZDMinor: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    ...evidence }).strict().refine(value => value.cutoffsNZDMinor[0] < value.cutoffsNZDMinor[1], "Price band cutoffs must increase").nullable(),
  collection: z.object({ requested: count, comparable: count, failed: count, from: z.string().datetime(), to: z.string().datetime(), ...evidence })
    .strict().refine(value => value.comparable + value.failed <= value.requested && value.from <= value.to, "Invalid collection counts/window").nullable(),
}).strict().superRefine((value, context) => {
  if (value.priceBand && !value.priceBaseline) context.addIssue({ code: "custom", message: "Price band requires a comparable baseline" });
  if (value.priceBand && value.priceBaseline && value.priceBand.value !== "UNKNOWN") {
    const [low, high] = value.priceBand.cutoffsNZDMinor, price = value.priceBaseline.medianNZDMinor;
    const band = price < low ? "LOWER" : price < high ? "MIDDLE" : "UPPER";
    if (value.priceBand.value !== band) context.addIssue({ code: "custom", message: "Price band disagrees with baseline and cutoffs" });
  }
});
export type MarketSampleLabels = z.infer<typeof marketSampleLabelsSchema>;

export function normalizeSampleType(raw: string): z.infer<typeof sampleAccommodationType> {
  const aliases: Record<string, z.infer<typeof sampleAccommodationType>> = {
    hotel: "HOTEL", motel: "MOTEL", "serviced apartment": "SERVICED_APARTMENT", "serviced apartments": "SERVICED_APARTMENT",
    "holiday home": "HOLIDAY_HOME", "entire home": "HOLIDAY_HOME", "entire guesthouse": "GUESTHOUSE", guesthouse: "GUESTHOUSE",
    lodge: "LODGE", backpacker: "BACKPACKER", hostel: "BACKPACKER", "holiday park": "HOLIDAY_PARK", "farm stay": "FARM_STAY",
  };
  return aliases[raw.trim().toLowerCase()] ?? "UNKNOWN";
}

export function unverifiedSampleLabels(rawType: string, sourceRef: string, observedAt: string): MarketSampleLabels {
  return marketSampleLabelsSchema.parse({ version: "market-sample-labels-v1", geography: null,
    accommodationType: { value: normalizeSampleType(rawType), rawValue: rawType, sourceRef, observedAt, methodVersion: "explicit-type-aliases-v1" },
    unitKind: null, capacityGuests: null, bedrooms: null, beds: null, floorArea: null, kitchen: null, parking: null, privateBathroom: null,
    officialStars: null, reviews: [], priceBaseline: null, priceBand: null, collection: null });
}

export function sampleQuantitativeTags(input: MarketSampleLabels) {
  const labels = marketSampleLabelsSchema.parse(input);
  return { regionId: labels.geography?.regionId ?? null, authorityId: labels.geography?.authorityId ?? null, localityId: labels.geography?.localityId ?? null,
    latitude: labels.geography?.latitude ?? null, longitude: labels.geography?.longitude ?? null,
    accommodationType: labels.accommodationType.value, unitKind: labels.unitKind?.value ?? "UNKNOWN",
    capacityGuests: labels.capacityGuests?.value ?? null, bedrooms: labels.bedrooms?.value ?? null,
    beds: labels.beds?.value ?? null, floorAreaM2: labels.floorArea?.value ?? null,
    kitchen: labels.kitchen?.value ?? null, parking: labels.parking?.value ?? null, privateBathroom: labels.privateBathroom?.value ?? null,
    officialStars: labels.officialStars?.value ?? null,
    reviewScores: labels.reviews.map(review => ({ source: review.source, score: review.score, scaleMaximum: review.scaleMaximum, score100: review.score / review.scaleMaximum * 100, count: review.count })),
    baselineNZDMinor: labels.priceBaseline?.medianNZDMinor ?? null, baselineObservations: labels.priceBaseline?.quoteCount ?? null,
    priceBand: labels.priceBand?.value ?? "UNKNOWN",
    comparableCaptureRate: labels.collection && labels.collection.requested > 0 ? labels.collection.comparable / labels.collection.requested : null,
  };
}

export const sampleCandidateSchema = z.object({
  propertyId: z.string().min(1), unitId: z.string().min(1), listingId: z.string().min(1), source: z.string().min(1),
  profileKey: z.string().nullable(), termsKey: z.string().nullable(), identityReviewed: z.boolean(), labels: marketSampleLabelsSchema,
}).strict();
export type SampleCandidate = z.infer<typeof sampleCandidateSchema>;
export const sampleStratumTargetSchema = z.object({
  localityId: z.string().min(1), authorityId: z.string().min(1), regionId: z.string().min(1),
  accommodationType: sampleAccommodationType.exclude(["UNKNOWN"]), targetCount: z.number().int().positive().safe(),
  // Supply frame is unique properties of the same stratum, never listing counts or OTA search rank.
  eligibleSupplyProperties: z.number().int().positive().nullable(), supplyFrameRef: z.string().min(1).nullable(),
  supplyFrameAsOf: z.string().datetime().nullable(),
}).strict().superRefine((value, context) => {
  const known = [value.eligibleSupplyProperties, value.supplyFrameRef, value.supplyFrameAsOf].filter(item => item !== null).length;
  if (known !== 0 && known !== 3) context.addIssue({ code: "custom", message: "Supply count requires source and date" });
  if (value.eligibleSupplyProperties !== null && value.targetCount > value.eligibleSupplyProperties) context.addIssue({ code: "custom", message: "Target exceeds known property supply" });
});
export type SampleStratumTarget = z.infer<typeof sampleStratumTargetSchema>;
export function sampleStratumKey(labels: MarketSampleLabels): string | null {
  const geo = labels.geography;
  return geo ? JSON.stringify([geo.regionId, geo.authorityId, geo.localityId, labels.accommodationType.value]) : null;
}
const targetKey = (target: SampleStratumTarget) => JSON.stringify([target.regionId, target.authorityId, target.localityId, target.accommodationType]);

export function sampleEligibility(candidate: SampleCandidate) {
  const reasons: string[] = [];
  if (!candidate.identityReviewed) reasons.push("IDENTITY_REVIEW_REQUIRED");
  if (!candidate.labels.geography) reasons.push("GEOGRAPHY_UNVERIFIED");
  if (candidate.labels.accommodationType.value === "UNKNOWN") reasons.push("TYPE_UNKNOWN");
  if (!candidate.labels.unitKind || candidate.labels.unitKind.value === "UNKNOWN") reasons.push("UNIT_KIND_UNKNOWN");
  if (!candidate.labels.capacityGuests || candidate.labels.capacityGuests.value < 2) reasons.push("CAPACITY_NOT_VERIFIED_FOR_TWO_ADULTS");
  if (!candidate.profileKey) reasons.push("PROFILE_UNKNOWN");
  if (!candidate.termsKey) reasons.push("TERMS_UNKNOWN");
  const baseline = candidate.labels.priceBaseline;
  if (baseline && (baseline.profileKey !== candidate.profileKey || baseline.termsKey !== candidate.termsKey)) reasons.push("BASELINE_CONDITIONS_MISMATCH");
  return reasons;
}

function distanceKm(a: SampleCandidate, b: SampleCandidate) {
  const p = a.labels.geography!, q = b.labels.geography!, rad = Math.PI / 180;
  const sin = Math.sin((q.latitude - p.latitude) * rad / 2) ** 2 + Math.cos(p.latitude * rad) * Math.cos(q.latitude * rad) * Math.sin((q.longitude - p.longitude) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, sin)));
}

/** Deterministic quota-first proposal; not a probability sample or a representativeness guarantee. */
export function selectRepresentativeSamples(candidateInputs: SampleCandidate[], targetInputs: SampleStratumTarget[], expectedTotal?: number) {
  const candidates = candidateInputs.map(candidate => sampleCandidateSchema.parse(candidate));
  const targets = targetInputs.map(target => sampleStratumTargetSchema.parse(target));
  if (expectedTotal !== undefined) z.number().int().positive().safe().parse(expectedTotal);
  const allocated = targets.reduce((sum, target) => sum + target.targetCount, 0);
  if (expectedTotal !== undefined && allocated > expectedTotal) throw new Error("Allocation exceeds reviewed panel capacity");
  if (new Set(targets.map(targetKey)).size !== targets.length) throw new Error("Duplicate stratum target");
  const propertyStrata = new Map<string, Set<string>>();
  const identityOwners = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const key = sampleStratumKey(candidate.labels);
    if (key) propertyStrata.set(candidate.propertyId, new Set([...(propertyStrata.get(candidate.propertyId) ?? []), key]));
    for (const identity of [`unit:${candidate.unitId}`, `listing:${candidate.listingId}`])
      identityOwners.set(identity, new Set([...(identityOwners.get(identity) ?? []), candidate.propertyId]));
  }
  const reasonsFor = (candidate: SampleCandidate) => [...sampleEligibility(candidate),
    ...([`unit:${candidate.unitId}`, `listing:${candidate.listingId}`].some(key => identityOwners.get(key)!.size > 1) ? ["CONFLICTING_PROPERTY_IDENTITY"] : []),
    ...((propertyStrata.get(candidate.propertyId)?.size ?? 0) > 1 ? ["CONFLICTING_GEOGRAPHY_OR_TYPE"] : [])];
  const eligible = candidates.filter(candidate => reasonsFor(candidate).length === 0);
  const selected: SampleCandidate[] = [];
  const used = new Set<string>();
  const strata = [];
  // Scarce cells first. Stable IDs break ties; input order/ratings/OTA rank cannot dominate selection.
  for (const target of [...targets].sort((a, b) => eligible.filter(c => sampleStratumKey(c.labels) === targetKey(a)).length - eligible.filter(c => sampleStratumKey(c.labels) === targetKey(b)).length || targetKey(a).localeCompare(targetKey(b)))) {
    const key = targetKey(target), picked: SampleCandidate[] = [];
    const pool = eligible.filter(candidate => sampleStratumKey(candidate.labels) === key);
    const diversity = (candidate: SampleCandidate) => {
      const band = candidate.labels.priceBand?.value ?? "UNKNOWN", capacity = candidate.labels.capacityGuests!.value;
      const capacityBand = capacity <= 2 ? "TWO" : capacity <= 4 ? "THREE_FOUR" : "FIVE_PLUS";
      return `${band}|${capacityBand}|${candidate.labels.unitKind!.value}`;
    };
    while (picked.length < target.targetCount) {
      const available = pool.filter(candidate => !used.has(candidate.propertyId));
      if (!available.length) break;
      available.sort((a, b) => {
        const repeated = (candidate: SampleCandidate) => picked.filter(item => diversity(item) === diversity(candidate)).length;
        const spread = (candidate: SampleCandidate) => picked.length ? Math.min(...picked.map(item => distanceKm(candidate, item))) : 0;
        return repeated(a) - repeated(b) || spread(b) - spread(a) || a.propertyId.localeCompare(b.propertyId) || a.listingId.localeCompare(b.listingId) || a.unitId.localeCompare(b.unitId);
      });
      picked.push(available[0]); selected.push(available[0]); used.add(available[0].propertyId);
    }
    strata.push({ ...target, key, selectedCount: picked.length, shortfall: target.targetCount - picked.length,
      supplyExpansionFactor: target.eligibleSupplyProperties !== null && picked.length === target.targetCount ? target.eligibleSupplyProperties / picked.length : null });
  }
  const excluded = candidates.map(candidate => ({ propertyId: candidate.propertyId, listingId: candidate.listingId, reasons: reasonsFor(candidate) })).filter(item => item.reasons.length);
  return { status: "PROPOSAL_REQUIRES_REVIEW" as const, selected, strata, excluded,
    scope: { localities: new Set(selected.map(candidate => candidate.labels.geography!.localityId)).size,
      authorities: new Set(selected.map(candidate => candidate.labels.geography!.authorityId)).size,
      regions: new Set(selected.map(candidate => candidate.labels.geography!.regionId)).size,
      accommodationTypes: new Set(selected.map(candidate => candidate.labels.accommodationType.value)).size },
    publicationBlockers: [...(!targets.length ? ["GEOGRAPHY_TYPE_TARGETS_REQUIRED"] : []),
      ...(expectedTotal !== undefined && allocated < expectedTotal ? ["PILOT_ALLOCATION_INCOMPLETE"] : []),
      ...(strata.some(stratum => stratum.shortfall) ? ["STRATUM_SHORTFALL"] : []),
      ...(strata.some(stratum => stratum.eligibleSupplyProperties === null) ? ["SUPPLY_WEIGHTS_UNKNOWN"] : []),
      "FULL_MARKET_SUPPLY_FRAME_AND_COVERAGE_REVIEW_REQUIRED"] };
}
