import { createHmac } from "node:crypto";

export const DEVELOPMENT_MEMBER_ACCOUNTS = [
  { email: "demo1@tymra.test", plan: "FREE" },
  { email: "demo2@tymra.test", plan: "HOST" },
  { email: "demo3@tymra.test", plan: "PRO" },
  { email: "demo4@tymra.test", plan: "PORTFOLIO" },
] as const;

export const DEVELOPMENT_MEMBER_EMAIL = DEVELOPMENT_MEMBER_ACCOUNTS[0].email;

type DevelopmentMemberEnvironment = {
  nodeEnv?: string;
  sessionSecret?: string;
  password?: string;
};

export function getDevelopmentMemberCredentials(
  environment: DevelopmentMemberEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    sessionSecret: process.env.SESSION_SECRET,
    password: process.env.MEMBER_DEV_PASSWORD,
  },
) {
  if (environment.nodeEnv !== "development") return undefined;

  const explicitPassword = environment.password?.trim() || undefined;
  if (explicitPassword && explicitPassword.length < 12) {
    throw new Error("MEMBER_DEV_PASSWORD must contain at least 12 characters");
  }

  const sessionSecret = environment.sessionSecret;
  if (!explicitPassword && (!sessionSecret || sessionSecret.length < 32)) {
    throw new Error("SESSION_SECRET must contain at least 32 characters to derive development member credentials");
  }

  const password = explicitPassword ?? createHmac("sha256", sessionSecret!)
    .update("tymra:development-member-password:v3")
    .digest("base64url");

  return { email: DEVELOPMENT_MEMBER_EMAIL, password };
}
