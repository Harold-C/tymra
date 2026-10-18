import { expect, test } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "@tymra/db";
import { seedSampleQuoteTrendFixture } from "../test/sample-quote-trend-fixtures";

let range: Awaited<ReturnType<typeof seedSampleQuoteTrendFixture>>;
test.beforeAll(async () => { range = await seedSampleQuoteTrendFixture(prisma); });
test.afterAll(async () => { await prisma.$disconnect(); });

for (const locale of ["en", "zh"] as const) test(`sample trends separate prices, stays and dates in ${locale}`, async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const anonymous = await page.request.get("/api/v1/customer/market/sample-quotes"); expect(anonymous.status()).toBe(401);
  const signedIn = await page.request.post("/api/v1/customer/auth/password", { headers: { origin: process.env.PUBLIC_ORIGIN! },
    data: { email: "demo1@tymra.test", password: process.env.MEMBER_DEV_PASSWORD! } });
  expect(signedIn.status()).toBe(201);
  const query = new URLSearchParams({ from: range.from, to: range.to, basis: "PUBLIC_TOTAL" });
  const path = `/${locale}/account/market/sample-quotes`;
  const response = await page.goto(`${path}?${query}`); expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "zh" ? "基督城样本报价走势" : "Christchurch sample quote trends");
  await expect(page.locator('.sample-trend-section[data-price-basis="PUBLIC_TOTAL"]')).toHaveCount(1);
  await expect(page.locator('.sample-trend-section[data-nights="1"]')).toContainText("+10.0%");
  await expect(page.locator('.sample-trend-section[data-price-basis="MEMBER_REFERENCE"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${locale}-public.png`), fullPage: true });
  const axe = await new AxeBuilder({ page }).include(".sample-quote-trends").analyze();
  expect(axe.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await page.locator('select[name="basis"]').selectOption("MEMBER_REFERENCE");
  await page.locator('select[name="nights"]').selectOption("2");
  await Promise.all([page.waitForURL(/basis=MEMBER_REFERENCE/u), page.locator('.sample-trend-filters button[type="submit"]').click()]);
  await expect(page.locator('.sample-trend-section[data-price-basis="MEMBER_REFERENCE"][data-nights="2"]')).toHaveCount(1);
  await expect(page.locator('.sample-trend-section[data-price-basis="MEMBER_REFERENCE"]')).toContainText("+10.0%");
  await expect(page.locator(".sample-trend-member-note")).toContainText(locale === "zh" ? "不等于含完整费用的可订总价" : "not all-in bookable totals");
  await page.screenshot({ path: testInfo.outputPath(`${locale}-member.png`), fullPage: true });
  const api = await page.request.get(`/api/v1/customer/market/sample-quotes?${query}&nights=1`);
  expect(api.status()).toBe(200); expect(api.headers()["cache-control"]).toContain("no-store");
  const data = (await api.json()).data; expect(data.series).toHaveLength(1); expect(data.series[0].nights).toBe(1);
  expect(JSON.stringify(data)).not.toMatch(/wireJson|storageRef|\/srv\/|\/Users\//u);
  const invalid = await page.request.get("/api/v1/customer/market/sample-quotes?from=2020-01-01"); expect(invalid.status()).toBe(400);
  await page.goto(`${path}?from=2020-01-01`); await expect(page.locator('.sample-quote-trends [role="alert"]')).toBeVisible();
  await page.goto(`${path}?${query}&lead=0-30`);
  await expect(page.locator(".sample-trend-empty")).toBeVisible();
  if ((testInfo.project.use.viewport?.width ?? 1440) < 768) {
    await page.locator(".customer-account-mobile summary").click();
    await expect(page.locator(".customer-account-mobile summary")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('.customer-account-mobile-links a[aria-current="page"]')).toBeVisible();
    await page.keyboard.press("Escape"); await expect(page.locator(".customer-account-mobile")).not.toHaveAttribute("open", "");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
