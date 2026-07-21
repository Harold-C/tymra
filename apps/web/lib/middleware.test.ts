import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import middleware from "../middleware";

describe("domain trust boundaries", () => {
  beforeEach(() => {
    process.env.PUBLIC_ORIGIN = "https://tymra.test";
    process.env.ADMIN_ORIGIN = "https://ops.tymra.test";
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
});
