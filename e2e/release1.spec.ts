import AxeBuilder from "@axe-core/playwright";
import { prisma } from "@tymra/db";
import { expect, test } from "playwright/test";

import { e2eAdminEmail, e2eAdminPassword } from "./test-identities";

const resultPath = (locale: "en" | "zh", checkId: string, version = 1) =>
  `/${locale}/result/${encodeURIComponent(`result:${checkId}:${version}`)}`;

const listingUrlLabel = {
  en: "Supported OTA listing URL",
  zh: "受支持的 OTA 房源链接",
} as const;

const insightsHeading = {
  en: "A useful first signal, not a black box",
  zh: "先看清值得检查的重点",
} as const;

const adminUrl = (pathname: string) => new URL(pathname, "https://ops.tymra.test").toString();

async function goto(page: import("playwright/test").Page, url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
      if (response && (response.status() === 404 || response.status() >= 500)) throw new Error(`Navigation returned ${response.status()}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 60) await page.waitForTimeout(500);
    }
  }
  throw lastError;
}

async function gotoAdmin(page: import("playwright/test").Page, pathname: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await page.goto(adminUrl(pathname), { waitUntil: "domcontentloaded", timeout: 10_000 });
      if (response?.status() === 404) throw new Error("Operations route is still refreshing");
      if (response && response.status() >= 500) throw new Error(`Navigation returned ${response.status()}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 60) await page.waitForTimeout(500);
    }
  }
  throw lastError;
}

async function postJsonFromPage<T>(page: import("playwright/test").Page, url: string, data: unknown) {
  let lastResponse: { status: number; contentType: string; text: string } | undefined;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    lastResponse = await page.evaluate(async ({ requestUrl, requestData }) => {
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestData),
      });
      return { status: response.status, contentType: response.headers.get("content-type") ?? "", text: await response.text() };
    }, { requestUrl: url, requestData: data });
    if (lastResponse.contentType.includes("application/json")) {
      return { status: lastResponse.status, body: JSON.parse(lastResponse.text) as T };
    }
    if (lastResponse.status < 500 && lastResponse.status !== 404) break;
    await page.waitForTimeout(attempt * 250);
  }
  throw new Error(`Expected JSON from ${url}; received ${lastResponse?.status ?? "no response"} ${lastResponse?.contentType || "without a content type"}`);
}

