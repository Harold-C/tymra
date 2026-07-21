import { describe, expect, it } from "vitest";

import {
  InvalidPriceCheckTransitionError,
  assertPriceCheckTransition,
  canTransitionPriceCheck,
  priceCheckStatuses,
} from "../src";

describe("Price Check state machine", () => {
  it("allows the canonical main path", () => {
    const path = [
      "DRAFT",
      "VALIDATING",
      "QUEUED",
      "COLLECTING",
      "NORMALIZING",
      "ANALYSING",
      "AUTO_VALIDATING",
      "READY",
      "PUBLISHED",
    ] as const;

    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransitionPriceCheck(path[index], path[index + 1])).toBe(true);
    }
  });

  it("allows exception recovery only to documented states", () => {
    expect(canTransitionPriceCheck("EXCEPTION", "ANALYSING")).toBe(true);
    expect(canTransitionPriceCheck("EXCEPTION", "PUBLISHED")).toBe(false);
    expect(canTransitionPriceCheck("EXCEPTION", "ARCHIVED")).toBe(false);
  });

  it("rejects mutation of terminal history", () => {
    expect(() => assertPriceCheckTransition("WITHDRAWN", "PUBLISHED")).toThrow(
      InvalidPriceCheckTransitionError,
    );
    expect(canTransitionPriceCheck("ARCHIVED", "QUEUED")).toBe(false);
  });

  it("contains no forbidden synonymous statuses", () => {
    const forbidden = ["PROCESSING", "RETRY_LATER", "READY_TO_PUBLISH", "DATA_ERROR", "SOURCE_FAILED", "COMPLETED", "DONE"];
    expect(priceCheckStatuses.filter((status) => forbidden.includes(status))).toEqual([]);
  });
});

