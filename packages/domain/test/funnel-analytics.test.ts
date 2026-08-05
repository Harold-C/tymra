import { describe, expect, it } from "vitest";

import { funnelEventSchema, funnelEventNames } from "../src/funnel-analytics";

describe("privacy-safe funnel analytics contract", () => {
  it("accepts every required aggregate event with bounded dimensions", () => {
    for (const name of funnelEventNames) {
      expect(funnelEventSchema.parse({
        name,
        dimensions: { locale: "en", platform: "booking.com", outcome: "ROUGH_READY", reused: false, isDemo: true },
      }).name).toBe(name);
    }
  });

  it.each(["email", "address", "listingUrl", "otaQuery", "magicToken", "sessionId", "reportContent"])(
    "rejects the forbidden %s analytics dimension",
    (field) => {
      expect(() => funnelEventSchema.parse({
        name: "rough_check_started",
        dimensions: { [field]: "sensitive-value" },
      })).toThrow();
    },
  );

  it("rejects URL- or email-shaped values in safe code dimensions", () => {
    expect(() => funnelEventSchema.parse({ name: "rough_check_started", dimensions: { platform: "https://example.test/listing?id=1" } })).toThrow();
    expect(() => funnelEventSchema.parse({ name: "rough_check_started", dimensions: { outcome: "person@example.test" } })).toThrow();
  });
});
