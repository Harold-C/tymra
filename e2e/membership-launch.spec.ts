import { test, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { memberStrategySchema } from "@tymra/domain/member-strategy";
import { e2eAdminEmail, e2eAdminPassword } from "./test-identities";

for (const locale of ["en", "zh"] as const) {
  test(`${locale} launch pricing calculator covers small and large portfolios`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/${locale}/pricing`);
    await expect(page.locator(".public-plan-card").filter({ hasText: "Host" })).toContainText("NZ$19");
    await expect(page.locator(".public-plan-card").filter({ has: page.getByText("Pro", { exact: true }) })).toContainText("NZ$99");
    const capacity = page.locator(".capacity-plans input");
    await capacity.fill("80");
    const cards = page.locator(".capacity-plan-grid article");
    await expect(cards.nth(0)).toContainText("329.00");
    await expect(cards.nth(1)).toContainText("393.00");
    await expect(cards.nth(2)).toContainText("369.00");
    await capacity.fill("200");
    await expect(cards.nth(2)).toContainText("749.00");
    await capacity.fill("201");
    await expect(page.locator(".capacity-plans").getByRole("status")).toBeVisible();
    await expect(cards).toHaveCount(0);
    await capacity.fill("50");
    const violations = (await new AxeBuilder({ page }).analyze()).violations.filter(item => ["critical", "serious"].includes(item.impact ?? ""));
    expect(violations).toEqual([]);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${locale} at ${width}px`).toBe(true);
    }
    await page.setViewportSize(testInfo.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
    await page.screenshot({ path: `/tmp/tymra-membership-${locale}-${testInfo.project.name}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("billing review presents the amount and keeps cancellation separate", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/en/sign-in");
  await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
  await page.locator("#member-email").fill("demo3@tymra.test");
  await page.locator("#member-password").fill(process.env.MEMBER_DEV_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/account/);
  // UI-only quote fixture; real billing rules are exercised with the isolated database suite.
  await page.route("**/api/v1/customer/membership", async route => {
    const response = await route.fetch(); const payload = await response.json();
    payload.data.launchAvailability = { FREE: true, HOST: true, PRO: true, PORTFOLIO: true };
    payload.data.capacityLaunchLimit = 200;
    await route.fulfill({ response, json: payload });
  });
  await page.route("**/api/v1/customer/membership/preview", route => route.fulfill({ json: { data: { plan: "PORTFOLIO", capacity: 80, amountDueMinor: 13500, recurringMinor: 36900, mode: "IMMEDIATE", quoteToken: "ui-fixture", effectiveAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString() } } }));
  await page.goto("/en/account/billing");
  await page.locator(".capacity-plans input").fill("80");
  await page.locator(".capacity-plan-grid article").nth(2).getByRole("button").click();
  const quote = page.getByRole("region", { name: "Review subscription change" });
  await expect(quote).toContainText("135.00");
  await expect(quote).toContainText("369.00");
  await expect(quote.getByRole("button", { name: "Confirm change" })).toBeVisible();
  await quote.screenshot({ path: `/tmp/tymra-membership-quote-${testInfo.project.name}.png` });
  await quote.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Cancel at period end", exact: true }).click();
  const cancel = page.getByRole("region", { name: "Confirm cancellation" });
  await expect(cancel).toContainText("30 days");
  await cancel.getByRole("button", { name: "Keep renewal" }).click();
  await expect(cancel).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const locale of ["en", "zh"] as const) {
  test(`${locale} portfolio previews bulk edits and exposes evidence-backed alerts`, async ({ page }, testInfo) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("/en/sign-in");
    await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
    await page.locator("#member-email").fill("demo4@tymra.test");
    await page.locator("#member-password").fill(process.env.MEMBER_DEV_PASSWORD!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account/);
    const strategy = memberStrategySchema.parse({});
    const units = [1, 2].map(index => ({ id: `ui-unit-${index}`, name: `Apartment ${index}`, propertyName: "Launch fixture", active: true, groupName: null, strategyVersion: 1, strategy, checkId: null, status: "PUBLISHED", asOf: new Date().toISOString(), gapPercent: index === 1 ? 20 : null, reviewRange: index === 1 ? { lowMinor: 18000, highMinor: 22000 } : null }));
    let confirmed = 0;
    await page.route("**/api/v1/customer/portfolio", async route => {
      if (route.request().method() === "POST") { expect(route.request().postDataJSON().units).toHaveLength(2); return route.fulfill({ json: { data: { affectedCount: 2, previewToken: "ui-preview" } } }); }
      if (route.request().method() === "PATCH") { confirmed++; expect(route.request().headers()["idempotency-key"]).toBeTruthy(); return route.fulfill({ json: { data: { affectedCount: 2 } } }); }
      return route.fulfill({ json: { data: { canBulk: true, candidates: [], units } } });
    });
    await page.goto(`/${locale}/account/portfolio`);
    const cards = page.locator(".member-strategy-units article");
    await expect(cards).toHaveCount(2);
    await cards.nth(0).getByRole("checkbox").check(); await cards.nth(1).getByRole("checkbox").check();
    await page.getByLabel(locale === "zh" ? "分组名称（留空取消分组）" : "Group name (blank removes grouping)").fill("Christchurch");
    await page.getByRole("button", { name: locale === "zh" ? "预览修改" : "Preview change" }).click();
    const preview = page.getByRole("region", { name: locale === "zh" ? "确认策略修改" : "Confirm strategy change" });
    await expect(preview).toContainText("2"); expect(confirmed).toBe(0);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
    await page.screenshot({ path: `/tmp/tymra-portfolio-editor-${locale}-${testInfo.project.name}.png`, fullPage: true });
    await preview.getByRole("button", { name: locale === "zh" ? "确认保存" : "Confirm and save" }).click();
    await expect(page.getByRole("status")).toContainText(locale === "zh" ? "策略已保存" : "Strategy saved"); expect(confirmed).toBe(1);
    const violations = (await new AxeBuilder({ page }).analyze()).violations.filter(item => ["critical", "serious"].includes(item.impact ?? "")); expect(violations).toEqual([]);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
    await page.screenshot({ path: `/tmp/tymra-portfolio-${locale}-${testInfo.project.name}.png`, fullPage: true });
    await page.route("**/api/v1/customer/alerts", route => route.fulfill({ json: { data: { units: [], alerts: [{ id: "ui-alert", priceCheckId: "ui-check", createdAt: new Date().toISOString(), metadata: { kind: "BELOW_MARKET", gapPercent: 20, acknowledged: false } }] } } }));
    await page.goto(`/${locale}/account/alerts`);
    await expect(page.getByRole("heading", { name: locale === "zh" ? "值得复核的市场价差" : "Market gap to review" })).toBeVisible();
    for (const width of [320, 390, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    expect(errors).toEqual([]);
  });
}
for (const locale of ["en", "zh"] as const) {
  test(`${locale} administrator grants and revokes permanent Portfolio 100 through the real API`, async ({ page, context }, testInfo) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const publicOrigin = process.env.PUBLIC_ORIGIN!;
    const adminOrigin = process.env.ADMIN_ORIGIN!;
    const email = `grant-ui-${crypto.randomUUID()}@example.test`;
    const registration = await page.request.post(`${publicOrigin}/api/v1/customer/auth/register`, { headers: { origin: publicOrigin }, data: { email, password: "isolated-grant-ui-password", locale, serviceConsent: true } });
    expect(registration.status()).toBe(201);
    const customerId = (await registration.json()).data.customer.id;
    await context.addCookies([{ name: "TYMRA_ADMIN_LOCALE", value: locale, url: adminOrigin }]);
    await page.goto(`${adminOrigin}/admin/sign-in`);
    await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
    await page.locator("#admin-email").fill(e2eAdminEmail); await page.locator("#admin-password").fill(e2eAdminPassword);
    await page.locator(".admin-signin-form button").click();
    await expect(page).toHaveURL(/\/admin\/exceptions/);
    await page.goto(`${adminOrigin}/admin/customers/${customerId}`);
    const form = page.locator(".admin-grant-section");
    await form.getByRole("combobox", { name: locale === "zh" ? "会员等级" : "Membership plan", exact: true }).selectOption("PORTFOLIO");
    await form.getByLabel(locale === "zh" ? "房源容量" : "Monitored-object capacity", { exact: true }).fill("100");
    const preview = form.getByRole("button", { name: locale === "zh" ? "预览授权" : "Preview grant", exact: true });
    await expect(preview).toBeDisabled();
    await form.getByLabel(locale === "zh" ? "授权或撤销原因" : "Grant or revocation reason", { exact: true }).fill("Synthetic browser grant acceptance");
    await preview.click();
    const review = form.getByRole("region", { name: locale === "zh" ? "确认权益变更" : "Confirm entitlement change" });
    await expect(review).toContainText("100"); await expect(review).toContainText(locale === "zh" ? "长期有效" : "No expiry");
    expect((await page.request.get(`${publicOrigin}/api/v1/customer/membership`).then(response => response.json())).data.plan).toBe("FREE");
    await review.getByRole("button", { name: locale === "zh" ? "确认保存" : "Confirm and save" }).click();
    await expect(form.getByRole("status")).toContainText(locale === "zh" ? "审计记录" : "Audit record");
    await expect(form).toContainText(locale === "zh" ? "有效授权: PORTFOLIO · 100" : "Active grant: PORTFOLIO · 100");
    for (const width of [320, 390, 1440]) { await page.setViewportSize({ width, height: 900 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `grant UI at ${width}px` }).toBe(true); }
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(item => ["critical", "serious"].includes(item.impact ?? "")); expect(serious).toEqual([]);
    await page.setViewportSize(testInfo.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
    await page.screenshot({ path: `/tmp/tymra-admin-grant-${locale}-${testInfo.project.name}.png`, fullPage: true, animations: "disabled" });
    await page.goto(`${publicOrigin}/${locale}/account/billing`);
    const panel = page.locator(".membership-panel");
    await expect(panel).toContainText(locale === "zh" ? "管理员授予权益" : "Administrator-granted membership");
    await expect(panel).toContainText(locale === "zh" ? "长期有效" : "No expiry");
    await expect(panel).toContainText("0/100");
    await expect(panel.locator(".capacity-plans")).toHaveCount(0); await expect(panel.locator(".membership-billing-actions")).toHaveCount(0);
    await panel.screenshot({ path: `/tmp/tymra-customer-grant-${locale}-${testInfo.project.name}.png`, animations: "disabled" });
    await page.goto(`${adminOrigin}/admin/customers/${customerId}`);
    await form.getByLabel(locale === "zh" ? "授权或撤销原因" : "Grant or revocation reason", { exact: true }).fill("Synthetic browser revocation acceptance");
    await form.getByRole("button", { name: locale === "zh" ? "预览撤销" : "Preview revocation" }).click();
    await review.getByRole("button", { name: locale === "zh" ? "确认保存" : "Confirm and save" }).click();
    await expect(form.getByRole("status")).toContainText(locale === "zh" ? "审计记录" : "Audit record");
    expect((await page.request.get(`${publicOrigin}/api/v1/customer/membership`).then(response => response.json())).data.plan).toBe("FREE");
    expect(errors).toEqual([]);
  });
}
