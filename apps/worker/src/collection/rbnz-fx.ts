import type { PublicSignal } from "@tymra/providers";

export const RBNZ_FX_URL = "https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index";
export const RBNZ_FX_ALLOWED_HOSTS = ["www.rbnz.govt.nz", "rbnz.govt.nz"] as const;
export const RBNZ_FX_EXTRACTOR = "rbnz_fx";

export type RbnzFxExtraction = {
  extractor: "rbnz_fx";
  kind: "exchange_rates";
  title: string;
  canonicalUrl: string;
  asOf: string;
  previousAsOf: string | null;
  baseCurrency: "NZD";
  quoteConvention: "foreign_currency_units_per_NZD";
  rates: Array<{
    series: string;
    label: string;
    value: number;
    previousValue: number | null;
  }>;
  quality?: "complete" | "partial";
  missingFields?: string[];
  warnings?: string[];
  fieldSources?: Record<string, string>;
};

export function isRbnzFxExtraction(value: unknown): value is RbnzFxExtraction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.extractor === "rbnz_fx"
    && record.kind === "exchange_rates"
    && typeof record.canonicalUrl === "string"
    && /^20\d{2}-\d{2}-\d{2}$/.test(String(record.asOf ?? ""))
    && record.baseCurrency === "NZD"
    && Array.isArray(record.rates)
    && record.rates.every((rate) => isRate(rate));
}

export function normaliseRbnzFxSignals(extraction: RbnzFxExtraction, maxRecords = extraction.rates.length): PublicSignal[] {
  const startsAt = new Date(`${extraction.asOf}T00:00:00.000Z`);
  if (Number.isNaN(startsAt.getTime())) throw new Error("RBNZ B1 extraction has an invalid as-of date");
  const endsAt = new Date(startsAt.getTime() + 86_400_000);
  return extraction.rates.slice(0, maxRecords).map((rate) => {
    const percentageChange = rate.previousValue === null || rate.previousValue === 0
      ? null
      : (rate.value - rate.previousValue) / rate.previousValue;
    return {
      sourceId: "fx_rates",
      externalId: `rbnz-b1:${extraction.asOf}:${rate.series.toLowerCase()}`,
      marketKey: "new-zealand",
      type: "FX_RATE",
      title: rate.series === "TWI" ? "RBNZ trade weighted index" : `RBNZ NZD/${rate.series} exchange rate`,
      region: "New Zealand",
      startsAt,
      endsAt,
      direction: "UNKNOWN",
      confidence: 0.95,
      evidenceRef: `${extraction.canonicalUrl}#${rate.series.toLowerCase()}`,
      metadata: {
        series: rate.series,
        label: rate.label,
        value: rate.value,
        previousValue: rate.previousValue,
        percentageChange,
        asOf: extraction.asOf,
        previousAsOf: extraction.previousAsOf,
        baseCurrency: extraction.baseCurrency,
        quoteConvention: extraction.quoteConvention,
        argusQuality: extraction.quality ?? null,
        argusMissingFields: extraction.missingFields ?? [],
        argusWarnings: extraction.warnings ?? [],
        argusFieldSources: extraction.fieldSources ?? {},
      },
      fixture: false,
    };
  });
}

function isRate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.series === "string"
    && typeof record.label === "string"
    && typeof record.value === "number"
    && Number.isFinite(record.value)
    && (record.previousValue === null || (typeof record.previousValue === "number" && Number.isFinite(record.previousValue)));
}
