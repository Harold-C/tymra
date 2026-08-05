import { describe, expect, it } from "vitest";

import { classifyQueueFailure, queueFailureSummary } from "../src/operations/queue-governance";

describe("queue failure governance", () => {
  it("keeps external blocks and historical fixtures out of automatic retry", () => {
    expect(classifyQueueFailure({ status: "DEAD_LETTER", type: "EMAIL_DELIVERY", lastErrorCode: "DECRYPT_FAILED", lastErrorMessage: "old fixture key" })).toBe("HISTORICAL_FIXTURE");
    expect(classifyQueueFailure({ status: "FAILED", type: "EVENT_COLLECTION", lastErrorCode: "RIGHTS_BLOCKED", lastErrorMessage: null })).toBe("EXTERNAL_BLOCK");
    expect(classifyQueueFailure({ status: "FAILED", type: "EVENT_COLLECTION", lastErrorCode: "NETWORK_TIMEOUT", lastErrorMessage: null })).toBe("RETRY_ELIGIBLE");
  });

  it("produces a bounded audit summary without mutating jobs", () => {
    expect(queueFailureSummary([
      { status: "FAILED", type: "EVENT_COLLECTION", lastErrorCode: "NETWORK_TIMEOUT", lastErrorMessage: null },
      { status: "DEAD_LETTER", type: "EMAIL_DELIVERY", lastErrorCode: "DECRYPT_FAILED", lastErrorMessage: null },
    ])).toMatchObject({ RETRY_ELIGIBLE: 1, HISTORICAL_FIXTURE: 1 });
  });
});
