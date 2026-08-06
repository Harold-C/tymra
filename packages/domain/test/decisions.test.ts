import { describe, expect, it } from "vitest";

import { decidePublication, determineConfidence, type PublicationInput } from "../src";

const publishable: PublicationInput = {
  marketStatus: "SUPPORTED",
  propertyConfirmed: true,
  unitConfirmed: true,
  targetRatePresent: true,
  dataAgeHours: 2,
  competitorCount: 8,
  feeCompleteness: "COMPLETE",
  blockingFlags: [],
  unresolvedException: false,
  resultSchemaValid: true,
  confidence: "HIGH",
  risk: "REVIEW",
  highPriorityEvidenceCategories: 0,
  highPrioritySecondValidationPassed: null,
  humanRepairableConflict: false,
};

describe("confidence", () => {
  it.each([
    [8, 2, "COMPLETE", "HIGH"],
    [5, 2, "PARTIAL", "MEDIUM"],
    [3, 30, "PARTIAL", "LOW"],
    [2, 2, "COMPLETE", "INSUFFICIENT"],
  ] as const)("classifies %s competitors", (competitorCount, freshestAgeHours, fees, expected) => {
    expect(
      determineConfidence({
        competitorCount,
        freshestAgeHours,
        fees,
        unitConfirmed: true,
        comparable: true,
        blockingFlags: [],
      }),
    ).toBe(expected);
  });
});

describe("publication decision", () => {
  it("auto-publishes a high quality request", () => {
    expect(decidePublication(publishable)).toBe("AUTO_PUBLISH");
  });

  it("publishes medium confidence with limitations", () => {
    expect(
      decidePublication({
        ...publishable,
        competitorCount: 5,
        feeCompleteness: "PARTIAL",
        confidence: "MEDIUM",
      }),
    ).toBe("AUTO_PUBLISH_WITH_LIMITATIONS");
  });

  it("returns insufficient requests without manufacturing an exception", () => {
    expect(decidePublication({ ...publishable, competitorCount: 2, confidence: "INSUFFICIENT" })).toBe(
      "AUTO_RETURN",
    );
  });

  it("requires a passing second validation for high priority", () => {
    expect(
      decidePublication({
        ...publishable,
        risk: "HIGH_PRIORITY",
        highPriorityEvidenceCategories: 2,
        highPrioritySecondValidationPassed: false,
      }),
    ).toBe("EXCEPTION");

    expect(
      decidePublication({
        ...publishable,
        risk: "HIGH_PRIORITY",
        highPriorityEvidenceCategories: 2,
        highPrioritySecondValidationPassed: true,
      }),
    ).toBe("AUTO_PUBLISH");
  });
});
