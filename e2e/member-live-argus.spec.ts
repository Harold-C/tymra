import { expect, test, type Page } from "playwright/test";

const enabled = process.env.MEMBER_LIVE_E2E === "1";

test.describe("member live Argus acceptance", () => {
  test.skip(!enabled, "Set MEMBER_LIVE_E2E=1 to run the real Argus acceptance gate.");

  test("a verified member receives non-demo public OTA evidence", async ({ page }) => {
    const email = required("MEMBER_LIVE_EMAIL");
    const password = required("MEMBER_LIVE_PASSWORD");
    const input = required("MEMBER_LIVE_INPUT");
    const analysisType = process.env.MEMBER_LIVE_ANALYSIS_TYPE ?? (looksLikeUrl(input) ? "LISTING_PRICING" : "LOCATION_BENCHMARK");

    // The development build can finish streaming HTML before the client-side
    // sign-in handler is hydrated. Waiting for network idle prevents the test
    // from falling back to a native POST against the page route.
    await page.goto("/en/sign-in", { waitUntil: "networkidle" });
    await page.locator("#member-email").fill(email);
    const passwordInput = page.locator("#member-password");
    await passwordInput.fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    if (/\/sign-in(?:[/?]|$)/.test(page.url())) await passwordInput.fill("");
    await expect(page).toHaveURL(/\/en\/account(?:[/?]|$)/);

    await page.goto("/en/address-check", { waitUntil: "networkidle" });
    await page.locator(`input[name="analysisType"][value="${analysisType}"]`).check();
    await page.locator("#check-input").fill(input);
    await page.getByRole("button", { name: /search/i }).click();
    await expect(page).toHaveURL(/\/en\/check\/[^/]+\/(?:property|listing|unit|query|status)/, { timeout: 120_000 });

    const checkId = checkIdFrom(page.url());
    console.log(`member-live check created: ${checkId}`);
    if (/\/status(?:[/?]|$)/.test(page.url())) await continueAfterAsyncValidation(page, checkId);
    await completeConfirmations(page, input);
    await expect(page).toHaveURL(new RegExp(`/en/check/${checkId}/status`));

    await waitForLivePublicPrice(page, checkId);

    console.log("member-live public price published");
    await page.goto(`/en/account/checks/${checkId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator("#observed-price-heading")).toBeVisible();
    await expect(page.locator(".observed-price-list article").first()).toBeVisible();
    await expect(page.locator(".formal-demo")).toHaveCount(0);
  });
});

async function continueAfterAsyncValidation(page: Page, checkId: string) {
  let nextAction = "WAIT";
  await expect.poll(async () => {
    const response = await page.request.get(`/api/v1/price-checks/${checkId}`);
    if (!response.ok()) return `HTTP_${response.status()}`;
    const payload = await response.json() as { data?: { nextAction?: string; status?: string } };
    nextAction = payload.data?.nextAction ?? "WAIT";
    return nextAction;
  }, { timeout: 8 * 60_000, intervals: [2_000, 5_000, 10_000] }).toMatch(/^CONFIRM_(?:LISTING|UNIT|QUERY)$/);
  const step = nextAction === "CONFIRM_LISTING" ? "listing" : nextAction === "CONFIRM_UNIT" ? "unit" : "query";
  await page.goto(`/en/check/${checkId}/${step}`, { waitUntil: "networkidle" });
}

async function waitForLivePublicPrice(page: Page, checkId: string) {
  const timeoutMs = Number.parseInt(process.env.MEMBER_LIVE_TIMEOUT_MS ?? String(15 * 60_000), 10);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 60_000) throw new Error("MEMBER_LIVE_TIMEOUT_MS must be at least 60000");
  const deadline = Date.now() + timeoutMs;
  let lastReportedStatus = "";
  while (Date.now() < deadline) {
    const response = await page.request.get(`/api/v1/customer/checks/${checkId}`, { timeout: 10_000 });
    if (!response.ok()) throw new Error(`Customer check returned HTTP ${response.status()}`);
    const payload = await response.json() as { data?: { terminal?: boolean; status?: string; isDemo?: boolean; result?: { observedPrices?: unknown[] } } };
    const status = payload.data?.status ?? "PENDING";
    if (status !== lastReportedStatus) {
      console.log(`member-live check status: ${status}`);
      lastReportedStatus = status;
    }
    if (payload.data?.terminal) {
      if (payload.data.isDemo) throw new Error("Member live acceptance returned a demo result");
      if (!payload.data.result?.observedPrices?.length) throw new Error(`Member live acceptance ended without a public price: ${status}`);
      return;
    }
    await page.waitForTimeout(5_000);
  }
  throw new Error("Member live acceptance timed out waiting for a terminal result");
}

async function completeConfirmations(page: Page, originalInput: string) {
  for (let step = 0; step < 4; step += 1) {
    const previousPath = new URL(page.url()).pathname;
    if (/\/property(?:[/?]|$)/.test(page.url())) {
      await page.locator(".selection-row:not([disabled])").first().click();
    } else if (/\/listing(?:[/?]|$)/.test(page.url())) {
      const listingUrl = process.env.MEMBER_LIVE_LISTING_URL ?? (looksLikeUrl(originalInput) ? originalInput : "");
      if (!listingUrl) throw new Error("MEMBER_LIVE_LISTING_URL is required when address resolution asks for listing confirmation");
      await page.locator("#listing-url").fill(listingUrl);
      await page.locator("form button[type=submit]").click();
    } else if (/\/unit(?:[/?]|$)/.test(page.url())) {
      await page.locator(".selection-row:not([disabled])").first().click();
    } else if (/\/query(?:[/?]|$)/.test(page.url())) {
      const nights = Number.parseInt(process.env.MEMBER_LIVE_NIGHTS ?? "1", 10);
      if (!Number.isInteger(nights) || nights < 1 || nights > 30) {
        throw new Error("MEMBER_LIVE_NIGHTS must be an integer from 1 to 30");
      }
      await page.locator("#check-in").waitFor({ state: "visible", timeout: 30_000 });
      if (nights !== 1) {
        const checkIn = await page.locator("#check-in").inputValue();
        await page.locator("#check-out").fill(addCalendarDays(checkIn, nights));
      }
      await page.locator("form button[type=submit]").click();
    } else {
      return;
    }
    await page.waitForURL((url) => url.pathname !== previousPath && /\/en\/check\/[^/]+\/(?:property|listing|unit|query|status)/.test(url.pathname), { timeout: 120_000 });
    if (/\/status(?:[/?]|$)/.test(page.url())) return;
  }
  throw new Error(`Member live flow did not reach status; current URL: ${page.url()}`);
}

function checkIdFrom(url: string) {
  const match = new URL(url).pathname.match(/\/check\/([^/]+)\//);
  if (!match) throw new Error(`Could not read check ID from ${url}`);
  return match[1];
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function addCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when MEMBER_LIVE_E2E=1`);
  return value;
}
