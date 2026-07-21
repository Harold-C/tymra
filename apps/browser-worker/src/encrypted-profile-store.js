import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const PROFILE_KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export class EncryptedProfileStore {
  constructor({ profileRoot, encryptionSecret }) {
    this.profileRoot = path.resolve(profileRoot);
    this.encryptionKey = createHash("sha256").update(String(encryptionSecret)).digest();
  }

  async load(profileKey) {
    const target = this.pathFor(profileKey);
    const raw = await fs.readFile(target, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") throw new Error("Unsupported browser profile envelope");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
  }

  async save(profileKey, profile) {
    const target = this.pathFor(profileKey);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(profile), "utf8"), cipher.final()]);
    const envelope = {
      version: 1,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(this.profileRoot, { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(envelope)}\n`, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, target);
    return { profileKey, updatedAt: envelope.updatedAt };
  }

  pathFor(profileKey) {
    if (!PROFILE_KEY.test(profileKey ?? "")) throw new Error("Invalid browser profile key");
    return path.join(this.profileRoot, `${profileKey}.enc.json`);
  }
}
