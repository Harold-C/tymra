import assert from "node:assert/strict";

import { chromium } from "playwright";

const base = process.env.TYMRA_HIDDEN_BASE_URL;
if (!base) throw new Error("TYMRA_HIDDEN_BASE_URL is required");
const origin = new URL(base);
if (!["localhost", "127.0.0.1", "::1"].includes(origin.hostname)) {
  throw new Error("Hidden-discovery browser verification is restricted to a local candidate");
}

const browser = await chromium.launch({ headless: true });
try {
  for (const locale of ["en", "zh"]) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      try {
        const response = await page.goto(new URL(`/${locale}`, origin).href, { waitUntil: "domcontentloaded" });
        assert.equal(response?.status(), 200, `${locale} home must load`);
        await page.waitForLoadState("networkidle");
        await assertNoCustomerDiscoveryLinks(page, locale);

        if (viewport.width < 500) {
          const menu = page.getByRole("button", { name: locale === "en" ? "Open navigation" : "打开导航" });
          assert.equal(await menu.count(), 1, `${locale} mobile menu must be available`);
          await menu.click();
          await assertNoCustomerDiscoveryLinks(page, locale);
        }

        for (const route of ["sign-in", "sign-up", "pricing", "check"]) {
          const direct = await page.goto(new URL(`/${locale}/${route}`, origin).href, { waitUntil: "domcontentloaded" });
          assert.equal(direct?.status(), 200, `${locale}/${route} must remain deployed`);
        }
      } finally {
        await page.close();
      }
    }

    const context = await browser.newContext();
    try {
      const account = await context.request.get(new URL(`/${locale}/account`, origin).href, { maxRedirects: 0 });
      assert.equal(account.status(), 307, `${locale} account must require authentication`);
      const destination = new URL(account.headers().location, origin);
      assert.equal(destination.pathname, `/${locale}/sign-in`);
      assert.equal(destination.searchParams.get("returnTo"), `/${locale}/account`);
      await context.addCookies([{ name: "tymra_customer_session", value: "invalid", url: origin.href }]);
      const invalidSession = await context.request.get(new URL(`/${locale}/account`, origin).href, { maxRedirects: 0 });
      assert.equal(invalidSession.status(), 307, "a forged session must not unlock the account");
      assert.equal(new URL(invalidSession.headers().location, origin).pathname, `/${locale}/sign-in`);
      const membership = await context.request.get(new URL("/api/v1/customer/membership", origin).href);
      assert.equal(membership.status(), 401, "customer API must require authentication");
    } finally {
      await context.close();
    }
  }
  process.stdout.write("Hidden discovery: 2 locales, desktop/mobile, direct routes and unauthenticated boundaries passed.\n");
} finally {
  await browser.close();
}

async function assertNoCustomerDiscoveryLinks(page, locale) {
  const paths = await page.locator("a[href]").evaluateAll((links) => links.map((link) => {
    try { return new URL(link.getAttribute("href"), document.baseURI).pathname; }
    catch { return ""; }
  }));
  const forbidden = new RegExp(`^/${locale}/(?:check|pricing|sign-in|sign-up|account)(?:/|$)`, "u");
  assert.deepEqual(paths.filter((path) => forbidden.test(path)), [], `${locale} public discovery must stay hidden`);
}
