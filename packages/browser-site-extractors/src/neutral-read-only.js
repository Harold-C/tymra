import { parseHTML } from "linkedom";

const CHALLENGE_SIGNALS = [
  /(?:complete|solve|enter|submit)(?: this| the)? (?:re)?captcha/i,
  /(?:re)?captcha (?:challenge|required|verification)/i,
  /i(?:'|’)m not a robot/i,
  /verify (?:that )?you are human/i,
  /access denied/i,
  /unusual traffic/i,
  /security check/i,
  /identity verified/i,
  /browsing activity has been paused/i,
  /make sure you(?:'|’)re not a bot/i,
  /sign in to continue/i,
  /log in to continue/i,
];
const CHALLENGE_MARKUP_SIGNALS = [/<abuse-component\b/i];
const TERMINAL_CHALLENGE_SIGNALS = [
  /browsing activity has been paused/i,
  /access denied/i,
  /verify (?:that )?you are human/i,
  /(?:complete|solve|enter|submit)(?: this| the)? (?:re)?captcha/i,
  /(?:re)?captcha (?:challenge|required|verification)/i,
  /i(?:'|’)m not a robot/i,
  /unusual traffic/i,
  /make sure you(?:'|’)re not a bot/i,
];
const CHALLENGE_POLL_INTERVAL_MS = 1_000;

export async function captureNeutralPage({ browserSession, evidenceStore, targetUrl, traceId, timeoutMs = 30_000, extractor, evidenceMode = "full", challengeSettleMs = 10_000, waitFor = wait }) {
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + timeoutMs;
  const runBrowser = (label, operation) => withDeadline(label, operation, deadline);
  const evidence = [];
  let page = null;
  try {
    await runBrowser("navigation", () => browserSession.openUrl(targetUrl, { timeoutMs: remainingMs(deadline) }));
    await runBrowser("page readiness", () => browserSession.waitForPageReady({ timeoutMs: remainingMs(deadline) }));
    const html = await runBrowser("HTML capture", () => browserSession.captureHtml());
    const title = await runBrowser("title capture", () => browserSession.getTitle());
    const finalUrl = await runBrowser("URL capture", () => browserSession.getUrl());
    if (html.trim().length < 20) throw new Error("Browser returned empty HTML");
    const initialChallenge = findChallenge(html, title);
    const screenshot = evidenceMode === "full" || initialChallenge ? await runBrowser("screenshot capture", () => browserSession.captureScreenshot({ fullPage: true })) : null;
    if (screenshot && (!Buffer.isBuffer(screenshot) || screenshot.byteLength < 100)) throw new Error("Browser returned an empty screenshot");

    const containsSensitiveData = containsSensitivePageData(html);
    if (screenshot) evidence.push(await evidenceStore.recordArtifact({ kind: evidenceMode === "full" ? "screenshot" : "challenge_initial_screenshot", fileName: evidenceMode === "full" ? undefined : "challenge-initial-screenshot.png", artifact: screenshot, containsSensitiveData }));
    evidence.push(await evidenceStore.recordArtifact({ kind: "html", artifact: html, containsSensitiveData }));
    const initialPage = { title, finalUrl, htmlBytes: Buffer.byteLength(html), screenshotBytes: screenshot?.byteLength ?? 0 };
    page = initialPage;
    let challenge = initialChallenge;
    let extractionHtml = html;
    let extractionTitle = title;
    let extractionUrl = finalUrl;
    let challengeEvidenceError = null;
    let challengeWait = null;
    if (challenge && challengeSettleMs > 0) {
      try {
        const settled = await waitForChallengeOutcome({ browserSession, maxWaitMs: Math.min(challengeSettleMs, remainingMs(deadline)), waitFor, runBrowser });
        const settledHtml = settled.html;
        const settledTitle = settled.title;
        const settledUrl = settled.url;
        const settledScreenshot = await runBrowser("challenge screenshot capture", () => browserSession.captureScreenshot({ fullPage: true }));
        if (!Buffer.isBuffer(settledScreenshot) || settledScreenshot.byteLength < 100) throw new Error("Browser returned an empty settled challenge screenshot");
        if (settledHtml.trim().length < 20) throw new Error("Browser returned empty settled challenge HTML");
        const settledSensitive = containsSensitivePageData(settledHtml);
        evidence.push(await evidenceStore.recordArtifact({ kind: "challenge_screenshot", fileName: "challenge-screenshot.png", artifact: settledScreenshot, containsSensitiveData: settledSensitive }));
        evidence.push(await evidenceStore.recordArtifact({ kind: "challenge_html", fileName: "challenge-page.html", artifact: settledHtml, containsSensitiveData: settledSensitive }));
        page = { title: settledTitle, finalUrl: settledUrl, htmlBytes: Buffer.byteLength(settledHtml), screenshotBytes: settledScreenshot?.byteLength ?? 0 };
        challenge = settled.challenge;
        challengeWait = { maxMs: challengeSettleMs, elapsedMs: settled.elapsedMs, outcome: settled.outcome };
        extractionHtml = settledHtml;
        extractionTitle = settledTitle;
        extractionUrl = settledUrl;
      } catch (error) {
        if (error?.code === "BROWSER_TASK_TIMEOUT") throw error;
        challengeEvidenceError = error instanceof Error ? error.message : String(error);
      }
    }
    const extracted = challenge ? null : extractor ? await runBrowser("page extraction", () => extractor({ html: extractionHtml, title: extractionTitle, finalUrl: extractionUrl })) : null;
    let profilePersistence = { attempted: false, saved: false };
    if (!challenge && typeof browserSession.persistSuccessfulProfile === "function") {
      try {
        const persisted = await runBrowser("profile export", () => browserSession.persistSuccessfulProfile());
        profilePersistence = { attempted: true, saved: persisted?.saved === true };
      } catch (error) {
        if (error?.code === "BROWSER_TASK_TIMEOUT") throw error;
        profilePersistence = { attempted: true, saved: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
    const result = {
      ok: !challenge,
      status: challenge ? "manual_required" : "success",
      traceId,
      taskType: "read_only_capture",
      startedAt,
      finishedAt: new Date().toISOString(),
      page,
      initialPage: initialChallenge ? initialPage : null,
      extracted,
      evidence,
      manualRequired: challenge ? { reason: "access_challenge_detected" } : null,
      challengeEvidenceError,
      challengeWait,
      profilePersistence,
      readonlyOnly: true,
      externalSideEffectsPerformed: false,
    };
    const resultEvidence = await evidenceStore.recordArtifact({ kind: "result_json", artifact: result, containsSensitiveData });
    const manifestEvidence = await evidenceStore.writeManifest(result, [...evidence, resultEvidence]);
    return { ...result, evidence: [...evidence, resultEvidence, manifestEvidence] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const category = /timed? ?out|timeout/i.test(message) ? "timeout" : /dns|net::|navigation|connection|certificate|ssl/i.test(message) ? "navigation_error" : "runtime_error";
    const failed = {
      ok: false,
      status: "failed",
      traceId,
      taskType: "read_only_capture",
      startedAt,
      finishedAt: new Date().toISOString(),
      page,
      evidence,
      error: { category, message, retryable: category !== "runtime_error" },
      manualRequired: null,
      readonlyOnly: true,
      externalSideEffectsPerformed: false,
    };
    const errorEvidence = await evidenceStore.recordArtifact({ kind: "error_json", artifact: failed.error });
    const manifestEvidence = await evidenceStore.writeManifest(failed, [...evidence, errorEvidence]);
    return { ...failed, evidence: [...evidence, errorEvidence, manifestEvidence] };
  } finally {
    await browserSession.close();
  }
}

async function waitForChallengeOutcome({ browserSession, maxWaitMs, waitFor, runBrowser }) {
  let elapsedMs = 0;
  let snapshot = null;
  while (elapsedMs < maxWaitMs) {
    const delayMs = Math.min(CHALLENGE_POLL_INTERVAL_MS, maxWaitMs - elapsedMs);
    await runBrowser("challenge wait", () => waitFor(delayMs));
    elapsedMs += delayMs;
    const html = await runBrowser("challenge HTML capture", () => browserSession.captureHtml());
    const title = await runBrowser("challenge title capture", () => browserSession.getTitle());
    const url = await runBrowser("challenge URL capture", () => browserSession.getUrl());
    if (html.trim().length < 20) throw new Error("Browser returned empty settled challenge HTML");
    const challenge = findChallenge(html, title);
    snapshot = { html, title, url, challenge, elapsedMs };
    if (!challenge) return { ...snapshot, outcome: "resolved" };
    if (isTerminalChallenge(html, title)) return { ...snapshot, outcome: "terminal_challenge" };
  }
  return { ...snapshot, outcome: "timeout" };
}

async function withDeadline(label, operation, deadline) {
  const timeoutMs = remainingMs(deadline);
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Browser task timed out during ${label}`);
          error.code = "BROWSER_TASK_TIMEOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function remainingMs(deadline) {
  return Math.max(1, deadline - Date.now());
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function findChallenge(html, title) {
  return CHALLENGE_SIGNALS.find((pattern) => pattern.test(`${title}\n${visiblePageText(html).slice(0, 250_000)}`))
    ?? CHALLENGE_MARKUP_SIGNALS.find((pattern) => pattern.test(html));
}

function isTerminalChallenge(html, title) {
  const content = `${title}\n${visiblePageText(html).slice(0, 250_000)}`;
  return TERMINAL_CHALLENGE_SIGNALS.some((pattern) => pattern.test(content));
}

function containsSensitivePageData(html) {
  const withoutDisabledPasswordFields = html.replace(/<input\b(?=[^>]*\btype=["']password["'])(?=[^>]*\bdisabled(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?)[^>]*>/gi, "");
  return /type=["']password["']|authorization|access[_-]?token/i.test(withoutDisabledPasswordFields);
}

function visiblePageText(html) {
  const { document } = parseHTML(html);
  for (const element of document.querySelectorAll("script,style,noscript,template")) element.remove();
  return (document.body?.textContent ?? "").replace(/\s+/g, " ").trim();
}
