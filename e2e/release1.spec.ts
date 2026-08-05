import AxeBuilder from "@axe-core/playwright";
import { prisma } from "@tymra/db";
import bcrypt from "bcryptjs";
import { expect, test } from "playwright/test";

const resultPath = (locale: "en" | "zh", checkId: string, version = 1) =>
  `/${locale}/result/${encodeURIComponent(`result:${checkId}:${version}`)}`;

test.describe("public Release 1", () => {
  test("reduced-motion preference keeps the homepage static and interactive", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

    const activeMotion = await page.locator("body *").evaluateAll((elements) => elements.flatMap((element) => {
      const style = getComputedStyle(element);
      const durations = `${style.animationDuration},${style.transitionDuration}`
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const exceedsReducedLimit = durations.some((value) => value.endsWith("ms")
        ? Number.parseFloat(value) > 0.001
        : Number.parseFloat(value) > 0.000001);
      return exceedsReducedLimit ? [element.tagName] : [];
    }));
    expect(activeMotion).toEqual([]);

    const canvas = page.locator("canvas").first();
    const firstFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    await page.waitForTimeout(250);
    const secondFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    expect(secondFrame).toBe(firstFrame);

    const faq = page.getByRole("button", { name: "Does Tymra provide real pricing results?" });
    await faq.click();
    await expect(faq).toHaveAttribute("aria-expanded", "true");
  });

  test("English and Chinese Home are usable and accessible", async ({ page }, testInfo) => {
    const locale = testInfo.project.name === "mobile" ? "zh" : "en";
    await page.goto(`/${locale}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tymra/i }).first()).toBeVisible();
    await expect(page.getByText("Preview complete", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Join the Pilot", { exact: false })).toHaveCount(0);
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
    await page.locator("#what-you-get").scrollIntoViewIfNeeded();
    const exampleLabel = page
      .locator("#what-you-get p:visible")
      .filter({ hasText: locale === "en" ? "Example structure" : "示例结构" })
      .first();
    await expect(exampleLabel).toBeVisible();
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""));
    expect(serious).toEqual([]);
    const input = "https://www.booking.com/hotel/nz/christchurch-central-stay.html";
    await page.getByLabel(locale === "en" ? "Paste a supported New Zealand OTA listing URL" : "粘贴受支持的新西兰 OTA 房源链接").fill(input);
    await page.locator("#price-check-search-card").getByRole("button", { name: locale === "en" ? "Check This Listing" : "检查这个房源" }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/rough/`));
    await expect(page.getByRole("heading", { name: "Development Demo - Christchurch Central Stay" })).toBeVisible();
    await expect(page.getByRole("heading", { name: locale === "en" ? "Unlock the formal report" : "解锁正式报告" })).toBeVisible();
  });

  test("Public shell preserves the current route and query when changing language", async ({ page }, testInfo) => {
    const listingUrl = "https://www.booking.com/hotel/nz/christchurch-central-stay.html";
    await page.goto(`/en/check?input=${encodeURIComponent(listingUrl)}`);
    if (testInfo.project.name === "mobile") {
      await expect(page.locator(".footer-links-mobile")).toBeVisible();
      await expect(page.locator(".footer-links-desktop").first()).toBeHidden();
    } else {
      await expect(page.locator(".footer-links-mobile")).toBeHidden();
      await expect(page.locator(".footer-links-desktop").first()).toBeVisible();
    }
    await page.getByRole("link", { name: "中文" }).first().click();
    await expect(page).toHaveURL(/\/zh\/check\?input=/);
    await expect(page.getByLabel("Booking.com 或 Airbnb 房源链接")).toHaveValue(listingUrl);
  });

  test("OTA link, one verification email and authenticated formal report complete the new-user flow", async ({ page }) => {
    const email = `e2e-funnel-${Date.now()}-${test.info().project.name}@tymra.test`;
    await page.goto("/en/check");
    await page.getByLabel("Booking.com or Airbnb listing URL").fill("123 Colombo Street, Christchurch");
    await page.getByRole("button", { name: "Check This Listing" }).click();
    await expect(page.getByText("Invalid URL")).toBeVisible();
    await page.getByLabel("Booking.com or Airbnb listing URL").fill("https://www.booking.com/hotel/nz/christchurch-central-stay.html");
    await page.getByRole("button", { name: "Check This Listing" }).click();
    await expect(page).toHaveURL(/\/en\/rough\/[^/]+/);
    await expect(page.getByText("Possibly below the market range")).toBeVisible();
    await expect(page.getByText("Not real market data. This local flow proves behaviour only.")).toBeVisible();
    await expect(page.getByLabel("Check-in date")).toHaveCount(0);
    await expect(page.getByLabel("Number of guests")).toHaveCount(0);
    await expect(page.getByLabel("Room type")).toHaveCount(0);

    await page.getByLabel("Email address").fill(email);
    await page.getByLabel(/I agree to the account terms/).check();
    await page.getByRole("button", { name: "Email My Secure Link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

    const search = await pollMailpit(page, email, 1);
    expect(search.messages_count).toBe(1);
    expect(search.messages[0].Subject).toBe("Verify your email to unlock the Tymra report");
    const message = await (await page.request.get(`http://127.0.0.1:8025/api/v1/message/${search.messages[0].ID}`)).json();
    const secureUrl = String(message.HTML).match(/href="(https:\/\/tymra\.test\/[^\"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    expect(secureUrl).toBeTruthy();
    await page.goto(secureUrl!);
    await expect(page).toHaveURL(/https:\/\/tymra\.test\/en\/account\/checks\/[^/]+/);
    await expect(page.getByText("AUTHENTICATED FORMAL REPORT")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Dates that may deserve attention" })).toBeVisible({ timeout: 30_000 });

    const checkId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect.poll(async () => (await prisma.priceCheck.findUniqueOrThrow({ where: { id: checkId } })).inPageDeliveredAt).not.toBeNull();
    await prisma.job.updateMany({ where: { priceCheckId: checkId, type: "RESULT_NOTIFICATION", status: "PENDING" }, data: { runAt: new Date() } });
    await expect.poll(async () => (await prisma.job.findFirstOrThrow({ where: { priceCheckId: checkId, type: "RESULT_NOTIFICATION" } })).status).toBe("SUCCEEDED");
    expect((await pollMailpit(page, email, 1)).messages_count).toBe(1);
  });

  test("URL pricing context is used without date, guest or room selection", async ({ page }) => {
    await page.goto("/en/check");
    await page.getByLabel("Booking.com or Airbnb listing URL").fill("https://www.booking.com/hotel/nz/riverside-motel.html?checkin=2026-09-10&checkout=2026-09-12&group_adults=3&no_rooms=2");
    await page.getByRole("button", { name: "Check This Listing" }).click();
    await expect(page.getByText("2026-09-10 → 2026-09-12 · 3 adults · 2 units")).toBeVisible();
    await expect(page.getByText("Configuration carried by the pasted link")).toBeVisible();
    await expect(page.getByRole("button", { name: /confirm/i })).toHaveCount(0);
  });

  test("Unsupported OTA input and persisted legacy status boundary pages are explicit", async ({ page }) => {
    await page.goto("/en/check");
    await page.getByLabel("Booking.com or Airbnb listing URL").fill("https://www.booking.com/hotel/au/sydney.html");
    await page.getByRole("button", { name: "Check This Listing" }).click();
    await expect(page.getByText("Enter a supported Booking.com or Airbnb listing URL.")).toBeVisible();

    const response = await page.request.post("/api/v1/price-checks", {
      data: {
        email: "status-boundaries@tymra.test",
        locale: "en",
        input: "Christchurch Central Stay",
        propertyId: "demo-property-central",
        unitId: "demo-unit-central",
        stayQuery: {
          checkIn: "2026-09-20T00:00:00.000Z",
          checkOut: "2026-09-21T00:00:00.000Z",
          adults: 2,
          children: 0,
          units: 1,
          currency: "NZD",
          cancellationCategory: "STANDARD",
          timezone: "Pacific/Auckland",
        },
        serviceConsent: true,
        marketingConsent: false,
        idempotencyKey: `e2e-status:${crypto.randomUUID()}`,
      },
    });
    expect(response.status()).toBe(201);
    const testCheckId = (await response.json()).data.checkId as string;
    for (const [status, label] of [
      ["SOURCE_UNAVAILABLE", "Source unavailable"],
      ["INSUFFICIENT_DATA", "Insufficient data"],
      ["PARTIAL", "Partial result"],
      ["NEEDS_CONFIRMATION", "Needs confirmation"],
    ]) {
      await prisma.priceCheck.update({ where: { id: testCheckId }, data: { status: status as never } });
      await page.goto(`/en/check/${testCheckId}/status`);
      await expect(page.getByRole("heading", { name: label })).toBeVisible();
    }
  });

  test("valid, partial, expired, withdrawn, superseded and invalid result links are safe", async ({ page }) => {
    await page.goto(resultPath("en", "demo-check-normal-high"));
    await expect(page.getByRole("heading", { name: "Dates that may deserve attention" })).toBeVisible();
    await expect(page.getByText("Not real market data", { exact: false }).first()).toBeVisible();
    await page.getByLabel("Useful").check();
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByText("Feedback received")).toBeVisible();

    await page.goto(resultPath("en", "demo-check-low-partial"));
    await expect(page.getByText("Low", { exact: true })).toBeVisible();
    await page.goto(resultPath("en", "demo-check-expired"));
    await expect(page.getByRole("heading", { name: "This result link has expired" })).toBeVisible();
    await expect(page.getByText("Development Demo - Christchurch Central Stay")).toHaveCount(0);
    await page.goto(resultPath("en", "demo-check-withdrawn"));
    await expect(page.getByRole("heading", { name: "This result has been withdrawn" })).toBeVisible();
    await page.goto(resultPath("en", "demo-check-superseded"));
    await expect(page.getByText("This is an older result version")).toBeVisible();
    await page.goto(resultPath("en", "demo-check-superseded", 2));
    await expect(page.getByRole("heading", { name: "Dates that may deserve attention" })).toBeVisible();
    await page.goto("/en/result/invalid-local-token");
    await expect(page.getByRole("heading", { name: "This result link is invalid" })).toBeVisible();
  });

  test("Chinese result and compact viewports do not overflow", async ({ page }) => {
    await page.goto(resultPath("zh", "demo-check-normal-high"));
    await expect(page.getByRole("heading", { name: "可能需要关注的日期" })).toBeVisible();
    for (const viewport of [{ width: 320, height: 568 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  });
});

async function pollMailpit(page: import("playwright/test").Page, email: string, minimum: number) {
  let result: { messages_count: number; messages: Array<{ ID: string; Subject: string }> } = { messages_count: 0, messages: [] };
  await expect.poll(async () => {
    const response = await page.request.get(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=20`);
    result = await response.json();
    return result.messages_count;
  }).toBeGreaterThanOrEqual(minimum);
  return result;
}

test.describe("admin Release 1", () => {
  let originalHash = "";
  const password = "local-e2e-password";

  test.beforeAll(async () => {
    const admin = await prisma.adminUser.findFirstOrThrow({ where: { active: true } });
    originalHash = admin.passwordHash;
    await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  });

  test.afterAll(async () => {
    const admin = await prisma.adminUser.findFirst({ where: { active: true } });
    if (admin && originalHash) await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: originalHash } });
    await prisma.$disconnect();
  });

  test("signs in and opens the operational workspaces", async ({ page }) => {
    await page.goto("https://ops.tymra.test/admin/sign-in");
    await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL || "admin@tymra.test");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/^https:\/\/ops\.tymra\.test\/admin\/exceptions/);
    await expect(page.getByRole("heading", { name: "Inbox & incidents" })).toBeVisible();
    await page.goto("https://ops.tymra.test/admin/checks");
    await page.locator(".admin-table tbody a").first().click();
    await expect(page.getByRole("heading", { name: "Price Check Detail" })).toBeVisible();
    await page.goto("https://ops.tymra.test/admin/data-sources");
    await expect(page.getByRole("heading", { name: "Data Sources" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Manual import", exact: true })).toBeVisible();
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""));
    expect(serious).toEqual([]);
  });
});
