import { describe, expect, it, vi } from "vitest";

import { abuseOutcome, issueDeterministicChallenge, padNeutralResponse, verifyDeterministicChallenge } from "./security-controls";

describe("customer funnel security controls", () => {
  it("escalates progressively without using IP as the only blocking signal", () => {
    expect(abuseOutcome({ deviceHour: 0, deviceDay: 0, ipHour: 9, ipDay: 0 })).toBe("CHALLENGE");
    expect(abuseOutcome({ deviceHour: 5, deviceDay: 5, ipHour: 0, ipDay: 0 })).toBe("COOLDOWN");
    expect(abuseOutcome({ deviceHour: 0, deviceDay: 0, ipHour: 10, ipDay: 0 })).toBe("CHALLENGE");
    expect(abuseOutcome({ deviceHour: 1, deviceDay: 1, ipHour: 10, ipDay: 0 })).toBe("COOLDOWN");
    expect(abuseOutcome({ deviceHour: 1, deviceDay: 2, ipHour: 2, ipDay: 3 })).toBe("ALLOW");
  });

  it("issues expiring subject-bound deterministic challenge proofs", () => {
    const token = issueDeterministicChallenge("device-a", "s".repeat(32), 1_000, 500);
    expect(verifyDeterministicChallenge(token, "device-a", "s".repeat(32), 1_499)).toBe(true);
    expect(verifyDeterministicChallenge(token, "device-b", "s".repeat(32), 1_499)).toBe(false);
    expect(verifyDeterministicChallenge(token, "device-a", "s".repeat(32), 1_500)).toBe(false);
  });

  it("pads only the remaining neutral-response timing window", async () => {
    const wait = vi.fn(async () => undefined);
    const now = vi.spyOn(Date, "now").mockReturnValue(1_080);
    await padNeutralResponse(1_000, 250, wait);
    expect(wait).toHaveBeenCalledWith(170);
    now.mockRestore();
  });
});
