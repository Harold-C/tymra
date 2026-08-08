import { OTA_SOURCE_KEYS, type OtaSourceKey } from "./ota-health";

/**
 * New Zealand OTA discovery weights, based on June 2026 accommodation-site
 * traffic rank and 2025 completed-booking channel evidence. These are relative
 * priority scores, not claimed market-share percentages. Operators can replace
 * them with owned market evidence through DataSource.metadata.marketWeight.
 */
export const DEFAULT_OTA_MARKET_WEIGHTS: Readonly<Record<OtaSourceKey, number>> = {
  booking: 100,
  airbnb: 95,
  expedia: 90,
  bookabach: 85,
  agoda: 70,
  trip: 65,
  wotif: 55,
  hotels: 50,
  vrbo: 45,
};

type OtaPrioritySource = {
  key: string;
  metadata: unknown;
};

export function sortOtaSourcesByMarketWeight<T extends OtaPrioritySource>(sources: readonly T[]): T[] {
  return [...sources].sort((left, right) => {
    const weightDifference = otaMarketWeight(right) - otaMarketWeight(left);
    return weightDifference || left.key.localeCompare(right.key);
  });
}

export function otaMarketWeight(source: OtaPrioritySource): number {
  const configuredWeight = configuredMarketWeight(source.metadata);
  if (configuredWeight !== null) return configuredWeight;
  return isOtaSourceKey(source.key) ? DEFAULT_OTA_MARKET_WEIGHTS[source.key] : 0;
}

function configuredMarketWeight(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || !("marketWeight" in metadata)) return null;
  const value = metadata.marketWeight;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function isOtaSourceKey(key: string): key is OtaSourceKey {
  return (OTA_SOURCE_KEYS as readonly string[]).includes(key);
}
