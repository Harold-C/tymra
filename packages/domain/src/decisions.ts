import type {
  BlockingQualityFlag,
  ConfidenceLevel,
  FeeCompleteness,
  MarketStatus,
  PublicationDecision,
  RiskLevel,
} from "./enums";

export type ConfidenceInput = {
  competitorCount: number;
  freshestAgeHours: number | null;
  fees: FeeCompleteness;
  unitConfirmed: boolean;
  comparable: boolean;
  blockingFlags: readonly BlockingQualityFlag[];
};

export function determineConfidence(input: ConfidenceInput): ConfidenceLevel {
  if (
    input.competitorCount < 3 ||
    !input.unitConfirmed ||
    !input.comparable ||
    input.fees === "UNKNOWN" ||
    input.freshestAgeHours === null ||
    input.freshestAgeHours > 72 ||
    input.blockingFlags.length > 0
  ) {
    return "INSUFFICIENT";
  }

  if (input.competitorCount >= 8 && input.freshestAgeHours <= 24 && input.fees === "COMPLETE") {
    return "HIGH";
  }

  if (input.competitorCount >= 5 && input.freshestAgeHours <= 24) {
    return "MEDIUM";
  }

  return "LOW";
}

export type PublicationInput = {
  marketStatus: MarketStatus;
  propertyConfirmed: boolean;
  unitConfirmed: boolean;
  targetRatePresent: boolean;
  dataAgeHours: number | null;
  competitorCount: number;
  feeCompleteness: FeeCompleteness;
  blockingFlags: readonly BlockingQualityFlag[];
  unresolvedException: boolean;
  resultSchemaValid: boolean;
  confidence: ConfidenceLevel;
  risk: RiskLevel;
  highPriorityEvidenceCategories: number;
  highPrioritySecondValidationPassed: boolean | null;
  humanRepairableConflict: boolean;
};

export function decidePublication(input: PublicationInput): PublicationDecision {
  if (input.humanRepairableConflict) return "EXCEPTION";

  if (
    input.risk === "HIGH_PRIORITY" &&
    (input.highPriorityEvidenceCategories < 2 || input.highPrioritySecondValidationPassed !== true)
  ) {
    return "EXCEPTION";
  }

  if (
    input.marketStatus !== "SUPPORTED" ||
    !input.propertyConfirmed ||
    !input.unitConfirmed ||
    !input.targetRatePresent ||
    input.dataAgeHours === null ||
    input.dataAgeHours > 72 ||
    input.competitorCount < 3 ||
    input.feeCompleteness === "UNKNOWN" ||
    input.confidence === "INSUFFICIENT"
  ) {
    return "AUTO_RETURN";
  }

  if (input.blockingFlags.length > 0 || input.unresolvedException || !input.resultSchemaValid) {
    return "EXCEPTION";
  }

  if (
    input.dataAgeHours <= 24 &&
    input.competitorCount >= 5 &&
    input.feeCompleteness === "COMPLETE" &&
    input.confidence === "HIGH"
  ) {
    return "AUTO_PUBLISH";
  }

  if (input.dataAgeHours <= 24 && input.competitorCount >= 5 && input.confidence === "MEDIUM") {
    return "AUTO_PUBLISH_WITH_LIMITATIONS";
  }

  return "AUTO_RETURN";
}