test.describe("public Release 1", () => {
  test("member sign-in fails closed without JavaScript and never places credentials in the URL", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    try {
      await goto(page, "https://tymra.test/en/sign-in");
      await page.getByLabel("Membership email").fill("no-js-member@tymra.test");
      await page.getByLabel("Password").fill("no javascript password fixture");
      const submitted = page.waitForRequest((request) => request.url().includes("/en/sign-in") && request.method() === "POST");
      await page.getByRole("button", { name: "Sign in" }).click();
      const request = await submitted;
      expect(request.method()).toBe("POST");
      expect(request.url()).not.toContain("email=");
      expect(request.url()).not.toContain("password=");
    } finally {
      await context.close();
    }
  });

  test("renders and resubmits the provider-neutral challenge state", async ({ page }) => {
    const requests: Array<Record<string, unknown>> = [];
    await page.route("**/api/v1/rough-checks", async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 403, json: { error: { code: "ROUGH_CHECK_CHALLENGE_REQUIRED", message: "Verification required", referenceId: "TYM-E2E", details: { challenge: { mode: "deterministic", token: "x".repeat(40) } } } } });
    });
    await goto(page, "/en");
    await expect(page.locator('#price-check-search-card[data-hydrated="true"]')).toBeVisible();
    await page.getByLabel("Paste a supported New Zealand OTA listing URL").fill("https://www.booking.com/hotel/nz/challenge-test.html");
    await page.locator("#price-check-search-card").getByRole("button", { name: "Check This Listing" }).click();
    await expect(page.getByTestId("rough-check-challenge")).toContainText("Additional verification required");
    await page.getByRole("button", { name: "Complete verification" }).click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1].challengeToken).toBe("x".repeat(40));
  });

  test("reduced-motion preference keeps the homepage static and interactive", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await goto(page, "/en");
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

    const canvas = page.locator('canvas[data-rendered="true"]').first();
    await expect(canvas).toBeVisible();
    const firstFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    await page.waitForTimeout(250);
    const secondFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    expect(secondFrame).toBe(firstFrame);

    const faq = page.getByRole("button", { name: "Does Tymra provide real pricing results?" });
    await faq.click();
    await expect(faq).toHaveAttribute("aria-expanded", "true");
  });

  test("English and Chinese Home are usable and accessible", async ({ page }, testInfo) => {
    test.slow();
    const locale = testInfo.project.name === "mobile" ? "zh" : "en";
    await goto(page, `/${locale}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tymra/i }).first()).toBeVisible();
    await expect(page.getByText("Preview complete", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Join the Pilot", { exact: false })).toHaveCount(0);
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
    await page.locator("#what-you-get").scrollIntoViewIfNeeded();
    await expect(page.locator("#what-you-get").getByRole("heading", { name: insightsHeading[locale] })).toBeVisible();
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""));
    expect(serious).toEqual([]);
    await expect(page.getByLabel(locale === "en" ? "Paste a supported New Zealand OTA listing URL" : "粘贴受支持的新西兰 OTA 房源链接")).toBeVisible();
    await expect(page.locator("#price-check-search-card").getByRole("button", { name: locale === "en" ? "Check This Listing" : "检查这个房源" })).toBeVisible();
    const addressEntry = page.getByRole("link", { name: locale === "en" ? "No listing link? Benchmark a New Zealand address" : "没有房源链接？查询新西兰地址周边行情", exact: true }).first();
    await expect(addressEntry).toBeVisible();
    await addressEntry.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/address-check$`));
    const addressMode = page.getByRole("radio", { name: locale === "en" ? /Benchmark a real address/ : /查询真实地址周边行情/ });
    await expect(async () => {
      if (!await addressMode.isVisible().catch(() => false)) await goto(page, `/${locale}/address-check`);
      await expect(addressMode).toBeVisible();
    }).toPass({ timeout: 30_000 });
  });

  test("public membership pricing and member access are discoverable", async ({ page }, testInfo) => {
    const locale = testInfo.project.name === "mobile" ? "zh" : "en";
    const pricingLabel = locale === "en" ? "Plans & Pricing" : "会员方案";
    const signInLabel = locale === "en" ? "Sign In" : "登录";

    await goto(page, `/${locale}`);
    if (testInfo.project.name === "mobile") {
      const mobileNavigation = page.getByRole("dialog", { name: locale === "en" ? "Mobile navigation" : "移动端导航" });
      await expect.poll(async () => {
        if (!await mobileNavigation.isVisible().catch(() => false)) {
          await page.getByRole("button", { name: locale === "en" ? "Open navigation" : "打开导航" }).click();
          await page.waitForTimeout(100);
        }
        return mobileNavigation.getByRole("link", { name: signInLabel }).isVisible().catch(() => false);
      }, { timeout: 30_000, intervals: [250, 500, 1_000] }).toBe(true);
    } else {
      await expect(page.getByRole("link", { name: signInLabel, exact: true })).toBeVisible();
    }

    await page.getByRole("link", { name: pricingLabel, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/pricing$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(locale === "en" ? "whole portfolio" : "整个住宿组合");
    await expect(page.getByText("NZ$29", { exact: true })).toBeVisible();
    await expect(page.getByText(locale === "en" ? "Exact daily price-check window: next 90 days" : "精确逐日价格检查范围：未来 90 天", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: locale === "en" ? "Create Free account" : "创建 Free 账户" }).first()).toBeVisible();
    if (locale === "en") {
      const planRules = [
        ["Free", "NZ$0", "1 property slot", "next 14 days", "up to 30 days", "No scheduled analysis", "1 spot check", "30 days of recommendation history", "best-effort queue"],
        ["Host", "NZ$29", "1 property slot", "next 30 days", "up to 90 days", "Weekly incremental analysis per property", "10 spot checks", "6 months of recommendation history", "standard queue"],
        ["Pro", "NZ$89", "5 property slots", "next 90 days", "up to 180 days", "3 incremental analyses per property each week", "60 spot checks", "12 months of recommendation history", "priority queue"],
        ["Portfolio", "NZ$249", "20 property slots", "next 180 days", "up to 365 days", "Daily incremental analysis per property", "300 spot checks", "24 months of recommendation history", "highest shared queue priority"],
      ];
      for (const [plan, ...rules] of planRules) {
        const card = page.locator(".public-plan-card").filter({ has: page.getByText(plan, { exact: true }) });
        await expect(card).toHaveCount(1);
        for (const rule of rules) await expect(card).toContainText(rule);
      }
    }
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""));
    expect(serious).toEqual([]);
  });

  test("public navigation remains reachable without tablet overflow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "The desktop project explicitly exercises every responsive breakpoint.");
    test.slow();
    for (const width of [1440, 1280, 960, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/en", "/en/pricing"]) {
        await goto(page, route);
        expect(await page.getByRole("banner").evaluate((header) => header.scrollWidth <= header.clientWidth), `${route} at ${width}px`).toBe(true);
        const usesMenu = width < 1440;
        if (usesMenu) {
          const menuButton = page.getByRole("button", { name: "Open navigation" });
          await expect(menuButton).toBeVisible();
          const mobileNavigation = page.getByRole("dialog", { name: "Mobile navigation" });
          await expect.poll(async () => {
            if (!await mobileNavigation.isVisible().catch(() => false)) {
              await page.getByRole("button", { name: "Open navigation" }).click();
              await page.waitForTimeout(100);
            }
            return mobileNavigation.getByRole("link", { name: "Sign In", exact: true }).isVisible().catch(() => false);
          }, { timeout: 30_000, intervals: [250, 500, 1_000] }).toBe(true);
        } else {
          await expect(page.getByRole("banner").getByRole("link", { name: "Sign In", exact: true })).toBeVisible();
        }
      }
    }
  });

  test("Public shell preserves the current route and query when changing language", async ({ page }, testInfo) => {
    const listingUrl = "https://www.booking.com/hotel/nz/christchurch-central-stay.html";
    await goto(page, `/en/check?input=${encodeURIComponent(listingUrl)}`);
    if (testInfo.project.name === "mobile") {
      await expect(page.locator(".footer-links-mobile")).toBeVisible();
      await expect(page.locator(".footer-links-desktop").first()).toBeHidden();
    } else {
      await expect(page.locator(".footer-links-mobile")).toBeHidden();
      await expect(page.locator(".footer-links-desktop").first()).toBeVisible();
    }
    await page.getByRole("link", { name: "中文" }).first().click();
    await expect(page).toHaveURL(/\/zh\/check\?input=/);
    await expect(page.getByLabel(listingUrlLabel.zh)).toHaveValue(listingUrl);
  });

  test("OTA link, one verification email and authenticated formal report complete the new-user flow", async ({ page }) => {
    test.slow();
    const email = `e2e-${Date.now()}-${test.info().project.name}-${crypto.randomUUID().slice(0, 8)}@tymra.test`;
    await goto(page, "/en/check");
    await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
    await page.getByLabel(listingUrlLabel.en).fill("123 Colombo Street, Christchurch");
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.getByRole("button", { name: "Check This Listing" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      if (await page.getByText("Invalid url", { exact: true }).isVisible()) break;
      if (attempt < 3) await page.waitForTimeout(500);
    }
    await expect(page.getByText("Invalid url", { exact: true })).toBeVisible();
    await page.getByLabel(listingUrlLabel.en).fill("https://www.booking.com/hotel/nz/christchurch-central-stay.html");
    await page.getByRole("button", { name: "Check This Listing" }).click();
    await expect(page).toHaveURL(/\/en\/rough\/[^/]+/);
    await expect.poll(async () => {
      if (await page.getByText("Possibly below the market range").isVisible()) return true;
      await page.reload();
      return false;
    }, { timeout: 30_000 }).toBe(true);
    await expect(page.getByText("Not real market data. This local flow proves behaviour only.")).toBeVisible();
    await expect(page.getByLabel("Check-in date")).toHaveCount(0);
    await expect(page.getByLabel("Number of guests")).toHaveCount(0);
    await expect(page.getByLabel("Room type")).toHaveCount(0);

    await page.getByLabel("Email address").fill(email);
    await page.getByLabel(/I agree to the account terms/).check();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.getByRole("button", { name: "Email My Secure Link" }).click();
      const accepted = await page.getByRole("heading", { name: "Check your email" }).waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
      if (accepted) break;
      await expect(page.getByRole("alert")).toBeVisible();
      if (attempt < 3) await page.waitForTimeout(500);
    }
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 30_000 });

    const search = await pollMailpit(page, email, 1);
    expect(search.messages_count).toBe(1);
    expect(search.messages[0].Subject).toBe("Verify your email to unlock the Tymra report");
    const message = await (await page.request.get(`http://127.0.0.1:8025/api/v1/message/${search.messages[0].ID}`)).json();
    const secureHref = String(message.HTML).match(/href="(https?:\/\/[^\"]+\/en\/auth\/verify\?[^\"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    expect(secureHref).toBeTruthy();
    const secureUrl = new URL(secureHref!);
    expect(secureUrl.pathname).toBe("/en/auth/verify");
    let transientCheckResponses = 0;
    await page.route("**/api/v1/customer/checks/*", async (route) => {
      if (transientCheckResponses < 3 && route.request().method() === "GET") {
        transientCheckResponses += 1;
        await route.fulfill({ status: 502, contentType: "text/plain", body: "temporary upstream response" });
        return;
      }
      await route.continue();
    });
    await goto(page, secureUrl.toString());
    await expect(page).toHaveURL(/\/en\/account\/checks\/[^/]+/);
    await expect(page.getByText("AUTHENTICATED FORMAL REPORT")).toBeVisible({ timeout: 90_000 });
    expect(transientCheckResponses).toBe(3);
    await expect(page.getByRole("heading", { name: "Dates that may deserve attention" })).toBeVisible({ timeout: 90_000 });
    const checkId = new URL(page.url()).pathname.split("/").at(-1)!;

    await goto(page, "/en/account/checks");
    await page.getByLabel("Search").fill("Christchurch Central Stay");
    const ownedCheck = page.locator(`a[href="/en/account/checks/${checkId}"]`);
    await expect(ownedCheck).toBeVisible();
    await ownedCheck.click();
    await expect(page.getByText("AUTHENTICATED FORMAL REPORT")).toBeVisible();

    await goto(page, "/en/account/pricing-units");
    const pricingUnitDetails = page.getByRole("link", { name: "View details" });
    await expect(pricingUnitDetails).toHaveCount(1);
    await pricingUnitDetails.click();
    await expect(page).toHaveURL(/\/en\/account\/pricing-units\/[^/]+$/);
    await expect(page.getByText("PRICING UNIT", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Public platforms" })).toBeVisible();

    await expect.poll(async () => (await prisma.priceCheck.findUniqueOrThrow({ where: { id: checkId } })).inPageDeliveredAt).not.toBeNull();
    await prisma.job.updateMany({ where: { priceCheckId: checkId, type: "RESULT_NOTIFICATION", status: "PENDING" }, data: { runAt: new Date() } });
    await expect.poll(async () => (await prisma.job.findFirstOrThrow({ where: { priceCheckId: checkId, type: "RESULT_NOTIFICATION" } })).status).toBe("SUCCEEDED");
    expect((await pollMailpit(page, email, 1)).messages_count).toBe(1);
  });

  test("URL pricing context is used without date, guest or room selection", async ({ page }) => {
    await goto(page, "/en/check");
    await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
    await page.getByLabel(listingUrlLabel.en).fill("https://www.booking.com/hotel/nz/riverside-motel.html?checkin=2026-09-10&checkout=2026-09-12&group_adults=3&no_rooms=2");
    await page.getByRole("button", { name: "Check This Listing" }).click();
    await expect(page.getByText("2026-09-10 → 2026-09-12 · 3 adults · 2 units")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Configuration carried by the pasted link")).toBeVisible();
    await expect(page.getByRole("button", { name: /confirm/i })).toHaveCount(0);
  });

  test("Unsupported OTA input and persisted legacy status boundary pages are explicit", async ({ page }) => {
    test.slow();
    await goto(page, "/en/check");
    await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
    await page.getByLabel(listingUrlLabel.en).fill("https://www.booking.com/hotel/au/sydney.html");
    await page.getByRole("button", { name: "Check This Listing" }).click();
    await expect(page.getByText("Enter a supported public OTA listing URL.")).toBeVisible();

    for (const [status, label] of [
      ["SOURCE_UNAVAILABLE", "Source unavailable"],
      ["INSUFFICIENT_DATA", "Insufficient data"],
      ["PARTIAL", "Partial result"],
      ["NEEDS_CONFIRMATION", "Needs confirmation"],
    ]) {
      const response = await postJsonFromPage<{ data: { checkId: string } }>(page, "/api/v1/price-checks", {
          email: `status-${status.toLowerCase()}@tymra.test`,
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
          idempotencyKey: `e2e-status:${status}:${crypto.randomUUID()}`,
      });
      expect(response.status).toBe(201);
      const testCheckId = response.body.data.checkId;
      await prisma.priceCheck.update({ where: { id: testCheckId }, data: { status: status as never } });
      await goto(page, `/en/check/${testCheckId}/status`);
      await expect(page.getByRole("heading", { name: label })).toBeVisible({ timeout: 30_000 });
    }
  });

  test("valid, partial, expired, withdrawn, superseded and invalid result links are safe", async ({ page }) => {
    await goto(page, resultPath("en", "demo-check-normal-high"));
    await expect(page.getByRole("heading", { name: "Dates that may deserve attention" })).toBeVisible();
    await expect(page.getByText("Not real market data", { exact: false }).first()).toBeVisible();
    await expect(page.locator('.feedback-form[data-hydrated="true"]')).toBeVisible();
    await page.getByLabel("Useful").check();
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByText("Feedback received")).toBeVisible();

    await goto(page, resultPath("en", "demo-check-low-partial"));
    await expect(page.getByText("Low", { exact: true })).toBeVisible();
    await goto(page, resultPath("en", "demo-check-expired"));
    await expect(page.getByRole("heading", { name: "This result link has expired" })).toBeVisible();
    await expect(page.getByText("Development Demo - Christchurch Central Stay")).toHaveCount(0);
    await goto(page, resultPath("en", "demo-check-withdrawn"));
    await expect(page.getByRole("heading", { name: "This result has been withdrawn" })).toBeVisible();
    await goto(page, resultPath("en", "demo-check-superseded"));
    await expect(page.getByText("This is an older result version")).toBeVisible();
    await goto(page, resultPath("en", "demo-check-superseded", 2));
    await expect(page.getByRole("heading", { name: "Dates that may deserve attention" })).toBeVisible();
    await goto(page, "/en/result/invalid-local-token");
    await expect(page.getByRole("heading", { name: "This result link is invalid" })).toBeVisible();
  });

  test("Chinese result and compact viewports do not overflow", async ({ page }) => {
    await goto(page, resultPath("zh", "demo-check-normal-high"));
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
  }, { timeout: 30_000, intervals: [250, 500, 1_000] }).toBeGreaterThanOrEqual(minimum);
  return result;
}

