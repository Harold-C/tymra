import assert from "node:assert/strict";
import test from "node:test";

import { extractRbnzFxPage } from "../src/index.js";

test("extracts the latest RBNZ B1 rates and their prior observations", () => {
  const html = `<table class="table--data">
    <thead><tr><th></th><th>17 Jul 2026</th><th>20 Jul 2026</th></tr></thead>
    <tbody>
      <tr><td colspan="3"><strong>TWI</strong></td></tr>
      <tr><td>17 currency basket</td><td>66.87</td><td class="table__cell--bold">66.94</td></tr>
      <tr><td colspan="3"><strong>Selected exchange rates</strong></td></tr>
      <tr><td>United States dollar</td><td>0.58375</td><td>0.58435</td></tr>
      <tr><td>European euro</td><td>0.51030</td><td>0.51095</td></tr>
    </tbody>
  </table>`;
  const result = extractRbnzFxPage({ html, title: "Exchange rates and TWI", finalUrl: "https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index?x=1" });
  assert.deepEqual(result, {
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
      { series: "EUR", label: "European euro", value: 0.51095, previousValue: 0.5103 },
    ],
  });
});

test("rejects unsupported hosts and missing B1 tables", () => {
  assert.throws(() => extractRbnzFxPage({ html: "", title: "x", finalUrl: "https://example.com" }), /Unsupported RBNZ host/);
  assert.throws(() => extractRbnzFxPage({ html: "<table></table>", title: "x", finalUrl: "https://www.rbnz.govt.nz/statistics" }), /no supported exchange-rate table/);
});
