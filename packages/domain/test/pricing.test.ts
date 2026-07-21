import { describe, expect, it } from "vitest";

import { calculateEffectiveNightlyTotalMinor } from "../src";

describe("Effective Nightly Total", () => {
  it("includes all mandatory accommodation charges", () => {
    expect(
      calculateEffectiveNightlyTotalMinor({
        baseAmountMinor: 40_000,
        mandatoryFeesMinor: 6_000,
        taxesMinor: 6_900,
        platformFeesMinor: 2_100,
        nights: 2,
      }),
    ).toBe(27_500);
  });
});

