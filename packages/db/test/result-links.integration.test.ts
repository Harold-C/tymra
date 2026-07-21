import { afterAll, describe, expect, it } from "vitest";

import { issueResultLink, prisma, resolveResultLink } from "../src";

const secret = "integration-result-secret-with-at-least-thirty-two-bytes";
const createdAccessIds: string[] = [];

describe("secure result links", () => {
  afterAll(async () => {
    await prisma.resultAccessToken.deleteMany({ where: { id: { in: createdAccessIds } } });
    await prisma.$disconnect();
  });

  it("stores only a hash and resolves a valid token", async () => {
    const result = await prisma.resultVersion.findFirstOrThrow({ where: { status: "PUBLISHED", isDemo: true } });
    const issued = await issueResultLink(result.id, secret, 14, new Date("2026-07-15T00:00:00.000Z"));
    createdAccessIds.push(issued.access.id);
    expect(issued.access.tokenHash).not.toContain(issued.token);

    const resolved = await resolveResultLink(issued.token, secret, new Date("2026-07-16T00:00:00.000Z"));
    expect(resolved.state).toBe("VALID");
    expect(resolved.result?.id).toBe(result.id);

  });

  it("does not return a property summary for invalid or expired tokens", async () => {
    expect(await resolveResultLink("invalid-token", secret)).toEqual({ state: "INVALID", result: null });

    const result = await prisma.resultVersion.findFirstOrThrow({ where: { status: "PUBLISHED", isDemo: true } });
    const issued = await issueResultLink(result.id, secret, 1, new Date("2026-01-01T00:00:00.000Z"));
    createdAccessIds.push(issued.access.id);
    expect(await resolveResultLink(issued.token, secret, new Date("2026-01-03T00:00:00.000Z"))).toEqual({
      state: "EXPIRED",
      result: null,
    });
  });
});
