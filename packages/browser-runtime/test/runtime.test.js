import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BrowserPolicyError,
  LocalEvidenceStore,
  UlixeeBrowserSession,
  assertActionAllowed,
  cleanupExpiredEvidence,
  createReadOnlyActionPolicy,
  validateTargetUrl,
  markEvidenceParserFailure,
} from "../src/index.js";

test("browser sessions default to headed mode", () => {
  assert.equal(new UlixeeBrowserSession().headed, true);
  assert.equal(new UlixeeBrowserSession({ headed: false }).headed, false);
});

test("headed sessions do not keep Chrome alive after capture", async () => {
  let options = null;
  class FakeHero {
    constructor(value) { options = value; }
  }
  const session = new UlixeeBrowserSession({
    heroModule: { default: FakeHero, ConnectionToHeroCore: { remote: () => ({}) } },
  });
  await session.ensureHero();
  assert.equal(options.showChrome, true);
  assert.equal(options.showChromeAlive, false);
  assert.equal(options.sessionKeepAlive, false);
});

test("successful browser sessions export their reusable profile", async () => {
  const profile = { cookies: [{ name: "session", value: "persisted" }] };
  let saved = null;
  const session = new UlixeeBrowserSession({
    hero: { exportUserProfile: async () => profile },
    onProfileExport: async (value) => { saved = value; },
  });
  assert.deepEqual(await session.persistSuccessfulProfile(), { saved: true });
  assert.deepEqual(saved, profile);
});

test("read-only policy rejects mutating actions", () => {
  const policy = createReadOnlyActionPolicy();
  assert.equal(assertActionAllowed("open_url", policy), true);
  assert.throws(() => assertActionAllowed("submit", policy), (error) => error instanceof BrowserPolicyError && error.code === "ACTION_DENIED");
  assert.throws(() => assertActionAllowed("type", policy), (error) => error instanceof BrowserPolicyError && error.code === "ACTION_DENIED");
});

test("URL policy enforces approved public HTTPS hosts", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const accepted = await validateTargetUrl("https://www.example.com/page#fragment", { allowedHosts: ["example.com"], lookup });
  assert.equal(accepted.href, "https://www.example.com/page");
  await assert.rejects(validateTargetUrl("https://evil.test", { allowedHosts: ["example.com"], lookup }), { code: "HOST_NOT_ALLOWED" });
  await assert.rejects(validateTargetUrl("http://example.com", { allowedHosts: ["example.com"], lookup }), { code: "PROTOCOL_DENIED" });
  await assert.rejects(validateTargetUrl("https://user:pass@example.com", { allowedHosts: ["example.com"], lookup }), { code: "URL_CREDENTIALS_DENIED" });
  await assert.rejects(validateTargetUrl("https://example.com?access_token=secret", { allowedHosts: ["example.com"], lookup }), { code: "URL_QUERY_CREDENTIALS_DENIED" });
  await assert.rejects(validateTargetUrl("https://example.com", { allowedHosts: ["example.com"], lookup: async () => [{ address: "127.0.0.1", family: 4 }] }), { code: "PRIVATE_NETWORK_DENIED" });
});

test("controlled private fixture requires an explicit private-host exception", async () => {
  const lookup = async () => [{ address: "172.20.0.5", family: 4 }];
  await assert.rejects(validateTargetUrl("http://browser-fixture", { allowedHosts: ["browser-fixture"], allowHttp: true, lookup }), { code: "PRIVATE_NETWORK_DENIED" });
  const accepted = await validateTargetUrl("http://browser-fixture", { allowedHosts: ["browser-fixture"], allowHttp: true, allowPrivateNetwork: true, privateHosts: ["browser-fixture"], lookup });
  assert.equal(accepted.hostname, "browser-fixture");
});

test("evidence pointers contain relative paths, hashes and cleanup metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tymra-evidence-"));
  try {
    const store = new LocalEvidenceStore({ evidenceRoot: root, traceId: "trace-123" });
    const pointer = await store.recordArtifact({ kind: "html", artifact: "<html>test</html>" });
    assert.equal(pointer.relativePath, "trace-123/page.html");
    assert.equal(pointer.sizeBytes, 17);
    assert.match(pointer.sha256, /^[a-f0-9]{64}$/);
    await fs.utimes(path.join(root, "trace-123"), new Date(0), new Date(0));
    assert.deepEqual(await cleanupExpiredEvidence(root, 1), { deleted: 1 });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("cleanup retains failed evidence longer than successful evidence", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tymra-evidence-retention-"));
  try {
    for (const [traceId, status] of [["success-trace", "success"], ["failure-trace", "failed"]]) {
      const store = new LocalEvidenceStore({ evidenceRoot: root, traceId });
      await store.writeManifest({ status }, []);
      await fs.utimes(path.join(root, traceId), new Date(0), new Date(0));
    }
    const now = 100 * 3_600_000;
    assert.deepEqual(await cleanupExpiredEvidence(root, { successTtlHours: 72, failureTtlHours: 168 }, now), { deleted: 1 });
    assert.deepEqual((await fs.readdir(root)).sort(), ["failure-trace"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("an application parser-failure marker selects the longer evidence TTL", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tymra-evidence-parser-failure-"));
  try {
    const store = new LocalEvidenceStore({ evidenceRoot: root, traceId: "parser-failure-trace" });
    await store.writeManifest({ status: "success" }, []);
    await markEvidenceParserFailure(root, "parser-failure-trace");
    await fs.utimes(path.join(root, "parser-failure-trace"), new Date(0), new Date(0));
    assert.deepEqual(await cleanupExpiredEvidence(root, { successTtlHours: 72, failureTtlHours: 168 }, 100 * 3_600_000), { deleted: 0 });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
