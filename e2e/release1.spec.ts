import AxeBuilder from "@axe-core/playwright";
import { prisma } from "@tymra/db";
import bcrypt from "bcryptjs";
import { expect, test } from "playwright/test";

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
      const response = await page.goto(url);
      if (response && response.status() >= 500) throw new Error(`Navigation returned ${response.status()}`);
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
      const response = await page.goto(adminUrl(pathname));
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

test.describe("public Release 1", () => {
  test("renders and resubmits the provider-neutral challenge state", async ({ page }) => {
    const requests: Array<Record<string, unknown>> = [];
    await page.route("**/api/v1/rough-checks", async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 403, json: { error: { code: "ROUGH_CHECK_CHALLENGE_REQUIRED", message: "Verification required", referenceId: "TYM-E2E", details: { challenge: { mode: "deterministic", token: "x".repeat(40) } } } } });
    });
    await goto(page, "/en");
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
    const email = `e2e-funnel-${Date.now()}-${test.info().project.name}@tymra.test`;
    await goto(page, "/en/check");
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
    await page.getByRole("button", { name: "Email My Secure Link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 30_000 });

    const search = await pollMailpit(page, email, 1);
    expect(search.messages_count).toBe(1);
    expect(search.messages[0].Subject).toBe("Verify your email to unlock the Tymra report");
    const message = await (await page.request.get(`http://127.0.0.1:8025/api/v1/message/${search.messages[0].ID}`)).json();
    const secureHref = String(message.HTML).match(/href="(https?:\/\/[^\"]+\/en\/auth\/verify\?[^\"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    expect(secureHref).toBeTruthy();
    const secureUrl = new URL(secureHref!);
    expect(secureUrl.pathname).toBe("/en/auth/verify");
    await goto(page, secureUrl.toString());
    await expect(page).toHaveURL(/\/en\/account\/checks\/[^/]+/);
    await expect(page.getByText("AUTHENTICATED FORMAL REPORT")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Dates that may deserve attention" })).toBeVisible({ timeout: 30_000 });

    const checkId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect.poll(async () => (await prisma.priceCheck.findUniqueOrThrow({ where: { id: checkId } })).inPageDeliveredAt).not.toBeNull();
    await prisma.job.updateMany({ where: { priceCheckId: checkId, type: "RESULT_NOTIFICATION", status: "PENDING" }, data: { runAt: new Date() } });
    await expect.poll(async () => (await prisma.job.findFirstOrThrow({ where: { priceCheckId: checkId, type: "RESULT_NOTIFICATION" } })).status).toBe("SUCCEEDED");
    expect((await pollMailpit(page, email, 1)).messages_count).toBe(1);
  });

  test("URL pricing context is used without date, guest or room selection", async ({ page }) => {
    await goto(page, "/en/check");
    await page.getByLabel(listingUrlLabel.en).fill("https://www.booking.com/hotel/nz/riverside-motel.html?checkin=2026-09-10&checkout=2026-09-12&group_adults=3&no_rooms=2");
    await page.getByRole("button", { name: "Check This Listing" }).click();
    await expect(page.getByText("2026-09-10 → 2026-09-12 · 3 adults · 2 units")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Configuration carried by the pasted link")).toBeVisible();
    await expect(page.getByRole("button", { name: /confirm/i })).toHaveCount(0);
  });

  test("Unsupported OTA input and persisted legacy status boundary pages are explicit", async ({ page }) => {
    test.slow();
    await goto(page, "/en/check");
    await page.getByLabel(listingUrlLabel.en).fill("https://www.booking.com/hotel/au/sydney.html");
    await page.getByRole("button", { name: "Check This Listing" }).click();
    await expect(page.getByText("Enter a supported public OTA listing URL.")).toBeVisible();

    for (const [status, label] of [
      ["SOURCE_UNAVAILABLE", "Source unavailable"],
      ["INSUFFICIENT_DATA", "Insufficient data"],
      ["PARTIAL", "Partial result"],
      ["NEEDS_CONFIRMATION", "Needs confirmation"],
    ]) {
      const response = await page.evaluate(async (data) => {
        const result = await fetch("/api/v1/price-checks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
        return { status: result.status, body: await result.json() as { data: { checkId: string } } };
      }, {
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
  }).toBeGreaterThanOrEqual(minimum);
  return result;
}

test.describe("member accessibility and responsive contract", () => {
  const email = `member-accessibility-${Date.now()}@tymra.test`;
  const password = "member accessibility test password";
  let customerId = "";
  let membershipRequestOrigin = "";

  test.beforeAll(async ({ request }) => {
    let responseText = "";
    let body: { data: { customer: { id: string } } } | undefined;
    for (const candidateOrigin of ["http://localhost:3000", "https://tymra.test"]) {
      const response = await request.post("http://localhost:3000/api/v1/customer/auth/register", {
        headers: { origin: candidateOrigin, "x-forwarded-for": "198.51.100.80" },
        data: { email, password, locale: "en", serviceConsent: true },
      });
      responseText = await response.text();
      if (response.status() === 201) {
        body = JSON.parse(responseText) as { data: { customer: { id: string } } };
        membershipRequestOrigin = candidateOrigin;
        break;
      }
      expect(response.status(), responseText).toBe(403);
    }
    expect(body, responseText).toBeDefined();
    if (!body) throw new Error(responseText);
    customerId = body.data.customer.id;
    await prisma.customerUser.update({ where: { id: customerId }, data: { emailVerifiedAt: new Date() } });
  });

  test.afterAll(async () => {
    if (customerId) await prisma.customerUser.deleteMany({ where: { id: customerId } });
  });

  test("EN/ZH member routes pass axe, keyboard, reduced-motion and compact-width checks", async ({ page }, testInfo) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const memberOrigin = "http://localhost:3000";
    expect(membershipRequestOrigin, "one configured public origin must accept member registration").not.toBe("");
    await page.route("**/api/v1/customer/auth/password", async (route) => {
      await route.continue({ headers: { ...route.request().headers(), origin: membershipRequestOrigin } });
    });
    await goto(page, `${memberOrigin}/en/sign-in?returnTo=${encodeURIComponent("/en/account")}`);
    await page.getByLabel("Membership email").fill(email);
    await page.getByLabel("Password").fill(password);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.getByRole("button", { name: "Sign in" }).click();
      const signedIn = await page.waitForURL(/\/en\/account$/, { timeout: 5_000 }).then(() => true).catch(() => false);
      if (signedIn) break;
      await expect(page.getByRole("alert")).toHaveText("Failed to fetch");
      if (attempt < 3) await page.waitForTimeout(500);
    }
    await expect(page).toHaveURL(/\/en\/account$/, { timeout: 30_000 });

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

  test("signs in and opens the operational workspaces", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "The operations workspace is a desktop-only surface.");
    await gotoAdmin(page, "/admin/sign-in");
    await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL || "admin@tymra.test");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/^https?:\/\/ops\.tymra\.test(?::3000)?\/admin\/exceptions/);
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
