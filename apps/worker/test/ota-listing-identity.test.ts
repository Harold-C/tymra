import { parseOtaListingReference } from "@tymra/providers";
import { describe, expect, it } from "vitest";

import { canonicalReferenceIdentityMatches } from "../src/services/worker-service";

describe("OTA listing identity bridging", () => {
  it("accepts an Agoda numeric extraction only when its canonical slug matches the submitted listing", () => {
    const reference = parseOtaListingReference("https://www.agoda.com/en-nz/novotel-christchurch-airport/hotel/christchurch-nz.html");
    expect(canonicalReferenceIdentityMatches(
      reference,
      "https://www.agoda.com/novotel-christchurch-airport/hotel/christchurch-nz.html",
    )).toBe(true);
    expect(canonicalReferenceIdentityMatches(
      reference,
      "https://www.agoda.com/a-different-hotel/hotel/christchurch-nz.html",
    )).toBe(false);
  });
});
