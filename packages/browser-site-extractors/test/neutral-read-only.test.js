import assert from "node:assert/strict";
import test from "node:test";

import { captureNeutralPage } from "../src/index.js";

test("neutral capture records rendered evidence and always closes the session", async () => {
  let closed = false;
  let profileSaves = 0;
  const recorded = [];
  const browserSession = {
    async openUrl() {},
    async waitForPageReady() {},
    async captureScreenshot() { return Buffer.alloc(256, 1); },
    async captureHtml() { return "<html><body>Rendered public rate page</body></html>"; },
    async getTitle() { return "Rendered"; },
    async getUrl() { return "https://example.com/rendered"; },
    async persistSuccessfulProfile() { profileSaves += 1; return { saved: true }; },
    async close() { closed = true; },
  };
  const evidenceStore = {
    async recordArtifact(input) {
      recorded.push(input.kind);
      return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false };
    },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({ browserSession, evidenceStore, targetUrl: "https://example.com", traceId: "trace" });
  assert.equal(result.status, "success");
  assert.equal(result.externalSideEffectsPerformed, false);
  assert.deepEqual(recorded, ["screenshot", "html", "result_json"]);
  assert.deepEqual(result.profilePersistence, { attempted: true, saved: true });
  assert.equal(profileSaves, 1);
  assert.equal(closed, true);
});

test("access challenges become manual_required instead of bypass attempts", async () => {
  let profileSaves = 0;
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {}, async captureScreenshot() { return Buffer.alloc(256); },
    async captureHtml() { return "<html><body>Verify that you are human</body></html>"; },
    async getTitle() { return "Security check"; }, async getUrl() { return "https://example.com"; },
    async persistSuccessfulProfile() { profileSaves += 1; return { saved: true }; }, async close() {},
  };
  const evidenceStore = {
    async recordArtifact(input) { return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false }; },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({ browserSession, evidenceStore, targetUrl: "https://example.com", traceId: "trace", challengeSettleMs: 0 });
  assert.equal(result.status, "manual_required");
  assert.equal(result.manualRequired.reason, "access_challenge_detected");
  assert.equal(profileSaves, 0);
});

test("Ticketmaster identity verification pages become manual_required", async () => {
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {}, async captureScreenshot() { return Buffer.alloc(256); },
    async captureHtml() { return "<html><head><noscript><title>Let's Get Your Identity Verified</title></noscript></head><body><abuse-component action=\"identify\"></abuse-component></body></html>"; },
    async getTitle() { return ""; }, async getUrl() { return "https://www.ticketmaster.co.nz/event/123"; }, async close() {},
  };
  const evidenceStore = {
    async recordArtifact(input) { return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false }; },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({ browserSession, evidenceStore, targetUrl: "https://www.ticketmaster.co.nz/event/123", traceId: "trace", challengeSettleMs: 0 });
  assert.equal(result.status, "manual_required");
  assert.equal(result.manualRequired.reason, "access_challenge_detected");
});

