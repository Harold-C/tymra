import assert from "node:assert/strict";

import { createChallengeProvider } from "../apps/web/lib/server/security-controls";

const configuration = {
  mode: "managed" as const,
  secret: "controlled-session-secret-not-for-production",
  verifyUrl: "https://challenge.controlled.invalid/verify",
  siteKey: "controlled-site-key",
  providerSecret: "controlled-provider-secret-not-for-production",
};
const subjectHash = "a".repeat(64);

async function main() {
  const accepted = createChallengeProvider(configuration, async (url, init) => {
    assert.equal(url, configuration.verifyUrl);
    assert.deepEqual(init?.headers, {
      "content-type": "application/json",
      authorization: `Bearer ${configuration.providerSecret}`,
    });
    assert.deepEqual(JSON.parse(String(init?.body)), { token: "valid-controlled-token", subjectHash });
    return Response.json({ success: true });
  });
  assert.deepEqual(await accepted.issue(subjectHash), { mode: "managed", siteKey: configuration.siteKey });
  assert.equal(await accepted.verify("valid-controlled-token", subjectHash), true);

  const rejected = createChallengeProvider(configuration, async () => Response.json({ success: false }));
  assert.equal(await rejected.verify("invalid-controlled-token", subjectHash), false);
  assert.equal(await rejected.verify(undefined, subjectHash), false);

  const unavailable = createChallengeProvider(configuration, async () => {
    throw new DOMException("controlled timeout", "TimeoutError");
  });
  assert.equal(await unavailable.verify("valid-controlled-token", subjectHash), false);

  const malformed = createChallengeProvider(configuration, async () => Response.json({ accepted: true }));
  assert.equal(await malformed.verify("valid-controlled-token", subjectHash), false);

  process.stdout.write(`${JSON.stringify({
    ready: true,
    controlledOnly: true,
    managedIssueContract: true,
    validTokenAccepted: true,
    invalidTokenRejected: true,
    missingTokenRejected: true,
    timeoutFailedClosed: true,
    malformedResponseRejected: true,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Controlled managed challenge verification failed"}\n`);
  process.exitCode = 1;
});
