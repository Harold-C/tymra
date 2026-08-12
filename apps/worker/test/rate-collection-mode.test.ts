import { describe, expect, it } from "vitest";

import { usesFixtureRateCollection } from "../src/jobs/job-handlers";

describe("rate collection mode", () => {
  it("never routes live public collection through development fixture rates", () => {
    expect(usesFixtureRateCollection({ PROVIDER_MODE: "fixture", PUBLIC_COLLECTION_MODE: "live" })).toBe(false);
    expect(usesFixtureRateCollection({ PROVIDER_MODE: "demo", PUBLIC_COLLECTION_MODE: "live" })).toBe(false);
  });

  it("keeps deterministic fixtures available outside live public collection", () => {
    expect(usesFixtureRateCollection({ PROVIDER_MODE: "fixture", PUBLIC_COLLECTION_MODE: "fixture" })).toBe(true);
    expect(usesFixtureRateCollection({ PROVIDER_MODE: "demo", PUBLIC_COLLECTION_MODE: "fixture" })).toBe(true);
  });
});
