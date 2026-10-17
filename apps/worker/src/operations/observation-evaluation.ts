import { addNzCalendarDays, evaluateObservationQuote, type ObservationCandidate } from "@tymra/domain";
import { otaResolveListingExtractionSchema, otaCollectRatesExtractionSchema } from "@tymra/providers/ota-argus-contracts";

export function observationListingId(candidate: ObservationCandidate) {
  if (candidate.source === "BOOKING") return new URL(candidate.sourceUrl).pathname.split("/").at(-1)!.replace(/\.html$/, "");
  return `${candidate.source.toLowerCase()}:${candidate.sourceListingId}`;
}

/** Map reviewed identity to this connector's ID; never select a different unit as a fallback. */
export function resolveObservationUnit(candidate: ObservationCandidate, extracted: unknown) {
  const data = otaResolveListingExtractionSchema.parse(extracted);
  if (data.provider.toUpperCase() !== candidate.source || data.sourceListingId !== observationListingId(candidate)) throw new Error("LISTING_IDENTITY_MISMATCH");
  if (candidate.source === "BOOKING" && !data.warnings.includes(`BOOKING_INTERNAL_PROPERTY_ID=${candidate.sourceListingId}`)) throw new Error("BOOKING_PROPERTY_ID_UNVERIFIED");
  let matches = data.units.filter(unit => {
    if (candidate.unit.kind === "SOURCE_ROOM_ID") return unit.externalId === (candidate.source === "EXPEDIA"
      ? `expedia:${candidate.sourceListingId}:room:${candidate.unit.key}` : candidate.unit.key);
    if (candidate.unit.kind === "ENTIRE_LISTING") {
      const bedrooms = /entire-(\d)BR/.exec(candidate.unit.key)?.[1];
      return unit.externalId === observationListingId(candidate) && unit.entireOrShared === "ENTIRE"
        && bedrooms !== undefined && unit.bedrooms === Number(bedrooms);
    }
    // Only the reviewed, explicit signature is supported, including area (not Executive Studio).
    return candidate.unit.key === "King-Studio|22m2|1-King|2-guests"
      && unit.officialName.toLowerCase() === "king studio" && unit.areaSquareMetres === 22
      && unit.capacity === 2 && unit.bedTypes.some(bed => /^1 King Beds?$/i.test(bed));
  });
  matches = matches.filter(unit => unit.capacity === null || unit.capacity >= 2);
  if (matches.length !== 1) throw new Error(matches.length ? "UNIT_IDENTITY_AMBIGUOUS" : "REVIEWED_UNIT_NOT_FOUND");
  return { externalId: matches[0].externalId, unit: matches[0], observedAt: data.observedAt };
}

