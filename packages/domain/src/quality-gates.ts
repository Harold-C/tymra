import type { BlockingQualityFlag } from "./enums";

export type QualityGateInput = {
  targetRatePresent: boolean;
  unitConfirmed: boolean;
  feesKnown: boolean;
  comparable: boolean;
  sourceRightsAllowed: boolean;
  sourceAvailable: boolean;
  severeConflict: boolean;
  freshnessExpired: boolean;
  snapshotCoherent: boolean;
  competitorCount: number;
};

export function evaluateBlockingQualityGates(input: QualityGateInput): BlockingQualityFlag[] {
  const flags: BlockingQualityFlag[] = [];
  if (!input.targetRatePresent) flags.push("TARGET_RATE_MISSING");
  if (!input.unitConfirmed) flags.push("UNIT_UNCONFIRMED");
  if (!input.feesKnown) flags.push("FEES_UNKNOWN");
  if (!input.comparable) flags.push("COMPARABILITY_FAILURE");
  if (!input.sourceRightsAllowed) flags.push("SOURCE_RIGHTS_BLOCKED");
  if (!input.sourceAvailable) flags.push("SOURCE_UNAVAILABLE");
  if (input.severeConflict) flags.push("SEVERE_CONFLICT");
  if (input.freshnessExpired) flags.push("FRESHNESS_EXPIRED");
  if (!input.snapshotCoherent) flags.push("SNAPSHOT_INCOHERENT");
  if (input.competitorCount < 3) flags.push("COMPETITOR_COUNT_BELOW_3");
  return flags;
}

export function freshnessWindowHours(horizonDays: number, eventSensitive: boolean): number {
  if (horizonDays <= 7 || eventSensitive) return 2;
  if (horizonDays <= 30) return 6;
  return 24;
}

export function negativeCacheTtlSeconds(reason: string): number {
  switch (reason) {
    case "SOLD_OUT":
    case "MINIMUM_STAY_RESTRICTION":
      return 30 * 60;
    case "LISTING_UNAVAILABLE":
      return 6 * 60 * 60;
    case "PLATFORM_ERROR":
      return 5 * 60;
    case "BLOCKED":
      return 24 * 60 * 60;
    case "QUERY_NOT_SUPPORTED":
      return 12 * 60 * 60;
    default:
      return 15 * 60;
  }
}
