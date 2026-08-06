import { describe, expect, it } from "vitest";

import { emptyEventImpactEvidence, evaluateEventImpactEvidence, mergeEventImpactEvidence } from "../src/event-impact";

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

  it("promotes independently sourced official scale and accommodation-demand evidence under v2", () => {
    const result = evaluateEventImpactEvidence({
      ...emptyEventImpactEvidence(),
      items: [
        { evidenceType: "OFFICIAL_SCALE_LABEL", value: "MAJOR", sourceUrl: "https://event.example.govt.nz/major-event", observedAt, confidence: 0.94 },
        { evidenceType: "CORROBORATING_DEMAND", value: "HIGH", sourceUrl: "https://accommodation.example.org.nz/demand", observedAt, confidence: 0.88 },
      ],
    });
    expect(result).toMatchObject({ status: "PROMOTED", score: 0.78, confidence: 0.88 });
  });

  it("does not promote a label alone or two claims from the same host", () => {
    const official = { evidenceType: "OFFICIAL_SCALE_LABEL" as const, value: "MAJOR" as const, sourceUrl: "https://example.govt.nz/event", observedAt, confidence: 0.95 };
    expect(evaluateEventImpactEvidence({ ...emptyEventImpactEvidence(), items: [official] }).status).toBe("PENDING_EVIDENCE");
    expect(evaluateEventImpactEvidence({
      ...emptyEventImpactEvidence(),
      items: [official, { evidenceType: "CORROBORATING_DEMAND", value: "MAJOR", sourceUrl: "https://demand.example.govt.nz/demand", observedAt, confidence: 0.9 }],
    }).status).toBe("PENDING_EVIDENCE");
  });

  it("merges independently collected bundles without duplicating evidence", () => {
    const attendance = { evidenceType: "EXPECTED_ATTENDANCE" as const, value: 70_000, unit: "people", sourceUrl: "https://events.example.nz/scale", observedAt, confidence: 0.9 };
    const merged = mergeEventImpactEvidence([
      { ...emptyEventImpactEvidence(), items: [attendance] },
      { ...emptyEventImpactEvidence(), items: [{ ...attendance, confidence: 0.95 }] },
    ]);
    expect(merged.policyVersion).toBe("event-impact-promotion-v2");
    expect(merged.items).toEqual([{ ...attendance, confidence: 0.95 }]);
  });
});
