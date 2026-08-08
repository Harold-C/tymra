import { describe, expect, it } from "vitest";

import { DEFAULT_OTA_MARKET_WEIGHTS, otaMarketWeight, sortOtaSourcesByMarketWeight } from "../src/operations/ota-source-priority";

describe("OTA discovery source priority", () => {
  it("uses the documented default New Zealand market-relevance order", () => {
    const sources = Object.keys(DEFAULT_OTA_MARKET_WEIGHTS)
      .reverse()
      .map((key) => ({ key, metadata: {} }));

    expect(sortOtaSourcesByMarketWeight(sources).map((source) => source.key)).toEqual([
      "booking",
      "airbnb",
      "expedia",
      "bookabach",
      "agoda",
      "trip",
      "wotif",
      "hotels",
      "vrbo",
    ]);
  });

  it("lets owned market evidence override bootstrap weights", () => {
    const sources = [
      { key: "booking", metadata: {} },
      { key: "trip", metadata: { marketWeight: 120 } },
      { key: "expedia", metadata: { marketWeight: 10 } },
    ];

    expect(sortOtaSourcesByMarketWeight(sources).map((source) => source.key)).toEqual(["trip", "booking", "expedia"]);
  });

  it("ignores invalid configured weights and remains deterministic on ties", () => {
    expect(otaMarketWeight({ key: "booking", metadata: { marketWeight: -1 } })).toBe(DEFAULT_OTA_MARKET_WEIGHTS.booking);
    expect(sortOtaSourcesByMarketWeight([
      { key: "trip", metadata: { marketWeight: 20 } },
      { key: "agoda", metadata: { marketWeight: 20 } },
    ]).map((source) => source.key)).toEqual(["agoda", "trip"]);
  });
});
