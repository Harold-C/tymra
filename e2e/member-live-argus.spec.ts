import { expect, test, type Page } from "playwright/test";

const enabled = process.env.MEMBER_LIVE_E2E === "1";

test.describe("member live Argus acceptance", () => {
  test.skip(!enabled, "Set MEMBER_LIVE_E2E=1 to run the real Argus acceptance gate.");

  test("a verified member receives non-demo public OTA evidence", async ({ page }) => {
    const email = required("MEMBER_LIVE_EMAIL");
    const password = required("MEMBER_LIVE_PASSWORD");
    const input = required("MEMBER_LIVE_INPUT");
    const analysisType = process.env.MEMBER_LIVE_ANALYSIS_TYPE ?? (looksLikeUrl(input) ? "LISTING_PRICING" : "LOCATION_BENCHMARK");

    await page.goto("/en/sign-in", { waitUntil: "domcontentloaded" });
    await page.locator("#member-email").fill(email);
    await page.locator("#member-password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/en\/account(?:[/?]|$)/);

    await page.goto("/en/address-check", { waitUntil: "domcontentloaded" });
    await page.locator(`input[name="analysisType"][value="${analysisType}"]`).check();
    await page.locator("#check-input").fill(input);
    await page.getByRole("button", { name: /search/i }).click();
    await expect(page).toHaveURL(/\/en\/check\/[^/]+\/(?:property|listing|unit|query)/, { timeout: 120_000 });

    const checkId = checkIdFrom(page.url());
    await completeConfirmations(page, input);
    await expect(page).toHaveURL(new RegExp(`/en/check/${checkId}/status`));

    await expect.poll(async () => {
      const response = await page.request.get(`/api/v1/customer/checks/${checkId}`);
      if (!response.ok()) return `HTTP_${response.status()}`;
      const payload = await response.json() as { data?: { terminal?: boolean; status?: string; isDemo?: boolean; result?: { observedPrices?: unknown[] } } };
      if (!payload.data?.terminal) return payload.data?.status ?? "PENDING";
      if (payload.data.isDemo) return "DEMO_RESULT";
      if (!payload.data.result?.observedPrices?.length) return `NO_PUBLIC_PRICE:${payload.data.status}`;
      return "LIVE_PUBLIC_PRICE_READY";
    }, { timeout: 8 * 60_000, intervals: [2_000, 5_000, 10_000] }).toBe("LIVE_PUBLIC_PRICE_READY");

    await page.goto(`/en/account/checks/${checkId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#observed-price-heading")).toBeVisible();
    await expect(page.locator(".observed-price-list article").first()).toBeVisible();
    await expect(page.locator(".formal-demo")).toHaveCount(0);
  });
});

async function completeConfirmations(page: Page, originalInput: string) {
  for (let step = 0; step < 4; step += 1) {
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
      await page.locator("form button[type=submit]").click();
    } else {
      return;
    }
    await page.waitForURL(/\/en\/check\/[^/]+\/(?:property|listing|unit|query|status)/, { timeout: 120_000 });
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

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when MEMBER_LIVE_E2E=1`);
  return value;
}
