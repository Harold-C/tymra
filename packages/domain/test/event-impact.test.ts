import { describe, expect, it } from "vitest";

import { emptyEventImpactEvidence, evaluateEventImpactEvidence } from "../src/event-impact";

describe("event impact evidence v1", () => {
  const observedAt = "2026-08-05T00:00:00.000Z";

  it("keeps missing, legacy and venue-capacity-only evidence pending", () => {
    expect(evaluateEventImpactEvidence({ reason: "ATTENDANCE_REQUIRED" })).toMatchObject({ status: "PENDING_EVIDENCE", score: null });
    expect(evaluateEventImpactEvidence({
      ...emptyEventImpactEvidence(),
      items: [{ evidenceType: "VENUE_CAPACITY", value: 3_600, unit: "people", sourceUrl: "https://www.tepae.co.nz/spaces/exhibition-hall", observedAt, confidence: 0.98 }],
    })).toMatchObject({ status: "PENDING_EVIDENCE", score: null });
  });

  it("promotes only sufficiently large, attributable attendance evidence", () => {
    const result = evaluateEventImpactEvidence({
      ...emptyEventImpactEvidence(),
      items: [{ evidenceType: "EXPECTED_ATTENDANCE", value: 70_000, unit: "people", sourceUrl: "https://www.theshow.co.nz/", observedAt, confidence: 0.96 }],
    });
    expect(result.status).toBe("PROMOTED");
    expect(result.score).toBeGreaterThan(0.75);
    expect(result.confidence).toBe(0.96);
  });

  it("rejects numeric evidence without a unit or a source URL", () => {
    expect(evaluateEventImpactEvidence({
      ...emptyEventImpactEvidence(),
      items: [{ evidenceType: "ACTUAL_ATTENDANCE", value: 70_000, observedAt, confidence: 0.9 }],
    }).evidence.validationIssues).toContain("INVALID_OR_LEGACY_EVIDENCE_SHAPE");
  });
});
