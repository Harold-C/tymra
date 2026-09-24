import { MarketSignalType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { mapSignalType } from "../src/collection/market-signal-type";

describe("public signal persistence type", () => {
  it("accepts the generated database type for university calendar signals", () => {
    expect(mapSignalType("UNIVERSITY_CALENDAR")).toBe(MarketSignalType.UNIVERSITY_CALENDAR);
  });

  it("continues to reject unknown types before persistence", () => {
    expect(() => mapSignalType("UNKNOWN_SIGNAL")).toThrow("Unsupported public signal type");
  });
});
