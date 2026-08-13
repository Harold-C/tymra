import { describe, expect, it } from "vitest";

import { safelyDecryptPersonalData } from "./admin-customer-data";

describe("safelyDecryptPersonalData", () => {
  it("returns readable personal data", () => {
    expect(safelyDecryptPersonalData("cipher", "key", () => "member@example.test")).toEqual({ value: "member@example.test", readable: true });
  });

  it("isolates a corrupt record instead of failing the whole list", () => {
    expect(safelyDecryptPersonalData("legacy", "key", () => { throw new Error("invalid authentication tag"); })).toEqual({ value: null, readable: false });
  });
});
