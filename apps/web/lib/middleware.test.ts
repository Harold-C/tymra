import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import middleware from "../middleware";

describe("domain trust boundaries", () => {
  beforeEach(() => {
    process.env.PUBLIC_ORIGIN = "https://tymra.test";
    process.env.ADMIN_ORIGIN = "https://ops.tymra.test";
  });

  afterEach(() => vi.unstubAllEnvs());

  it("allows only the operations host in production admin-only mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_ONLY_ACCESS", "true");

    for (const url of [
      "https://tymra.test/en",
      "https://tymra.test/en/check",
      "https://tymra.test/api/v1/price-checks",
      "https://tymra.test/api/v1/admin/checks",
      "https://ops.tymra.test/en",
      "https://ops.tymra.test/api/v1/price-checks",
    ]) {
      const response = middleware(new NextRequest(url));
      expect(response.status, url).toBe(404);
      expect(response.headers.get("x-robots-tag"), url).toContain("noindex");
    }
    for (const url of ["https://ops.tymra.test/admin/sign-in", "https://ops.tymra.test/api/v1/admin/session"]) {
      const response = middleware(new NextRequest(url));
      expect(response.headers.get("x-middleware-next"), url).toBe("1");
      expect(response.headers.get("x-robots-tag"), url).toContain("noindex");
    }
  });

  it("does not trust a forwarded operations host on the public host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_ONLY_ACCESS", "true");
    const response = middleware(new NextRequest("https://tymra.test/admin/sign-in", {
      headers: { host: "tymra.test", "x-forwarded-host": "ops.tymra.test" },
    }));
    expect(response.status).toBe(404);
  });

  it("defaults to Admin-only access when production omits the access switch", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_ONLY_ACCESS", "");
    expect(middleware(new NextRequest("https://tymra.test/en")).status).toBe(404);
    expect(middleware(new NextRequest("https://ops.tymra.test/admin/sign-in")).headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects the legacy public Admin path to the operations host", () => {
    const response = middleware(new NextRequest("https://tymra.test/admin/sign-in"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://ops.tymra.test/admin/sign-in");
  });

  it("does not expose Admin APIs on the public host", async () => {
    const response = middleware(new NextRequest("https://tymra.test/api/v1/admin/checks"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Not found." } });
  });

  it("allows Admin pages on the operations host", () => {
    const response = middleware(new NextRequest("https://ops.tymra.test/admin/sign-in"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects non-Admin pages away from the operations host", () => {
    const response = middleware(new NextRequest("https://ops.tymra.test/en"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://ops.tymra.test/admin");
  });

  it("preserves the exact protected member route for standalone sign-in", () => {
    const response = middleware(new NextRequest("https://tymra.test/zh/account/calendar?pricingUnitId=unit-1"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://tymra.test/zh/sign-in?returnTo=%2Fzh%2Faccount%2Fcalendar%3FpricingUnitId%3Dunit-1");
  });

  it("forwards the protected return target for server-side session validation", () => {
    const request = new NextRequest("https://tymra.test/en/account/settings", { headers: { cookie: "tymra_customer_session=invalid" } });
    const response = middleware(request);
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://tymra.test/en/account/settings");
    expect(response.headers.get("x-middleware-request-x-tymra-return-to")).toBe("/en/account/settings");
  });
});