test("full evidence captures the initial and settled challenge states without interaction", async () => {
  let htmlCapture = 0;
  let screenshotCapture = 0;
  let waitedMs = 0;
  const recorded = [];
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {},
    async captureScreenshot() { screenshotCapture += 1; return Buffer.alloc(256, screenshotCapture); },
    async captureHtml() {
      htmlCapture += 1;
      return htmlCapture === 1
        ? "<html><body><abuse-component action=\"identify\">One moment please...</abuse-component></body></html>"
        : "<html><body><abuse-component action=\"identify\">Browsing Activity Has Been Paused</abuse-component></body></html>";
    },
    async getTitle() { return htmlCapture === 1 ? "" : "Your Browsing Activity Has Been Paused"; },
    async getUrl() { return "https://www.ticketmaster.co.nz/event/123"; }, async close() {},
  };
  const evidenceStore = {
    async recordArtifact(input) {
      recorded.push({ kind: input.kind, fileName: input.fileName });
      return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.fileName ?? input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false };
    },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({
    browserSession, evidenceStore, targetUrl: "https://www.ticketmaster.co.nz/event/123", traceId: "trace",
    challengeSettleMs: 10_000, waitFor: async (delayMs) => { waitedMs = delayMs; },
  });
  assert.equal(result.status, "manual_required");
  assert.equal(waitedMs, 1_000);
  assert.deepEqual(result.challengeWait, { maxMs: 10_000, elapsedMs: 1_000, outcome: "terminal_challenge" });
  assert.equal(screenshotCapture, 2);
  assert.equal(result.initialPage.title, "");
  assert.equal(result.page.title, "Your Browsing Activity Has Been Paused");
  assert.equal(result.challengeEvidenceError, null);
  assert.deepEqual(recorded.map((item) => item.kind), ["screenshot", "html", "challenge_screenshot", "challenge_html", "result_json"]);
  assert.deepEqual(recorded.slice(2, 4).map((item) => item.fileName), ["challenge-screenshot.png", "challenge-page.html"]);
});

test("a temporary interstitial resolves to successful extraction after the bounded wait", async () => {
  let htmlCapture = 0;
  let extractorInput = null;
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {}, async captureScreenshot() { return Buffer.alloc(256); },
    async captureHtml() {
      htmlCapture += 1;
      return htmlCapture === 1
        ? "<html><body><abuse-component action=\"identify\">One moment please...</abuse-component></body></html>"
        : "<html><body><main>Resolved public event detail</main></body></html>";
    },
    async getTitle() { return htmlCapture === 1 ? "" : "Resolved event"; },
    async getUrl() { return "https://www.ticketmaster.co.nz/event/123"; }, async close() {},
  };
  const evidenceStore = {
    async recordArtifact(input) { return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.fileName ?? input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false }; },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({
    browserSession, evidenceStore, targetUrl: "https://www.ticketmaster.co.nz/event/123", traceId: "trace",
    challengeSettleMs: 10_000, waitFor: async () => {},
    extractor(input) { extractorInput = input; return { eventId: "123" }; },
  });
  assert.equal(result.status, "success");
  assert.equal(result.manualRequired, null);
  assert.equal(result.initialPage.title, "");
  assert.equal(result.page.title, "Resolved event");
  assert.deepEqual(result.challengeWait, { maxMs: 10_000, elapsedMs: 1_000, outcome: "resolved" });
  assert.deepEqual(result.extracted, { eventId: "123" });
  assert.equal(extractorInput.html, "<html><body><main>Resolved public event detail</main></body></html>");
});

test("scheduled captures can omit screenshots while preserving HTML evidence", async () => {
  let screenshotCalls = 0;
  const recorded = [];
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {}, async captureScreenshot() { screenshotCalls += 1; return Buffer.alloc(256); },
    async captureHtml() { return "<html><body><input type=\"password\" disabled>Public event</body></html>"; },
    async getTitle() { return "Public event"; }, async getUrl() { return "https://example.com/event"; }, async close() {},
  };
  const evidenceStore = {
    async recordArtifact(input) { recorded.push(input); return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: input.containsSensitiveData }; },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({ browserSession, evidenceStore, targetUrl: "https://example.com/event", traceId: "trace", evidenceMode: "html" });
  assert.equal(screenshotCalls, 0);
  assert.equal(result.page.screenshotBytes, 0);
  assert.equal(recorded.find((item) => item.kind === "html").containsSensitiveData, false);
});

