import { describe, expect, it } from "vitest";
import { directEventHttpFailure } from "../src/collection/direct-event-http";

describe("direct public event HTTP guard", () => {
  it("accepts only a complete HTTP 200 page", () => {
    expect(directEventHttpFailure("eventfinda", 200)).toBeNull();
    expect(directEventHttpFailure("eventfinda", 202)).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("stops on access restrictions without treating them as parser failures", () => {
    expect(directEventHttpFailure("ticketmaster", 403)).toMatchObject({ code: "RATE_LIMITED" });
    expect(directEventHttpFailure("ticketmaster", 429)).toMatchObject({ code: "RATE_LIMITED" });
    expect(directEventHttpFailure("ticketmaster", 500)).toMatchObject({ code: "SOURCE_UNAVAILABLE", retryable: true });
  });
});
