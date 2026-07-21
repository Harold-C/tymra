import { describe, expect, it } from "vitest";

import {
  decryptPersonalData,
  encryptPersonalData,
  hashOpaqueToken,
  issueOpaqueToken,
  verifyOpaqueToken,
} from "../src";

const secret = "test-only-secret-with-more-than-thirty-two-bytes";

describe("secure values", () => {
  it("issues at least 256 bits of opaque token material and stores a hash", () => {
    const issued = issueOpaqueToken(secret);
    expect(Buffer.from(issued.token, "base64url")).toHaveLength(32);
    expect(issued.tokenHash).not.toContain(issued.token);
    expect(verifyOpaqueToken(issued.token, issued.tokenHash, secret)).toBe(true);
    expect(verifyOpaqueToken(`${issued.token}x`, issued.tokenHash, secret)).toBe(false);
  });

  it("encrypts personal data with a randomized authenticated envelope", () => {
    const first = encryptPersonalData("person@example.test", secret);
    const second = encryptPersonalData("person@example.test", secret);
    expect(first).not.toBe(second);
    expect(decryptPersonalData(first, secret)).toBe("person@example.test");
  });

  it("uses keyed hashing for opaque tokens", () => {
    expect(hashOpaqueToken("same-token", secret)).not.toBe(hashOpaqueToken("same-token", `${secret}-different`));
  });
});

