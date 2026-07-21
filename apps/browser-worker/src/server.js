import { timingSafeEqual } from "node:crypto";
import http from "node:http";

import {
  BrowserPolicyError,
  LocalEvidenceStore,
  UlixeeBrowserSession,
  cleanupExpiredEvidence,
  markEvidenceParserFailure,
  validateRedirectChain,
  validateTargetUrl,
} from "@tymra/browser-runtime";
import { captureNeutralPage, extractEventfindaPage, extractRbnzFxPage, extractTicketmasterPage } from "@tymra/browser-site-extractors";
import { EncryptedProfileStore } from "./encrypted-profile-store.js";

const EXTRACTORS = Object.freeze({ eventfinda: extractEventfindaPage, ticketmaster: extractTicketmasterPage, rbnz_fx: extractRbnzFxPage });

export function createBrowserWorkerServer(config, dependencies = {}) {
  let activeTasks = 0;
  const activeProfiles = new Set();
  const headed = config.headed !== false;
  const profileStore = dependencies.profileStore ?? new EncryptedProfileStore({
    profileRoot: config.profileRoot ?? `${config.evidenceRoot}/profiles`,
    encryptionSecret: config.profileEncryptionSecret ?? config.token,
  });
  const sessionFactory = dependencies.sessionFactory ?? ((_body, profile) => new UlixeeBrowserSession({ coreUrl: config.coreUrl, headed, userProfile: profile.userProfile, onProfileExport: profile.onProfileExport }));
  const capture = dependencies.capture ?? captureNeutralPage;
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/internal/health") {
        return json(response, 200, { healthy: true, service: "tymra-browser-worker", activeTasks, activeProfiles: activeProfiles.size, concurrency: config.concurrency, browserMode: headed ? "headed" : "headless", profilePersistence: "encrypted_success_only" });
      }
      if (request.method === "GET" && request.url === "/internal/readiness") {
        return json(response, 200, { ready: activeTasks < config.concurrency, activeTasks });
      }
      if (request.method === "POST" && request.url === "/internal/browser-evidence/parser-failure") {
        if (!authorized(request.headers.authorization, config.token)) return json(response, 401, { error: "UNAUTHORIZED" });
        const body = await readJson(request, 4_096);
        if (typeof body.traceId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(body.traceId)) return json(response, 400, { error: "INVALID_TRACE_ID" });
        await markEvidenceParserFailure(config.evidenceRoot, body.traceId);
        return json(response, 200, { marked: true, traceId: body.traceId });
      }
      if (request.method !== "POST" || request.url !== "/internal/browser-tasks") return json(response, 404, { error: "NOT_FOUND" });
      if (!authorized(request.headers.authorization, config.token)) return json(response, 401, { error: "UNAUTHORIZED" });
      if (activeTasks >= config.concurrency) return json(response, 429, { error: "CONCURRENCY_LIMIT" });

      const body = validateRequest(await readJson(request, 65_536));
      const policy = {
        allowedHosts: body.allowedHosts,
        allowPrivateNetwork: config.allowPrivateNetwork,
        privateHosts: config.privateHosts,
        allowHttp: config.allowHttp,
        timeoutMs: Math.min(config.timeoutMs, 10_000),
        fetchImpl: dependencies.fetchImpl,
        lookup: dependencies.lookup,
      };
      const preflightUrl = dependencies.skipPreflight
        ? await validateTargetUrl(body.url, policy)
        : await validateRedirectChain(body.url, policy);
      if (body.profileKey && activeProfiles.has(body.profileKey)) return json(response, 429, { error: "PROFILE_CONCURRENCY_LIMIT" });
      activeTasks += 1;
      if (body.profileKey) activeProfiles.add(body.profileKey);
      try {
        const evidenceStore = new LocalEvidenceStore({ evidenceRoot: config.evidenceRoot, traceId: body.traceId });
        const userProfile = body.profileKey ? await profileStore.load(body.profileKey) : null;
        const result = await capture({
          browserSession: sessionFactory(body, {
            userProfile,
            onProfileExport: body.profileKey ? (profile) => profileStore.save(body.profileKey, profile) : null,
          }),
          evidenceStore,
          targetUrl: preflightUrl.href,
          traceId: body.traceId,
          timeoutMs: config.timeoutMs,
          extractor: body.extractor ? EXTRACTORS[body.extractor] : undefined,
          evidenceMode: body.evidenceMode,
          challengeSettleMs: body.challengeSettleMs,
        });
        if (result.page?.finalUrl) await validateTargetUrl(result.page.finalUrl, policy);
        return json(response, 200, result);
      } finally {
        if (body.profileKey) activeProfiles.delete(body.profileKey);
        activeTasks -= 1;
      }
    } catch (error) {
      if (error instanceof BrowserPolicyError) return json(response, 422, { error: error.code, message: error.message });
      const status = error?.code === "BODY_TOO_LARGE" ? 413 : error instanceof RequestValidationError ? 400 : 500;
      return json(response, status, { error: status === 500 ? "INTERNAL_ERROR" : error.code, message: error.message });
    }
  });

  const cleanup = () => cleanupExpiredEvidence(config.evidenceRoot, {
    successTtlHours: config.evidenceTtlHours,
    failureTtlHours: config.failureEvidenceTtlHours ?? config.evidenceTtlHours,
  }).catch(() => {});
  cleanup();
  const cleanupTimer = setInterval(cleanup, 15 * 60_000);
  cleanupTimer.unref();
  server.on("close", () => clearInterval(cleanupTimer));
  return server;
}

function validateRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestValidationError("INVALID_REQUEST", "JSON object required");
  if (value.taskType !== "read_only_capture") throw new RequestValidationError("UNSUPPORTED_TASK", "Only read_only_capture is supported");
  if (typeof value.traceId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value.traceId)) throw new RequestValidationError("INVALID_TRACE_ID", "Valid traceId required");
  if (typeof value.url !== "string" || value.url.length > 2_048) throw new RequestValidationError("INVALID_URL", "Valid URL required");
  if (!Array.isArray(value.allowedHosts) || value.allowedHosts.length < 1 || value.allowedHosts.length > 20 || value.allowedHosts.some((host) => typeof host !== "string" || host.length > 253)) {
    throw new RequestValidationError("INVALID_ALLOWED_HOSTS", "One or more approved hosts are required");
  }
  if (value.extractor !== undefined && (typeof value.extractor !== "string" || !Object.hasOwn(EXTRACTORS, value.extractor))) throw new RequestValidationError("UNSUPPORTED_EXTRACTOR", "Extractor is not approved");
  if (value.evidenceMode !== undefined && !["full", "html"].includes(value.evidenceMode)) throw new RequestValidationError("UNSUPPORTED_EVIDENCE_MODE", "Evidence mode is not approved");
  if (value.challengeSettleMs !== undefined && (!Number.isInteger(value.challengeSettleMs) || value.challengeSettleMs < 0 || value.challengeSettleMs > 30_000)) throw new RequestValidationError("INVALID_CHALLENGE_SETTLE_MS", "Challenge settle time must be between 0 and 30000 milliseconds");
  if (value.profileKey !== undefined && (typeof value.profileKey !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.profileKey))) throw new RequestValidationError("INVALID_PROFILE_KEY", "Browser profile key is invalid");
  return { taskType: value.taskType, traceId: value.traceId, url: value.url, allowedHosts: value.allowedHosts, extractor: value.extractor, evidenceMode: value.evidenceMode ?? "full", challengeSettleMs: value.challengeSettleMs ?? 10_000, profileKey: value.profileKey };
}

function authorized(header, expected) {
  if (!header?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

async function readJson(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new RequestValidationError("BODY_TOO_LARGE", "Request body is too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestValidationError("INVALID_JSON", "Request body must be valid JSON");
  }
}

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

class RequestValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
