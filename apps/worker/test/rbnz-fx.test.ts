import { describe, expect, it } from "vitest";

import { isRbnzFxExtraction, normaliseRbnzFxSignals, type RbnzFxExtraction } from "../src/collection/rbnz-fx";

describe("RBNZ B1 normalisation", () => {
  const extraction: RbnzFxExtraction = {
    extractor: "rbnz_fx",
    kind: "exchange_rates",
    title: "Exchange rates and TWI",
    canonicalUrl: "https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index",
    asOf: "2026-07-20",
    previousAsOf: "2026-07-17",
    baseCurrency: "NZD",
    quoteConvention: "foreign_currency_units_per_NZD",
    rates: [
      { series: "TWI", label: "17 currency basket", value: 66.94, previousValue: 66.87 },
      { series: "USD", label: "United States dollar", value: 0.58435, previousValue: 0.58375 },
    ],
  };

  it("validates and retains values in signal metadata", () => {
    expect(isRbnzFxExtraction(extraction)).toBe(true);
    expect(normaliseRbnzFxSignals(extraction, 1)).toEqual([
      expect.objectContaining({
        externalId: "rbnz-b1:2026-07-20:twi",
        type: "FX_RATE",
        startsAt: new Date("2026-07-19T12:00:00.000Z"),
        metadata: expect.objectContaining({ value: 66.94, previousValue: 66.87, baseCurrency: "NZD" }),
      }),
    ]);
  });

  it("rejects malformed numeric observations", () => {
    expect(isRbnzFxExtraction({ ...extraction, rates: [{ series: "USD", label: "USD", value: "bad", previousValue: null }] })).toBe(false);
  });
});
