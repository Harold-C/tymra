import { createHmac, timingSafeEqual } from "node:crypto";

export type AbuseOutcome = "ALLOW" | "CHALLENGE" | "COOLDOWN";

export function abuseOutcome(input: {
  deviceHour: number;
  deviceDay: number;
  ipHour: number;
  ipDay: number;
}): AbuseOutcome {
  const deviceSignal = input.deviceHour > 0 || input.deviceDay > 0;
  if (input.deviceHour >= 5 || input.deviceDay >= 15 || (deviceSignal && (input.ipHour >= 10 || input.ipDay >= 30))) return "COOLDOWN";
  if (input.deviceHour >= 4 || input.deviceDay >= 12 || input.ipHour >= 8 || input.ipDay >= 24) return "CHALLENGE";
  return "ALLOW";
}

export function issueDeterministicChallenge(subjectHash: string, secret: string, now = Date.now(), ttlMs = 5 * 60_000) {
  const expiresAt = now + ttlMs;
  const payload = `${subjectHash}.${expiresAt}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyDeterministicChallenge(token: string, subjectHash: string, secret: string, now = Date.now()) {
  const [tokenSubject, rawExpiry, supplied] = token.split(".");
  const expiresAt = Number(rawExpiry);
  if (!tokenSubject || tokenSubject !== subjectHash || !Number.isSafeInteger(expiresAt) || expiresAt <= now || !supplied) return false;
  const expected = signature(`${tokenSubject}.${expiresAt}`, secret);
  const actualBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export async function padNeutralResponse(startedAt: number, minimumMs: number, wait = defaultWait) {
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining > 0) await wait(remaining);
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function defaultWait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