export function evaluateCapturedObservation(candidate: ObservationCandidate, unitExternalId: string, checkIn: string, extracted: unknown, evidenceRef: string) {
  const data = otaCollectRatesExtractionSchema.parse(extracted);
  const checkOut = addNzCalendarDays(checkIn, candidate.nights);
  if (data.provider.toUpperCase() !== candidate.source || data.sourceListingId !== observationListingId(candidate)) throw new Error("LISTING_IDENTITY_MISMATCH");
  if (!data.rates.length || data.rates.some(rate => rate.sourceListingId !== data.sourceListingId || rate.unitExternalId !== unitExternalId)) throw new Error("EXACT_UNIT_NOT_RETURNED");
  if (data.rates.some(rate => rate.checkIn !== checkIn || rate.checkOut !== checkOut || rate.adults !== 2 || rate.children !== 0 || rate.units !== 1 || rate.currency !== "NZD")) throw new Error("STAY_CONTEXT_UNVERIFIED");
  const memberReferences = (rate: typeof data.rates[number]) => data.provider === "booking"
    && ["AVAILABLE", "UNKNOWN"].includes(rate.availabilityStatus)
    && (rate.availabilityStatus !== "UNKNOWN" || rate.rateFence === "REFERENCE_ONLY")
    ? (rate.referencePrices ?? []).filter(reference => reference.kind === "MEMBER_ONLY"
      && /^Members-only price\b/i.test(reference.sourceText)) : [];
  if (data.rates.some(rate => !["AVAILABLE", "MINIMUM_STAY_RESTRICTION", "UNAVAILABLE", "SOLD_OUT", "NOT_LISTED"].includes(rate.availabilityStatus)
    && !(rate.availabilityStatus === "UNKNOWN" && memberReferences(rate).length))) throw new Error("AVAILABILITY_OUTCOME_UNCLASSIFIED");
  // Preserve each offer independently; a refundable and non-refundable offer are not one price.
  const publicObservations = data.rates.filter(rate => rate.availabilityStatus !== "UNKNOWN").map(rate => evaluateObservationQuote(candidate, {
    candidateId: candidate.id, sourceUnitKey: candidate.unit.key, evidenceRef, observedAt: rate.collectedAt,
    checkIn, checkOut, nights: candidate.nights, adults: 2, children: 0, units: 1, currency: "NZD",
    // The current v1 connector does not attest the actual browser login/region/profile or booking mode.
    // Never manufacture public-profile evidence from configured intent or a historical screenshot.
    collectionProfile: null, bookingMode: "UNKNOWN",
    outcome: rate.availabilityStatus === "AVAILABLE" ? "QUOTED" : rate.availabilityStatus === "MINIMUM_STAY_RESTRICTION" ? "MIN_STAY_RESTRICTION"
      : ["UNAVAILABLE", "SOLD_OUT", "NOT_LISTED"].includes(rate.availabilityStatus) ? "UNAVAILABLE" : "SOURCE_FAILURE",
    totalMinor: rate.totalPriceMinor && rate.totalPriceMinor > 0 ? rate.totalPriceMinor : null,
    mandatoryFees: rate.totalIncludesMandatoryFees === true ? "COMPLETE" : "UNKNOWN",
    mealPlan: rate.mealPlan, cancellationPolicy: rate.cancellationPolicy, paymentTerms: rate.paymentTerms,
    rateFence: rate.rateFence, qualityFlags: rate.qualityFlags,
  }));
  // Visible membership amounts are useful observations, not proof that this guest can
  // book an anonymous public all-in total. Never attach a public row's terms to them.
  const seen = new Set<string>();
  const references = data.rates.flatMap(rate => memberReferences(rate).flatMap(reference => {
    const key = JSON.stringify([rate.unitExternalId, reference.ratePlanExternalId, reference.amountMinor, reference.sourceText]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...evaluateObservationQuote(candidate, {
      candidateId: candidate.id, sourceUnitKey: candidate.unit.key, evidenceRef, observedAt: rate.collectedAt,
      checkIn, checkOut, nights: candidate.nights, adults: 2, children: 0, units: 1, currency: "NZD",
      collectionProfile: null, bookingMode: "UNKNOWN", outcome: "MEMBER_REFERENCE",
      totalMinor: reference.amountMinor, mandatoryFees: "UNKNOWN", mealPlan: "UNKNOWN",
      cancellationPolicy: "UNKNOWN", paymentTerms: "UNKNOWN", rateFence: "MEMBER_ONLY",
      qualityFlags: [...new Set([...rate.qualityFlags.filter(flag => flag !== "NO_PRICE_FOR_REQUESTED_CONTEXT"),
        "MEMBER_PRICE_REFERENCE", "MEMBERSHIP_ELIGIBILITY_UNVERIFIED", "PUBLIC_PRICE_NOT_VERIFIED",
        "REFERENCE_AVAILABILITY_UNVERIFIED", "REFERENCE_OCCUPANCY_UNVERIFIED", "REFERENCE_FEES_AND_TERMS_UNVERIFIED"])],
    }), referencePrice: { ...reference, sourceAvailability: rate.availabilityStatus,
      priceBasis: "DISPLAYED_MEMBER_REFERENCE" as const } }];
  }));
  return [...publicObservations, ...references];
}
