import { describe, expect, it } from "vitest";

import { DEVELOPMENT_MEMBER_ACCOUNTS, DEVELOPMENT_MEMBER_EMAIL, getDevelopmentMemberCredentials } from "../src";

const sessionSecret = "session-secret-with-at-least-32-bytes";

describe("development member credentials", () => {
  it("provides deterministic local defaults without a stored password", () => {
    const first = getDevelopmentMemberCredentials({
      nodeEnv: "development",
      sessionSecret,
      password: "",
    });
    const second = getDevelopmentMemberCredentials({ nodeEnv: "development", sessionSecret });

    expect(first?.email).toBe(DEVELOPMENT_MEMBER_EMAIL);
    expect(first?.password).toBe(second?.password);
    expect(first?.password.length).toBeGreaterThanOrEqual(12);
  });

  it("defines one fixed account for every membership plan", () => {
    expect(DEVELOPMENT_MEMBER_ACCOUNTS).toEqual([
      { email: "demo1@tymra.test", plan: "FREE" },
      { email: "demo2@tymra.test", plan: "HOST" },
      { email: "demo3@tymra.test", plan: "PRO" },
      { email: "demo4@tymra.test", plan: "PORTFOLIO" },
    ]);
  });

  it("honours a valid shared development password override", () => {
    const credentials = getDevelopmentMemberCredentials({
      nodeEnv: "development",
      sessionSecret,
      password: "valid local override",
    });

    expect(credentials).toEqual({ email: DEVELOPMENT_MEMBER_EMAIL, password: "valid local override" });
  });

  it("never returns credentials outside development", () => {
    expect(getDevelopmentMemberCredentials({ nodeEnv: "production" })).toBeUndefined();
    expect(getDevelopmentMemberCredentials({ nodeEnv: "test" })).toBeUndefined();
  });

  it("rejects weak explicit passwords", () => {
    expect(() => getDevelopmentMemberCredentials({
      nodeEnv: "development",
      sessionSecret,
      password: "too-short",
    })).toThrow("at least 12 characters");
  });
});
