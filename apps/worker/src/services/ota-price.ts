export function publicOtaPrice(rate: {
  basePriceMinor: number | null;
  mandatoryFeesMinor: number | null;
  taxesMinor: number | null;
  totalPriceMinor: number | null;
  nightlyPriceMinor?: number | null;
  priceStatus?: "ITEMIZED" | "BUNDLED" | "PARTIAL" | "UNAVAILABLE";
}, nights: number) {
  const itemized = rate.basePriceMinor !== null
    && rate.mandatoryFeesMinor !== null
    && rate.taxesMinor !== null
    && rate.totalPriceMinor !== null;
  const amountMinor = rate.totalPriceMinor ?? rate.nightlyPriceMinor ?? rate.basePriceMinor;
  if (amountMinor === null || amountMinor === undefined) return null;
  const basis = rate.totalPriceMinor !== null
    ? "STAY_TOTAL"
    : rate.nightlyPriceMinor !== null && rate.nightlyPriceMinor !== undefined
      ? "NIGHTLY"
      : "SOURCE_PUBLISHED";
  return {
    amountMinor,
    basis,
    feeCompleteness: itemized || rate.priceStatus === "ITEMIZED"
      ? "COMPLETE" as const
      : rate.priceStatus === "PARTIAL"
        ? "PARTIAL" as const
        : "UNKNOWN" as const,
    baseAmountMinor: itemized ? rate.basePriceMinor! : amountMinor,
    mandatoryFeesMinor: itemized ? rate.mandatoryFeesMinor! : 0,
    taxesMinor: itemized ? rate.taxesMinor! : 0,
    effectiveNightlyMinor: basis === "NIGHTLY" ? amountMinor : Math.round(amountMinor / Math.max(1, nights)),
  };
}
