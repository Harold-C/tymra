import { afterAll, beforeAll, expect } from "vitest";

// Synthetic HTTP responses keep real public parsers and persistence in the
// integration path. Real-source acceptance is a separate, authorized gate.
const nativeFetch = globalThis.fetch;
const unexpectedExternalRequests: string[] = [];
beforeAll(() => {
  globalThis.fetch = async (input, init) => {
    (init?.signal ?? (input instanceof Request ? input.signal : null))?.throwIfAborted();
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return nativeFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let content: string | undefined;
    let contentType = "text/html";
    if (url.href === "https://www.employment.govt.nz/leave-and-holidays/public-holidays/public-holidays-and-anniversary-dates") {
      content = `<h2>2026 public holiday and anniversary dates</h2><table><tr><th>Holiday</th><th>Actual Date</th><th>Observed date</th></tr><tr><td>Waitangi Day</td><td>6 February</td><td>Friday 6 February</td></tr></table><table><tr><th>Region</th><th>Actual Date</th><th>Observed date</th></tr><tr><td>Canterbury</td><td>16 December</td><td>Friday 13 November</td></tr></table>`;
    } else if (url.href === "https://www.education.govt.nz/school-terms-and-holidays-dates") {
      content = `<h2>2026 school holidays</h2><h3>Term 3</h3><p>Saturday 26 September to Sunday 11 October 2026.</p>`;
    } else if (url.origin === "https://api.geonet.org.nz"
      && ["/quake?MMI=3", "/volcano/val", "/quake/stats"].includes(url.pathname + url.search)) {
      content = JSON.stringify({ type: "FeatureCollection", features: [] });
      contentType = "application/vnd.geo+json;version=2";
    }
    if (content === undefined || !["GET", "HEAD"].includes(method)) {
      unexpectedExternalRequests.push(`${method} ${url.origin}${url.pathname}`);
      throw new Error("External HTTP has no integration fixture");
    }
    return new Response(method === "HEAD" ? null : content, { status: 200, headers: { "content-type": contentType } });
  };
});
afterAll(() => {
  globalThis.fetch = nativeFetch;
  expect(unexpectedExternalRequests).toEqual([]);
});
