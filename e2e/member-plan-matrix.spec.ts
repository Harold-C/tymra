import { expect, test, type Page } from "playwright/test";

const features = {
  alerts: enabled("BILLING_ENABLED") && enabled("MEMBERSHIP_HOST_LAUNCH_ENABLED"),
  portfolio: enabled("BILLING_ENABLED") && enabled("MEMBERSHIP_PRO_LAUNCH_ENABLED"),
  exports: enabled("BILLING_ENABLED") && enabled("MEMBERSHIP_PRO_LAUNCH_ENABLED") && enabled("MEMBERSHIP_EXPORT_LAUNCH_ENABLED"),
  integrations: enabled("BILLING_ENABLED") && enabled("MEMBERSHIP_PORTFOLIO_LAUNCH_ENABLED") && enabled("MEMBERSHIP_API_LAUNCH_ENABLED"),
};

const plans = [
  { email: "demo1@tymra.test", plan: "FREE", displayName: "Free", slots: 1, dailyDays: 14, monitoringDays: 30, checks: 2, rank: 0 },
  { email: "demo2@tymra.test", plan: "HOST", displayName: "Host", slots: 1, dailyDays: 30, monitoringDays: 90, checks: 10, rank: 1 },
  { email: "demo3@tymra.test", plan: "PRO", displayName: "Pro", slots: 5, dailyDays: 90, monitoringDays: 180, checks: 60, rank: 2 },
  { email: "demo4@tymra.test", plan: "PORTFOLIO", displayName: "Portfolio", slots: 20, dailyDays: 180, monitoringDays: 365, checks: 300, rank: 3 },
] as const;

test.describe("fixed development member plan matrix", () => {
  for (const expected of plans) {
    test(`${expected.plan} account exposes only its contracted entitlements`, async ({ page }) => {
      await signIn(page, expected.email, required("STRIPE_TEST_MEMBER_PASSWORD"));
      const response = await page.request.get("/api/v1/customer/membership");
      expect(response.ok()).toBe(true);
      const payload = await response.json() as { data: {
        plan: string;
        status: string;
        usage: { remainingSpotChecks: number };
        pricingUnits: Array<{ occupiesSlot: boolean }>;
        entitlements: { activePricingUnitLimit: number; rollingSpotCheckLimit: number; dailyPriceCheckHorizonDays: number; monitoringHorizonDays: number };
        launchAvailability: Record<string, boolean>;
      } };
      expect(payload.data).toMatchObject({
        plan: expected.plan,
        status: "ACTIVE",
        entitlements: {
          activePricingUnitLimit: expected.slots,
          rollingSpotCheckLimit: expected.plan === "FREE" ? 1 : expected.checks,
          dailyPriceCheckHorizonDays: expected.dailyDays,
          monitoringHorizonDays: expected.monitoringDays,
        },
      });
      expect(payload.data.usage.remainingSpotChecks).toBeGreaterThanOrEqual(0);
      expect(payload.data.usage.remainingSpotChecks).toBeLessThanOrEqual(expected.checks);
      expect(payload.data.launchAvailability[expected.plan]).toBe(true);

      await page.goto("/en/account/billing", { waitUntil: "domcontentloaded" });
      const membership = page.getByRole("region", { name: expected.displayName });
      await expect(membership.getByRole("heading", { name: expected.displayName, exact: true, level: 2 })).toBeVisible();
      const occupied = payload.data.pricingUnits.filter((unit) => unit.occupiesSlot).length;
      await expect(membership).toContainText(`${occupied}/${expected.slots}`);
      await expect(membership).toContainText(`${expected.dailyDays} days`);
      await expect(membership).toContainText(`${expected.monitoringDays} days`);

      const nav = page.getByRole("navigation", { name: "Member account navigation" });
      const expectedNavigation = {
        Alerts: expected.rank >= 1 && features.alerts,
        Portfolio: expected.rank >= 2 && features.portfolio,
        Exports: expected.rank >= 2 && features.exports,
        Integrations: expected.rank >= 3 && features.integrations,
      };
      for (const name of ["Alerts", "Portfolio", "Exports", "Integrations"] as const) {
        const link = nav.getByRole("link", { name, exact: true });
        if (expectedNavigation[name]) await expect(link).toBeVisible();
        else await expect(link).toHaveCount(0);
      }

      await verifyGatedRoute(page, "/en/account/alerts", expected.rank >= 1, features.alerts, /feature available/i);
      await verifyGatedRoute(page, "/en/account/exports", expected.rank >= 2, features.exports, /exports per New Zealand calendar month/i);
      await verifyGatedRoute(page, "/en/account/portfolio", expected.rank >= 2, features.portfolio, /feature available/i);
      await verifyGatedRoute(page, "/en/account/integrations", expected.rank >= 3, features.integrations, /feature available/i);
    });
  }
});

async function signIn(page: Page, email: string, password: string) {
  let ready = false;
  for (let attempt = 0; attempt < 3 && !ready; attempt += 1) {
    const navigation = await page.goto("/en/sign-in", { waitUntil: "networkidle", timeout: 30_000 }).catch(() => null);
    ready = Boolean(navigation?.ok()) && await page.locator("#member-email").isVisible().catch(() => false);
    if (!ready) await page.waitForTimeout(500);
  }
  expect(ready, "canonical development sign-in page should be reachable").toBe(true);
  await page.locator("#member-email").fill(email);
  await page.locator("#member-password").fill(password);
  const response = page.waitForResponse((candidate) => candidate.request().method() === "POST" && new URL(candidate.url()).pathname === "/api/v1/customer/auth/password");
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await response).ok()).toBe(true);
  await expect(page).toHaveURL(/\/en\/account(?:[/?]|$)/u);
}

async function verifyGatedRoute(page: Page, route: string, entitled: boolean, launched: boolean, launchedText: RegExp) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("navigation", { name: "Member account navigation" })).toBeVisible();
  if (!entitled) await expect(page.locator("main")).toContainText(/required/i);
  else if (!launched) await expect(page.locator("main")).toContainText(/coming soon|not passed the launch gate/i);
  else await expect(page.locator("main")).toContainText(launchedText);
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the fixed member matrix`);
  return value;
}

function enabled(name: string) {
  return process.env[name]?.trim() === "true";
}
