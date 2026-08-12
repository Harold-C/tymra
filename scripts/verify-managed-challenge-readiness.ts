import { createHash } from "node:crypto";

async function main() {
  if (process.env.CHALLENGE_ACCEPTANCE_CONFIRM_INVALID_PROBE !== "YES") {
    throw new Error("CHALLENGE_ACCEPTANCE_CONFIRM_INVALID_PROBE=YES is required");
  }
  const verifyUrl = new URL(required("ABUSE_CHALLENGE_VERIFY_URL"));
  if (verifyUrl.protocol !== "https:") throw new Error("ABUSE_CHALLENGE_VERIFY_URL must use HTTPS");
  const providerSecret = required("ABUSE_CHALLENGE_SECRET");
  if (providerSecret.length < 32) throw new Error("ABUSE_CHALLENGE_SECRET must contain at least 32 characters");
  required("ABUSE_CHALLENGE_SITE_KEY");
  const subjectHash = createHash("sha256").update("tymra-managed-challenge-readiness-probe").digest("hex");
  const startedAt = Date.now();
  const response = await fetch(verifyUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${providerSecret}` },
    body: JSON.stringify({ token: "tymra-intentionally-invalid-readiness-token", subjectHash }),
    signal: AbortSignal.timeout(5_000),
  });
  let accepted = false;
  if (response.ok) {
    const payload = await response.json() as { success?: boolean };
    accepted = payload.success === true;
  }
  if (accepted) throw new Error("The managed challenge provider accepted an intentionally invalid token");
  process.stdout.write(`${JSON.stringify({ ready: true, invalidTokenRejected: true, responseStatus: response.status, latencyMs: Date.now() - startedAt })}\n`);
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Managed challenge readiness failed"}\n`);
  process.exitCode = 1;
});
