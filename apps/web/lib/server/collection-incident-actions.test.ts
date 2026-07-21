import { describe, expect, it } from "vitest";

import { collectionIncidentActionSchema } from "./collection-incident-actions";

describe("collection incident action validation", () => {
  it("accepts supported actions with an operational reason", () => {
    for (const action of ["ACKNOWLEDGE", "RETRY", "PAUSE_SOURCE", "RESOLVE", "DISMISS"]) {
      expect(collectionIncidentActionSchema.safeParse({ action, reason: "Reviewed evidence" }).success).toBe(true);
    }
  });

  it("rejects unsupported actions and empty reasons", () => {
    expect(collectionIncidentActionSchema.safeParse({ action: "DELETE", reason: "Reviewed evidence" }).success).toBe(false);
    expect(collectionIncidentActionSchema.safeParse({ action: "RESOLVE", reason: "  " }).success).toBe(false);
  });
});
