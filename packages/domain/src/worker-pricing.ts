import type { AvailabilityStatus, ConfidenceLevel } from "./enums";

export type ComparableRate = {
  sellableUnitId: string;
  listingId: string;
  dedupeKey?: string;
  amountMinor: number | null;
  availabilityStatus: AvailabilityStatus | "SOURCE_FAILURE";
  comparabilityScore: number;
  collectedAt: Date;
  feeComplete: boolean;
};

export type CompressionCounts = {
  eligible: number;
  available: number;
  restricted: number;
  unavailable: number;
  dataMissing: number;
  sourceFailure: number;
  compression: number | null;
};

export function collapseDuplicateListings(rates: readonly ComparableRate[]): ComparableRate[] {
  const byUnit = new Map<string, ComparableRate>();
  for (const rate of rates) {
    const key = rate.dedupeKey ?? rate.sellableUnitId;
    const current = byUnit.get(key);
    if (!current || compareRepresentative(rate, current) < 0) byUnit.set(key, rate);
  }
  return [...byUnit.values()];
}

export function calculateAvailabilityCompression(rates: readonly ComparableRate[]): CompressionCounts {
  const unique = collapseDuplicateListings(rates);
  const result: CompressionCounts = {
    eligible: unique.length,
    available: 0,
    restricted: 0,
    unavailable: 0,
    dataMissing: 0,
    sourceFailure: 0,
    compression: null,
  };
  for (const rate of unique) {
    if (rate.availabilityStatus === "AVAILABLE") result.available += 1;
    else if (rate.availabilityStatus === "CLOSED_TO_ARRIVAL" || rate.availabilityStatus === "MINIMUM_STAY_RESTRICTION") result.restricted += 1;
    else if (rate.availabilityStatus === "SOLD_OUT" || rate.availabilityStatus === "LISTING_UNAVAILABLE") result.unavailable += 1;
    else if (rate.availabilityStatus === "SOURCE_FAILURE" || rate.availabilityStatus === "PLATFORM_ERROR") result.sourceFailure += 1;
    else result.dataMissing += 1;
  }
  const observed = result.available + result.restricted + result.unavailable;
  result.compression = observed > 0 ? (result.restricted + result.unavailable) / observed : null;
  return result;
}

export type PriceDistribution = {
  count: number;
  weightedMedianMinor: number | null;
  lowerQuartileMinor: number | null;
  upperQuartileMinor: number | null;
  minimumMinor: number | null;
  maximumMinor: number | null;
};

export function calculatePriceDistribution(rates: readonly ComparableRate[]): PriceDistribution {
  const eligible = collapseDuplicateListings(rates)
    .filter((rate): rate is ComparableRate & { amountMinor: number } => rate.availabilityStatus === "AVAILABLE" && rate.amountMinor !== null && rate.feeComplete)
    .sort((left, right) => left.amountMinor - right.amountMinor);
  if (!eligible.length) return { count: 0, weightedMedianMinor: null, lowerQuartileMinor: null, upperQuartileMinor: null, minimumMinor: null, maximumMinor: null };
  return {
    count: eligible.length,
    weightedMedianMinor: weightedPercentile(eligible, 0.5),
    lowerQuartileMinor: weightedPercentile(eligible, 0.25),
    upperQuartileMinor: weightedPercentile(eligible, 0.75),
    minimumMinor: eligible[0].amountMinor,
    maximumMinor: eligible[eligible.length - 1].amountMinor,
  };
}

export function calculateTargetPercentile(targetAmountMinor: number, rates: readonly ComparableRate[]): number | null {
  const amounts = collapseDuplicateListings(rates)
    .filter((rate): rate is ComparableRate & { amountMinor: number } => rate.availabilityStatus === "AVAILABLE" && rate.amountMinor !== null && rate.feeComplete)
    .map((rate) => rate.amountMinor)
    .sort((a, b) => a - b);
  if (!amounts.length) return null;
  return amounts.filter((amount) => amount <= targetAmountMinor).length / amounts.length;
}

export function confidenceForDate(input: {
  competitorCount: number;
  freshnessHours: number | null;
  feeComplete: boolean;
  maxSkewMinutes: number | null;
  horizonDays: number;
  blockingFlags: readonly string[];
}): { level: ConfidenceLevel; score: number; components: Record<string, number> } {
  const freshness = input.freshnessHours === null ? 0 : input.freshnessHours <= 6 ? 1 : input.freshnessHours <= 24 ? 0.8 : input.freshnessHours <= 72 ? 0.35 : 0;
  const coverage = Math.min(1, input.competitorCount / 8);
  const feeQuality = input.feeComplete ? 1 : 0.45;
  const skewLimit = input.horizonDays <= 7 ? 120 : 360;
  const coherence = input.maxSkewMinutes === null ? 0 : input.maxSkewMinutes <= skewLimit ? 1 : Math.max(0, 1 - (input.maxSkewMinutes - skewLimit) / 720);
  const score = Math.round((freshness * 0.3 + coverage * 0.35 + feeQuality * 0.2 + coherence * 0.15) * 100) / 100;
  const blocked = input.blockingFlags.length > 0 || input.competitorCount < 3;
  const level: ConfidenceLevel = blocked ? "INSUFFICIENT" : input.competitorCount >= 8 && score >= 0.8 ? "HIGH" : input.competitorCount >= 5 && score >= 0.6 ? "MEDIUM" : "LOW";
  return { level, score, components: { freshness, coverage, feeQuality, coherence } };
}

function compareRepresentative(left: ComparableRate, right: ComparableRate): number {
  if (left.feeComplete !== right.feeComplete) return left.feeComplete ? -1 : 1;
  if (left.comparabilityScore !== right.comparabilityScore) return right.comparabilityScore - left.comparabilityScore;
  return right.collectedAt.getTime() - left.collectedAt.getTime();
}

function weightedPercentile(rates: Array<ComparableRate & { amountMinor: number }>, percentile: number): number {
  const totalWeight = rates.reduce((sum, rate) => sum + Math.max(0.01, rate.comparabilityScore), 0);
  const threshold = totalWeight * percentile;
  let cumulative = 0;
  for (const rate of rates) {
    cumulative += Math.max(0.01, rate.comparabilityScore);
    if (cumulative >= threshold) return rate.amountMinor;
  }
  return rates[rates.length - 1].amountMinor;
}
