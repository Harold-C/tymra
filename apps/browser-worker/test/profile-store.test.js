import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { EncryptedProfileStore } from "../src/encrypted-profile-store.js";

test("browser profiles are encrypted at rest and round-trip losslessly", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tymra-browser-profile-"));
  const profile = { cookies: [{ name: "session", value: "plaintext-secret-cookie" }], storage: { theme: "dark" } };
  try {
    const store = new EncryptedProfileStore({ profileRoot: root, encryptionSecret: "profile-test-secret" });
    await store.save("ticketmaster-nz-public-v1", profile);
    const target = path.join(root, "ticketmaster-nz-public-v1.enc.json");
    const encrypted = await fs.readFile(target, "utf8");
    assert.doesNotMatch(encrypted, /plaintext-secret-cookie|\"cookies\"/);
    assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
    assert.deepEqual(await store.load("ticketmaster-nz-public-v1"), profile);
    const wrongStore = new EncryptedProfileStore({ profileRoot: root, encryptionSecret: "wrong-secret" });
    await assert.rejects(wrongStore.load("ticketmaster-nz-public-v1"));
    assert.throws(() => store.pathFor("../escape"), /Invalid browser profile key/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
