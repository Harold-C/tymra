import { describe, expect, it } from "vitest";

import { redactPublicArtifact } from "../src/operations/public-artifact-redaction";

describe("public artifact redaction", () => {
  it("retains public ChristchurchNZ event dates while removing credentials", () => {
    const input = { event: { event_sessions: [{ id: 7, start_date: "2026-10-01T08:00:00", sessionToken: "secret", nested: { password: "secret", name: "Public event" } }], cookie: "secret" }, token: "secret" };
    expect(redactPublicArtifact(input, true)).toEqual({ event: { event_sessions: [{ id: 7, start_date: "2026-10-01T08:00:00", nested: { name: "Public event" } }] } });
    expect(redactPublicArtifact(input)).toEqual({ event: {} });
  });
});
