import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { BrowserPolicyError } from "./action-policy.js";

const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);
const SENSITIVE_QUERY_KEY = /(?:^|[_-])(access[_-]?token|token|api[_-]?key|auth|authorization|credential|password|secret|session|signature)(?:$|[_-])/i;

export async function validateTargetUrl(input, options = {}) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new BrowserPolicyError("INVALID_URL", "Target URL is invalid");
  }

  const allowedHosts = normalizeAllowedHosts(options.allowedHosts);
  const allowHttp = options.allowHttp === true;
  if (url.username || url.password) throw new BrowserPolicyError("URL_CREDENTIALS_DENIED", "Credentials in target URLs are forbidden");
  if ([...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(`_${key}_`))) {
    throw new BrowserPolicyError("URL_QUERY_CREDENTIALS_DENIED", "Credential-like query parameters are forbidden");
  }
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    throw new BrowserPolicyError("PROTOCOL_DENIED", "Only HTTPS targets are allowed");
  }
  if (!hostIsAllowed(url.hostname, allowedHosts)) {
    throw new BrowserPolicyError("HOST_NOT_ALLOWED", `Target host is not approved: ${url.hostname}`);
  }
  if (!defaultPort(url)) throw new BrowserPolicyError("PORT_DENIED", "Non-default target ports are forbidden");

  const privateHostAllowed = options.allowPrivateNetwork === true
    && hostIsAllowed(url.hostname, normalizeAllowedHosts(options.privateHosts));
  if (!privateHostAllowed) {
    if (BLOCKED_HOSTS.has(url.hostname.toLowerCase()) || isPrivateAddress(url.hostname)) {
      throw new BrowserPolicyError("PRIVATE_NETWORK_DENIED", "Private and metadata network targets are forbidden");
    }
    const resolver = options.lookup ?? dnsLookup;
    let addresses;
    try {
      addresses = await resolver(url.hostname, { all: true, verbatim: true });
    } catch (error) {
      throw new BrowserPolicyError("DNS_LOOKUP_FAILED", `Target DNS lookup failed: ${error.message}`);
    }
    if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
      throw new BrowserPolicyError("PRIVATE_NETWORK_DENIED", "Target resolves to a private or reserved network");
    }
  }

  url.hash = "";
  return url;
}

export async function validateRedirectChain(input, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRedirects = options.maxRedirects ?? 5;
  let current = await validateTargetUrl(input, options);

  for (let index = 0; index <= maxRedirects; index += 1) {
    let response;
    try {
      response = await fetchImpl(current, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        headers: { "user-agent": "TymraBrowserPreflight/1.0" },
      });
    } catch {
      return current;
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return current;
    if (index === maxRedirects) throw new BrowserPolicyError("TOO_MANY_REDIRECTS", "Target exceeded the redirect limit");
    const location = response.headers.get("location");
    if (!location) throw new BrowserPolicyError("INVALID_REDIRECT", "Redirect response has no location");
    current = await validateTargetUrl(new URL(location, current).href, options);
  }
  return current;
}

export function hostIsAllowed(host, allowedHosts) {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return normalizeAllowedHosts(allowedHosts).some((allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`));
}

export function isPrivateAddress(value) {
  const host = String(value).toLowerCase().replace(/^\[|\]$/g, "");
  if (!isIP(host)) return false;
  if (host === "::" || host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("ff") || host.startsWith("2001:db8:")) return true;
  if (host.startsWith("::ffff:")) return isPrivateAddress(host.slice(7));
  const parts = host.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

function normalizeAllowedHosts(value = []) {
  return [...new Set(value.map((host) => String(host).trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "")).filter(Boolean))];
}

function defaultPort(url) {
  return !url.port || (url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80");
}