test("HTML-only scheduled captures retain challenge screenshots while settling passively", async () => {
  let htmlCapture = 0;
  let screenshotCalls = 0;
  const recorded = [];
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {},
    async captureScreenshot() { screenshotCalls += 1; return Buffer.alloc(256); },
    async captureHtml() { htmlCapture += 1; return htmlCapture === 1 ? "<html><body><abuse-component>One moment please...</abuse-component></body></html>" : "<html><body>Public detail</body></html>"; },
    async getTitle() { return htmlCapture === 1 ? "" : "Public detail"; },
    async getUrl() { return "https://www.ticketmaster.co.nz/sample/event/123"; }, async close() {},
  };
  const evidenceStore = {
    async recordArtifact(input) { recorded.push(input.kind); return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.fileName ?? input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false }; },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({ browserSession, evidenceStore, targetUrl: "https://www.ticketmaster.co.nz/sample/event/123", traceId: "trace", evidenceMode: "html", waitFor: async () => {}, extractor: () => ({ eventId: "123" }) });
  assert.equal(result.status, "success");
  assert.equal(screenshotCalls, 2);
  assert.deepEqual(recorded, ["challenge_initial_screenshot", "html", "challenge_screenshot", "challenge_html", "result_json"]);
});

test("HTML-only scheduled captures retain both screenshots when a challenge persists", async () => {
  let screenshotCalls = 0;
  const recorded = [];
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {},
    async captureScreenshot() { screenshotCalls += 1; return Buffer.alloc(256, screenshotCalls); },
    async captureHtml() { return "<html><body><abuse-component>Browsing Activity Has Been Paused</abuse-component></body></html>"; },
    async getTitle() { return ""; },
    async getUrl() { return "https://www.ticketmaster.co.nz/sample/event/123"; }, async close() {},
  };
  const evidenceStore = {
    async recordArtifact(input) { recorded.push({ kind: input.kind, fileName: input.fileName }); return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.fileName ?? input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false }; },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({ browserSession, evidenceStore, targetUrl: "https://www.ticketmaster.co.nz/sample/event/123", traceId: "trace", evidenceMode: "html", waitFor: async () => {} });
  assert.equal(result.status, "manual_required");
  assert.equal(screenshotCalls, 2);
  assert.deepEqual(recorded.slice(0, 4), [
    { kind: "challenge_initial_screenshot", fileName: "challenge-initial-screenshot.png" },
    { kind: "html", fileName: undefined },
    { kind: "challenge_screenshot", fileName: "challenge-screenshot.png" },
    { kind: "challenge_html", fileName: "challenge-page.html" },
  ]);
});

test("challenge phrases embedded only in scripts do not block a public page", async () => {
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {}, async captureScreenshot() { return Buffer.alloc(256); },
    async captureHtml() { return "<html><body><main>Public events</main><script>const translation = 'sign in to continue'</script></body></html>"; },
    async getTitle() { return "Public events"; }, async getUrl() { return "https://example.com/events"; }, async close() {},
  };
  const evidenceStore = {
    async recordArtifact(input) { return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false }; },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({ browserSession, evidenceStore, targetUrl: "https://example.com/events", traceId: "trace", evidenceMode: "html" });
  assert.equal(result.status, "success");
});

test("a normal reCAPTCHA-protected feedback footer is not an access challenge", async () => {
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {}, async captureScreenshot() { return Buffer.alloc(256); },
    async captureHtml() { return "<html><body><main>Public exchange rates</main><footer>This site is protected by reCAPTCHA and the Google Privacy Policy applies.</footer></body></html>"; },
    async getTitle() { return "Exchange rates"; }, async getUrl() { return "https://example.com/rates"; }, async close() {},
  };
  const evidenceStore = {
    async recordArtifact(input) { return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false }; },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({ browserSession, evidenceStore, targetUrl: "https://example.com/rates", traceId: "trace", evidenceMode: "html", extractor: () => ({ rates: 2 }) });
  assert.equal(result.status, "success");
  assert.deepEqual(result.extracted, { rates: 2 });
});

test("an explicit CAPTCHA instruction remains manual_required", async () => {
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {}, async captureScreenshot() { return Buffer.alloc(256); },
    async captureHtml() { return "<html><body>Please complete the CAPTCHA verification to continue.</body></html>"; },
    async getTitle() { return "Verification"; }, async getUrl() { return "https://example.com/check"; }, async close() {},
  };
  const evidenceStore = {
    async recordArtifact(input) { return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false }; },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({ browserSession, evidenceStore, targetUrl: "https://example.com/check", traceId: "trace", challengeSettleMs: 0 });
  assert.equal(result.status, "manual_required");
});

