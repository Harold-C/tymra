import { expect, test } from "playwright/test";
import { summarizeMarket } from "../apps/web/lib/market-summary";

for (const locale of ["en", "zh"] as const) {
  test(`location selection preserves scope before submission in ${locale}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); if (message.type() === "warning") warnings.push(message.text()); });
    let submissions = 0;
    await page.route("**/api/v1/price-checks**", async route => { if (route.request().method() === "POST") { submissions++; await route.abort(); } else await route.continue(); });
    await page.route("**/api/v1/localities?*", async route => {
      const cities = new URL(route.request().url()).searchParams.get("cities");
      await route.fulfill({ json: { data: cities ? { groups: [{ region: "Canterbury", cities: ["Christchurch City"] }] } : { candidates: [{ id: "12345", name: "Synthetic suburb", city: "Christchurch", territorialAuthority: "Christchurch City" }] } } });
    });
    await page.route("**/api/v1/property-search", route => route.fulfill({ json: { data: { supportStatus: "SUPPORTED", candidates: [{ addressExternalId: "synthetic-address", address: "42 Synthetic Road", city: "Christchurch", isDemo: false }] } } }));
    await page.goto(`/${locale}/address-check`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/address-check$`));
    await expect(page).toHaveTitle(/Tymra/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "Explore local accommodation prices" : "查询周边住宿行情");
    await page.locator("#location-query").fill("42 Synthetic Road");
    await page.locator(".location-candidates button").click();
    await expect(page.locator(".location-selected")).toContainText(locale === "en" ? "Within 5 km" : "5 公里");
    await page.getByRole("button", { name: locale === "en" ? "By suburb" : "按区域", exact: true }).click();
    await page.locator("#location-region").selectOption("Canterbury");
    await page.locator("#location-city").selectOption("Christchurch City");
    await page.locator("#location-locality").selectOption("12345");
    await page.getByRole("button", { name: locale === "en" ? "Use this suburb" : "使用此区域", exact: true }).click();
    await page.getByRole("button", { name: locale === "en" ? "Review and continue" : "核对并继续", exact: true }).click();
    await expect(page.locator(".location-summary")).toContainText(locale === "en" ? "selected LINZ suburb boundary" : "LINZ");
    await expect(page.getByRole("link", { name: locale === "en" ? "Sign in to start analysis" : "登录会员后开始分析", exact: true })).toBeVisible();
    expect(submissions).toBe(0);
    expect(errors).toEqual([]);
    await expect(page.locator("[data-nextjs-dialog-overlay]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach("console-warnings", { body: JSON.stringify(warnings), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath(`${locale}-location-review.png`), fullPage: true });
  });

  test(`regional market and sample quote navigation coexist in ${locale}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); if (message.type() === "warning") warnings.push(message.text()); });
    await page.route("**/api/v1/localities?*", route => route.fulfill({ json: { data: { groups: [{ region: "Canterbury", cities: ["Christchurch City"] }], candidates: [] } } }));
    await page.route("**/api/v1/customer/market?*", route => {
      const query = new URL(route.request().url()).searchParams;
      const summary = summarizeMarket({ version: 1, asOf: new Date().toISOString(), rates: [], events: [], signals: [] }, { region: "Canterbury", city: query.get("city") ?? "", from: query.get("from")!, to: query.get("to")!, mode: "future", category: "ALL" });
      return route.fulfill({ json: { data: { ...summary, scopeLabel: "Canterbury", snapshot: false } } });
    });
    const login = await page.request.post("/api/v1/customer/auth/password", { headers: { origin: process.env.PUBLIC_ORIGIN! }, data: { email: "demo1@tymra.test", password: process.env.MEMBER_DEV_PASSWORD! } });
    expect(login.status()).toBe(201);
    await page.goto(`/${locale}/account/market`);
    await expect(page).toHaveTitle(/Tymra/);
    await expect(page.locator(".regional-market h1")).toBeVisible();
    const nav = page.getByRole("navigation", { name: locale === "en" ? "Member account navigation" : "会员后台导航" });
    expect(await nav.locator(`a[href='/${locale}/account/market']`).count()).toBeGreaterThan(0);
    expect(await nav.locator(`a[href='/${locale}/account/market/sample-quotes']`).count()).toBeGreaterThan(0);
    await page.locator(".market-filter-grid select").first().selectOption("Canterbury");
    await page.locator(".market-period button").click();
    await expect(page.locator(".market-data-note")).toContainText("Canterbury");
    await page.locator(".market-tabs button").nth(1).click();
    await expect(page.locator(".market-tabs button").nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/view=events/);
    expect(errors).toEqual([]);
    await expect(page.locator("[data-nextjs-dialog-overlay]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach("console-warnings", { body: JSON.stringify(warnings), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath(`${locale}-regional-events.png`), fullPage: true });
    if ((testInfo.project.use.viewport?.width ?? 1440) < 768) await page.locator(".customer-account-mobile summary").click();
    await nav.getByRole("link", { name: locale === "en" ? "Sample quote trends" : "样本报价走势", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/account/market/sample-quotes$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "Christchurch sample quote trends" : "基督城样本报价走势");
    await expect(nav.locator(".customer-account-nav-scroll a[aria-current='page']")).toHaveCount(1);
    await expect(nav.locator(".customer-account-nav-scroll a[aria-current='page']")).toHaveAttribute("href", `/${locale}/account/market/sample-quotes`);
    await expect(nav.locator(".customer-account-mobile-links a[aria-current='page']")).toHaveCount(1);
  });
}
