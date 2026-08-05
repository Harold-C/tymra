import { createHmac, timingSafeEqual } from "node:crypto";

export type AbuseOutcome = "ALLOW" | "CHALLENGE" | "COOLDOWN";
export type ChallengeDescriptor = { mode: "deterministic" | "managed"; token?: string; siteKey?: string };
export type ChallengeProvider = {
  mode: "disabled" | "deterministic" | "managed";
  issue(subjectHash: string): Promise<ChallengeDescriptor | null>;
  verify(token: string | undefined, subjectHash: string): Promise<boolean>;
};

export function createChallengeProvider(configuration: {
  mode: "disabled" | "deterministic" | "managed";
  secret: string;
  verifyUrl?: string;
  siteKey?: string;
  providerSecret?: string;
}, request: typeof fetch = fetch): ChallengeProvider {
  if (configuration.mode === "disabled") return { mode: "disabled", issue: async () => null, verify: async () => true };
  if (configuration.mode === "deterministic") return {
    mode: "deterministic",
    issue: async (subjectHash) => ({ mode: "deterministic", token: issueDeterministicChallenge(subjectHash, configuration.secret) }),
    verify: async (token, subjectHash) => Boolean(token && verifyDeterministicChallenge(token, subjectHash, configuration.secret)),
  };
  if (!configuration.verifyUrl || !configuration.siteKey) throw new Error("Managed challenge provider is incomplete");
  return {
    mode: "managed",
    issue: async () => ({ mode: "managed", siteKey: configuration.siteKey }),
    verify: async (token, subjectHash) => {
      if (!token) return false;
      try {
        const response = await request(configuration.verifyUrl!, {
          method: "POST",
          headers: { "content-type": "application/json", ...(configuration.providerSecret ? { authorization: `Bearer ${configuration.providerSecret}` } : {}) },
          body: JSON.stringify({ token, subjectHash }),
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) return false;
        const result = await response.json() as { success?: boolean };
        return result.success === true;
      } catch { return false; }
    },
  };
}

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
