import { describe, expect, it } from "vitest";
import { buildServiceEmail } from "../src/email-provider";

describe("purpose-specific verification email", () => {
  it.each(["en", "zh"] as const)("describes account verification without promising a report in %s", (locale) => {
    const input = { type: "VERIFY_AND_SIGN_IN" as const, locale, recipient: "synthetic@tymra.test", recipientHash: "synthetic-hash", from: "Tymra Test <test@tymra.test>", referenceId: "synthetic-reference", safeActionUrl: "https://tymra.test/en/auth/verify?token=synthetic" };
    const account = buildServiceEmail({ ...input, verificationPurpose: "VERIFY_CUSTOMER_EMAIL" });
    expect(account.subject).not.toMatch(/report|报告/iu);
    expect(account.subject).toMatch(locale === "en" ? /account email/iu : /账户邮箱/u);
    const unlock = buildServiceEmail({ ...input, verificationPurpose: "UNLOCK_FORMAL_CHECK" });
    expect(unlock.subject).toMatch(/report|报告/iu);
  });
});
