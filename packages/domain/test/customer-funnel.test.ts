import { describe, expect, it } from "vitest";

import { unlockRoughResultSchema } from "../src/schemas";

const base = { email: "customer@tymra.test", serviceConsent: true as const, idempotencyKey: "customer-consent-0001" };

describe("customer funnel consent contract", () => {
  it("requires service consent and defaults marketing consent off", () => {
    expect(unlockRoughResultSchema.parse(base)).toMatchObject({ serviceConsent: true, marketingConsent: false });
    expect(() => unlockRoughResultSchema.parse({ ...base, serviceConsent: false })).toThrow();
  });

  it("preserves an explicit independent marketing choice", () => {
    expect(unlockRoughResultSchema.parse({ ...base, marketingConsent: true })).toMatchObject({
      serviceConsent: true,
      marketingConsent: true,
    });
  });
});
