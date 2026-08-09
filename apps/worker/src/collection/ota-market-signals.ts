import { nzDateKey } from "@tymra/domain";

export const OTA_MARKET_SIGNAL_POLICY_VERSION = "ota-market-timeseries-v1";

export type OtaSignalObservation = {
  id: string; marketKey: string; region: string; providerKey: string; listingId: string;
  checkIn: Date; checkOut: Date; adults: number; units: number; collectedAt: Date;
  effectiveNightlyTotalMinor: number; availabilityStatus: string; minimumStay: number | null;
  restrictionReason: string | null; feeCompleteness: string;
};

export type DerivedOtaMarketSignal = {
  key: string; marketKey: string; region: string;
  type: "PRICE_RISING" | "AVAILABILITY_TIGHTENING" | "RESTRICTION_INCREASING";
  startsAt: Date; endsAt: Date; confidence: number; evidence: Record<string, unknown>;
};

export function deriveOtaMarketSignals(observations: readonly OtaSignalObservation[], asOf = new Date()): DerivedOtaMarketSignal[] {
  const currentStart = new Date(asOf.getTime() - 24 * 3_600_000);
  const baselineStart = new Date(asOf.getTime() - 72 * 3_600_000);
  const groups = new Map<string, OtaSignalObservation[]>();
  for (const observation of observations) {
    if (observation.collectedAt < baselineStart || observation.collectedAt > asOf) continue;
    const key = [observation.marketKey, day(observation.checkIn), day(observation.checkOut), observation.adults, observation.units].join("|");
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  const signals: DerivedOtaMarketSignal[] = [];
  for (const [groupKey, values] of groups) {
    const baseline = latestByListing(values.filter((value) => value.collectedAt >= baselineStart && value.collectedAt < currentStart));
    const current = latestByListing(values.filter((value) => value.collectedAt >= currentStart));
    const pairs = [...current.entries()].flatMap(([identity, currentValue]) => {
      const baselineValue = baseline.get(identity);
      return baselineValue ? [{ baseline: baselineValue, current: currentValue }] : [];
    });
    const providers = new Set(pairs.flatMap((pair) => [pair.baseline.providerKey, pair.current.providerKey]));
    if (pairs.length < 3 || providers.size < 2) continue;
    const sampleEvidence = { baselineObservationIds: pairs.map((pair) => pair.baseline.id).sort(), currentObservationIds: pairs.map((pair) => pair.current.id).sort(), matchedListingCount: pairs.length, providerKeys: [...providers].sort() };
    const common = { key: groupKey, marketKey: values[0]!.marketKey, region: values[0]!.region, startsAt: values[0]!.checkIn, endsAt: values[0]!.checkOut };

    const pricePairs = pairs.filter((pair) => isPriced(pair.baseline) && isPriced(pair.current));
    if (pricePairs.length >= 3 && new Set(pricePairs.map((pair) => pair.current.providerKey)).size >= 2) {
      const relativeChanges = pricePairs.map((pair) => (pair.current.effectiveNightlyTotalMinor - pair.baseline.effectiveNightlyTotalMinor) / pair.baseline.effectiveNightlyTotalMinor);
      const absoluteChanges = pricePairs.map((pair) => pair.current.effectiveNightlyTotalMinor - pair.baseline.effectiveNightlyTotalMinor);
      const relative = median(relativeChanges); const absolute = median(absoluteChanges);
      if (relative >= 0.05 && absolute >= 1_000) signals.push(signal(common, "PRICE_RISING", Math.min(0.95, 0.65 + pricePairs.length * 0.04), { ...sampleEvidence, priceMatchedListingCount: pricePairs.length, medianRelativeChange: relative, medianAbsoluteChangeMinor: absolute, minimumRelativeChange: 0.05, minimumAbsoluteChangeMinor: 1_000 }));
    }

    const baselineAvailable = ratio(pairs, (pair) => pair.baseline.availabilityStatus === "AVAILABLE");
    const currentAvailable = ratio(pairs, (pair) => pair.current.availabilityStatus === "AVAILABLE");
    const availabilityDrop = baselineAvailable - currentAvailable;
    if (availabilityDrop >= 0.2) signals.push(signal(common, "AVAILABILITY_TIGHTENING", Math.min(0.95, 0.65 + pairs.length * 0.04), { ...sampleEvidence, baselineAvailableShare: baselineAvailable, currentAvailableShare: currentAvailable, availabilityShareDrop: availabilityDrop, minimumShareChange: 0.2 }));

    const baselineRestricted = ratio(pairs, (pair) => isRestricted(pair.baseline));
    const currentRestricted = ratio(pairs, (pair) => isRestricted(pair.current));
    const restrictionIncrease = currentRestricted - baselineRestricted;
    if (restrictionIncrease >= 0.2) signals.push(signal(common, "RESTRICTION_INCREASING", Math.min(0.95, 0.65 + pairs.length * 0.04), { ...sampleEvidence, baselineRestrictedShare: baselineRestricted, currentRestrictedShare: currentRestricted, restrictionShareIncrease: restrictionIncrease, minimumShareChange: 0.2 }));
  }
  return signals.sort((left, right) => `${left.marketKey}|${day(left.startsAt)}|${left.type}`.localeCompare(`${right.marketKey}|${day(right.startsAt)}|${right.type}`));
}

function signal(common: Omit<DerivedOtaMarketSignal, "type" | "confidence" | "evidence">, type: DerivedOtaMarketSignal["type"], confidence: number, metrics: Record<string, unknown>): DerivedOtaMarketSignal {
  return { ...common, type, confidence, evidence: { policyVersion: OTA_MARKET_SIGNAL_POLICY_VERSION, direction: "POSITIVE", confidence, causalClaim: false, windows: { currentHours: 24, baselineStartHours: 72, baselineEndHours: 24 }, metrics } };
}
function latestByListing(values: OtaSignalObservation[]) { const result = new Map<string, OtaSignalObservation>(); for (const value of values.sort((left, right) => left.collectedAt.getTime() - right.collectedAt.getTime())) result.set(`${value.providerKey}:${value.listingId}`, value); return result; }
function isPriced(value: OtaSignalObservation) { return value.availabilityStatus === "AVAILABLE" && value.feeCompleteness === "COMPLETE" && value.effectiveNightlyTotalMinor > 0; }
function isRestricted(value: OtaSignalObservation) { return value.minimumStay !== null && value.minimumStay > 1 || ["MINIMUM_STAY_RESTRICTION", "CLOSED_TO_ARRIVAL"].includes(value.availabilityStatus) || Boolean(value.restrictionReason); }
function ratio<T>(values: T[], predicate: (value: T) => boolean) { return values.filter(predicate).length / values.length; }
function median(values: number[]) { const sorted = [...values].sort((left, right) => left - right); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function day(value: Date) { return nzDateKey(value); }