test.describe("member accessibility and responsive contract", () => {
  const email = `member-accessibility-${Date.now()}@tymra.test`;
  const password = "member accessibility test password";
  let customerId = "";

  test.beforeAll(async ({ request }) => {
    const response = await request.post("https://tymra.test/api/v1/customer/auth/register", {
      headers: { origin: "https://tymra.test", "x-forwarded-for": "198.51.100.80" },
      data: { email, password, locale: "en", serviceConsent: true },
    });
    const responseText = await response.text();
    expect(response.status(), responseText).toBe(201);
    const body = JSON.parse(responseText) as { data: { customer: { id: string } } };
    customerId = body.data.customer.id;
    await prisma.customerUser.update({ where: { id: customerId }, data: { emailVerifiedAt: new Date() } });
  });

  test.afterAll(async () => {
    if (customerId) await prisma.customerUser.deleteMany({ where: { id: customerId } });
  });

  test("EN/ZH member routes pass axe, keyboard, reduced-motion and compact-width checks", async ({ page }, testInfo) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const memberOrigin = "https://tymra.test";
    await goto(page, `${memberOrigin}/en/sign-in?returnTo=${encodeURIComponent("/en/account")}`);
    await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
    await page.getByLabel("Membership email").fill(email);
    await page.getByLabel("Password").fill(password);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.getByRole("button", { name: "Sign in" }).click();
      const signedIn = await page.waitForURL(/\/en\/account$/, { timeout: 5_000 }).then(() => true).catch(() => false);
      if (signedIn) break;
      await expect(page.locator(".form-error")).toBeVisible();
      if (attempt < 3) await page.waitForTimeout(500);
    }
    await expect(page).toHaveURL(/\/en\/account$/, { timeout: 30_000 });

    await goto(page, `${memberOrigin}/en`);
    if (testInfo.project.name === "mobile") {
      const memberMenu = page.getByRole("dialog", { name: "Mobile navigation" });
      await expect.poll(async () => {
        if (!await memberMenu.isVisible().catch(() => false)) {
          await page.getByRole("button", { name: "Open navigation" }).click();
          await page.waitForTimeout(100);
        }
        return memberMenu.getByRole("link", { name: "My Account", exact: true }).isVisible().catch(() => false);
      }, { timeout: 30_000, intervals: [250, 500, 1_000] }).toBe(true);
      await expect(memberMenu.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
      await expect(memberMenu.getByRole("link", { name: "Sign In", exact: true })).toHaveCount(0);
    } else {
      const publicHeader = page.getByRole("banner");
      const accountMenuButton = publicHeader.getByRole("button", { name: "My Account", exact: true });
      await expect(accountMenuButton).toBeVisible();
      await expect(async () => {
        if (await accountMenuButton.getAttribute("aria-expanded") !== "true") await accountMenuButton.click();
        await expect(accountMenuButton).toHaveAttribute("aria-expanded", "true");
      }).toPass();
      const accountMenu = publicHeader.getByRole("menu");
      await expect(accountMenu.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
      await expect(publicHeader.getByRole("link", { name: "Sign In", exact: true })).toHaveCount(0);
    }

    const routes = ["account", "account/checks", "account/pricing-units", "account/calendar", "account/billing", "account/settings", "account/exports", "account/alerts", "account/portfolio", "account/integrations"];
    for (const locale of ["en", "zh"] as const) {
      for (const route of routes) {
        await goto(page, `${memberOrigin}/${locale}/${route}`);
        await expect(page.locator("main")).toBeVisible();
        await expect(page.locator(".customer-account-nav"), `${locale}/${route} must remain authenticated`).toBeVisible();
        const serious = (await new AxeBuilder({ page }).analyze()).violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""));
        expect(serious, `${locale}/${route}`).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${locale}/${route}`).toBe(true);
        const activeMotion = await page.locator("body *").evaluateAll((elements) => elements.filter((element) => {
          const style = getComputedStyle(element);
          return `${style.animationDuration},${style.transitionDuration}`.split(",").some((value) => Number.parseFloat(value) > 0.001);
        }).length);
        expect(activeMotion, `${locale}/${route}`).toBe(0);
      }
    }

    await page.setViewportSize({ width: 320, height: 700 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= 320)).toBe(true);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
    if (testInfo.project.name === "mobile") await expect(page.locator(".customer-account-nav")).toBeVisible();
  });
});

test.describe("admin Release 1", () => {
  test("admin sign-in fails closed without JavaScript and never places credentials in the URL", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    try {
      await gotoAdmin(page, "/admin/sign-in");
      await page.getByLabel("Email").fill("no-js-admin@tymra.test");
      await page.getByLabel("Password").fill("no-javascript-admin-password");
      const submitted = page.waitForRequest((request) => request.url().includes("/admin/sign-in") && request.method() === "POST");
      await page.getByRole("button", { name: "Sign in" }).click();
      const request = await submitted;
      expect(request.url()).not.toContain("email=");
      expect(request.url()).not.toContain("password=");
    } finally {
      await context.close();
    }
  });

  test("signs in and opens the operational workspaces", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "The operations workspace is a desktop-only surface.");
    await gotoAdmin(page, "/admin/sign-in");
    await expect(page.locator('form[data-hydrated="true"]')).toBeVisible();
    await page.getByLabel("Email").fill(e2eAdminEmail);
    await page.getByLabel("Password").fill(e2eAdminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/^https?:\/\/ops\.tymra\.test(?::3000)?\/admin\/exceptions/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Inbox & incidents" })).toBeVisible();
    await gotoAdmin(page, "/admin/checks");
    await expect(page.getByRole("heading", { name: "Price Checks" })).toBeVisible();
    await gotoAdmin(page, "/admin/checks/demo-check-normal-high");
    await expect(page.getByRole("heading", { name: "Price Check Detail" })).toBeVisible();
    await gotoAdmin(page, "/admin/data-sources");
    await expect(page.getByRole("heading", { name: "Data Sources" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Manual import", exact: true })).toBeVisible();
    await gotoAdmin(page, "/admin/production-readiness");
    await expect(page.getByRole("heading", { name: "Production readiness" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Canary safety boundary" })).toBeVisible();
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""));
    expect(serious).toEqual([]);
  });
});
