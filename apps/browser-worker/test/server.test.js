import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createBrowserWorkerConfig } from "../src/config.js";
import { createBrowserWorkerServer } from "../src/server.js";

test("browser worker defaults to headed mode with an explicit headless opt-out", () => {
  const token = "test-token-with-at-least-thirty-two-characters";
  assert.equal(createBrowserWorkerConfig({ BROWSER_WORKER_TOKEN: token }).headed, true);
  assert.equal(createBrowserWorkerConfig({ BROWSER_WORKER_TOKEN: token, BROWSER_WORKER_HEADED: "false" }).headed, false);
  assert.throws(() => createBrowserWorkerConfig({ BROWSER_WORKER_TOKEN: token, BROWSER_WORKER_HEADED: "sometimes" }), /Invalid boolean configuration/);
});

test("browser worker authenticates requests and accepts only the fixed task contract", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tymra-browser-server-"));
  const token = "test-token-with-at-least-thirty-two-characters";
  const config = {
    token, coreUrl: "ws://unused", evidenceRoot: root, timeoutMs: 5_000,
    concurrency: 1, evidenceTtlHours: 72, allowPrivateNetwork: false, privateHosts: [], allowHttp: false,
  };
  let capturedChallengeSettleMs = null;
  const capture = async ({ traceId, targetUrl, challengeSettleMs }) => {
    capturedChallengeSettleMs = challengeSettleMs;
    return ({
    ok: true, status: "success", traceId, taskType: "read_only_capture",
    page: { title: "Fixture", finalUrl: targetUrl, htmlBytes: 100, screenshotBytes: 200 }, evidence: [],
    readonlyOnly: true, externalSideEffectsPerformed: false,
    });
  };
  const server = createBrowserWorkerServer(config, {
    capture,
    sessionFactory: () => ({}),
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    skipPreflight: true,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${base}/internal/health`);
    assert.equal(health.status, 200);
    const healthPayload = await health.json();
    assert.equal(healthPayload.browserMode, "headed");
    assert.equal(healthPayload.profilePersistence, "encrypted_success_only");
    assert.equal((await fetch(`${base}/internal/browser-tasks`, { method: "POST", body: "{}" })).status, 401);
    const response = await fetch(`${base}/internal/browser-tasks`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ taskType: "read_only_capture", traceId: "server-test", url: "https://www.example.com", allowedHosts: ["example.com"] }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).externalSideEffectsPerformed, false);
    assert.equal(capturedChallengeSettleMs, 10_000);
    const unsupportedExtractor = await fetch(`${base}/internal/browser-tasks`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ taskType: "read_only_capture", traceId: "server-test-extractor", url: "https://example.com", allowedHosts: ["example.com"], extractor: "arbitrary-script" }),
    });
    assert.equal(unsupportedExtractor.status, 400);
    const excessiveWait = await fetch(`${base}/internal/browser-tasks`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ taskType: "read_only_capture", traceId: "server-test-wait", url: "https://example.com", allowedHosts: ["example.com"], challengeSettleMs: 30_001 }),
    });
    assert.equal(excessiveWait.status, 400);
    assert.equal((await excessiveWait.json()).error, "INVALID_CHALLENGE_SETTLE_MS");
    const invalidProfile = await fetch(`${base}/internal/browser-tasks`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ taskType: "read_only_capture", traceId: "server-test-profile", url: "https://example.com", allowedHosts: ["example.com"], profileKey: "../escape" }),
    });
    assert.equal(invalidProfile.status, 400);
    assert.equal((await invalidProfile.json()).error, "INVALID_PROFILE_KEY");
    const unsupported = await fetch(`${base}/internal/browser-tasks`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ taskType: "execute_script", traceId: "server-test-2", url: "https://example.com", allowedHosts: ["example.com"] }),
    });
    assert.equal(unsupported.status, 400);
    await fs.mkdir(path.join(root, "parser-failure-trace"));
    const parserFailure = await fetch(`${base}/internal/browser-evidence/parser-failure`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ traceId: "parser-failure-trace" }),
    });
    assert.equal(parserFailure.status, 200);
    assert.equal(await fs.readFile(path.join(root, "parser-failure-trace", ".parser-failure"), "utf8").then(Boolean), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("browser worker permits only one active task per persistent profile", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tymra-browser-profile-lock-"));
  const token = "test-token-with-at-least-thirty-two-characters";
  let releaseFirst;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const blocker = new Promise((resolve) => { releaseFirst = resolve; });
  const server = createBrowserWorkerServer({
    token, coreUrl: "ws://unused", evidenceRoot: root, timeoutMs: 5_000,
    concurrency: 2, evidenceTtlHours: 72, allowPrivateNetwork: false, privateHosts: [], allowHttp: false,
  }, {
    profileStore: { async load() { return null; }, async save() {} },
    sessionFactory: (body) => ({ profileKey: body.profileKey }),
    capture: async ({ traceId, targetUrl }) => {
      markStarted();
      await blocker;
      return { ok: true, status: "success", traceId, taskType: "read_only_capture", page: { title: "Fixture", finalUrl: targetUrl, htmlBytes: 100, screenshotBytes: 0 }, evidence: [], readonlyOnly: true, externalSideEffectsPerformed: false };
    },
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    skipPreflight: true,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const request = (traceId) => fetch(`${base}/internal/browser-tasks`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ taskType: "read_only_capture", traceId, url: "https://example.com", allowedHosts: ["example.com"], profileKey: "shared-source-v1" }),
  });
  try {
    const first = request("profile-lock-first");
    await started;
    const second = await request("profile-lock-second");
    assert.equal(second.status, 429);
    assert.equal((await second.json()).error, "PROFILE_CONCURRENCY_LIMIT");
    releaseFirst();
    assert.equal((await first).status, 200);
  } finally {
    releaseFirst();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});
