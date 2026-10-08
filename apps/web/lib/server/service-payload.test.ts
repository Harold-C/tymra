import { describe, expect, it } from "vitest";
import { redactServicePayload } from "./service-payload";

describe("operational payload display", () => {
  it("retains request context while protecting nested secrets and URL credentials", () => {
    const result = redactServicePayload({ sourceId: "booking", querySignatureHash: "public-query-hash", sessionToken: "synthetic-secret", nested: { encryptedEmail: "synthetic-encrypted", url: "https://test-user:test-password@example.test/path?token=synthetic-token&date=2026-10-08" } });
    const output = JSON.stringify(result);
    expect(output).toContain("booking");
    expect(output).toContain("public-query-hash");
    expect(output).toContain("2026-10-08");
    for (const secret of ["synthetic-secret", "synthetic-encrypted", "synthetic-token", "test-password", "test-user"]) expect(output).not.toContain(secret);
  });
});