test("extractor failures retain rendered page evidence for diagnosis", async () => {
  let closed = false;
  let profileSaves = 0;
  const recorded = [];
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {}, async captureScreenshot() { return Buffer.alloc(256); },
    async captureHtml() { return "<html><body>Rendered event detail</body></html>"; },
    async getTitle() { return "Event detail"; }, async getUrl() { return "https://example.com/event/123"; },
    async persistSuccessfulProfile() { profileSaves += 1; return { saved: true }; },
    async close() { closed = true; },
  };
  const evidenceStore = {
    async recordArtifact(input) {
      recorded.push(input.kind);
      return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false };
    },
    async writeManifest(_result, artifacts) {
      assert.deepEqual(artifacts.map((item) => item.kind), ["screenshot", "html", "error_json"]);
      return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false };
    },
  };

  const result = await captureNeutralPage({
    browserSession,
    evidenceStore,
    targetUrl: "https://example.com/event/123",
    traceId: "trace",
    extractor() { throw new Error("Unsupported rendered page structure"); },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.page.finalUrl, "https://example.com/event/123");
  assert.deepEqual(recorded, ["screenshot", "html", "error_json"]);
  assert.deepEqual(result.evidence.map((item) => item.kind), ["screenshot", "html", "error_json", "manifest_json"]);
  assert.equal(profileSaves, 0);
  assert.equal(closed, true);
});

test("temporary challenge polling stops as soon as the public page resolves", async () => {
  let htmlCapture = 0;
  let waitedMs = 0;
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {}, async captureScreenshot() { return Buffer.alloc(256); },
    async captureHtml() {
      htmlCapture += 1;
      return htmlCapture <= 3
        ? "<html><body><abuse-component>One moment please...</abuse-component></body></html>"
        : "<html><body><main>Resolved after polling</main></body></html>";
    },
    async getTitle() { return htmlCapture <= 3 ? "" : "Resolved"; },
    async getUrl() { return "https://www.ticketmaster.co.nz/sample/event/123"; }, async close() {},
  };
  const evidenceStore = {
    async recordArtifact(input) { return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.kind}`, sha256: "a".repeat(64), sizeBytes: 256, containsSensitiveData: false }; },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({
    browserSession, evidenceStore, targetUrl: "https://www.ticketmaster.co.nz/sample/event/123", traceId: "trace",
    challengeSettleMs: 10_000, waitFor: async (delayMs) => { waitedMs += delayMs; }, extractor: () => ({ eventId: "123" }),
  });
  assert.equal(result.status, "success");
  assert.equal(waitedMs, 3_000);
  assert.deepEqual(result.challengeWait, { maxMs: 10_000, elapsedMs: 3_000, outcome: "resolved" });
});

test("the task deadline covers DOM capture and closes a hung session", async () => {
  let closed = false;
  const browserSession = {
    async openUrl() {}, async waitForPageReady() {},
    async captureHtml() { return new Promise(() => {}); },
    async close() { closed = true; },
  };
  const evidenceStore = {
    async recordArtifact(input) { return { kind: input.kind, traceId: "trace", relativePath: `trace/${input.kind}`, sha256: "a".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
    async writeManifest() { return { kind: "manifest_json", traceId: "trace", relativePath: "trace/manifest.json", sha256: "b".repeat(64), sizeBytes: 100, containsSensitiveData: false }; },
  };
  const result = await captureNeutralPage({ browserSession, evidenceStore, targetUrl: "https://example.com", traceId: "trace", timeoutMs: 20 });
  assert.equal(result.status, "failed");
  assert.equal(result.error.category, "timeout");
  assert.match(result.error.message, /timed out during HTML capture/);
  assert.equal(closed, true);
});
