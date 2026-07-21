import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function hashOpaqueToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

export function issueOpaqueToken(secret: string): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashOpaqueToken(token, secret) };
}

export function verifyOpaqueToken(token: string, expectedHash: string, secret: string): boolean {
  const actual = Buffer.from(hashOpaqueToken(token, secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function encryptPersonalData(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptPersonalData(value: string, secret: string): string {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted value");

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashPersonalIdentifier(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value.trim().toLowerCase(), "utf8").digest("hex");
}

