import { expect, test, type Page } from "playwright/test";

test.describe("Stripe test-mode membership lifecycle", () => {
  test.skip(process.env.STRIPE_TEST_E2E !== "1", "Set STRIPE_TEST_E2E=1 explicitly");

  test("completes checkout, upgrade, downgrade, cancellation, resume and Portal", async ({ page }) => {
    expect(process.env.STRIPE_ACCEPTANCE_CONFIRM_TEST_MODE).toBe("YES");
    const email = required("STRIPE_TEST_MEMBER_EMAIL");
    const password = required("STRIPE_TEST_MEMBER_PASSWORD");

    await signIn(page, email, password);
    await expectMembership(page, { plan: "FREE", status: "ACTIVE" });
    await page.goto("/en/account/billing", { waitUntil: "networkidle" });
    await choosePlan(page, "Host");
    await expect(page).toHaveURL(/checkout\.stripe\.com/u, { timeout: 60_000 });
    await completeStripeCheckout(page);
    await expect(page).toHaveURL(/\/en\/account\?billing=success/u, { timeout: 120_000 });
    await expectMembership(page, { plan: "HOST", status: "ACTIVE" });

    await page.goto("/en/account/billing", { waitUntil: "networkidle" });
    await choosePlan(page, "Pro");
    await expectMembership(page, { plan: "PRO", status: "ACTIVE", pendingPlan: null });

    await page.goto("/en/account/billing", { waitUntil: "networkidle" });
    await choosePlan(page, "Host");
    await expectMembership(page, { plan: "PRO", status: "ACTIVE", pendingPlan: "HOST" });

    await page.goto("/en/account/billing", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Cancel at period end" }).click();
    await expectMembership(page, { plan: "PRO", status: "ACTIVE", cancelAtPeriodEnd: true, pendingPlan: "HOST" });

    await page.goto("/en/account/billing", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Resume renewal" }).click();
    await expectMembership(page, { plan: "PRO", status: "ACTIVE", cancelAtPeriodEnd: false, pendingPlan: "HOST" });

    await page.goto("/en/account/billing", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Manage billing" }).click();
    await expect(page).toHaveURL(/billing\.stripe\.com/u, { timeout: 60_000 });
  });
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/en/sign-in", { waitUntil: "networkidle" });
  await page.locator("#member-email").fill(email);
  const passwordInput = page.locator("#member-password");
  await passwordInput.fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  if (/\/sign-in(?:[/?]|$)/u.test(page.url())) await passwordInput.fill("");
  await expect(page).toHaveURL(/\/en\/account(?:[/?]|$)/u);
}

async function choosePlan(page: Page, plan: "Host" | "Pro") {
  const card = page.locator(".membership-plan-grid article").filter({ has: page.getByRole("heading", { name: plan, exact: true }) });
  await card.getByRole("button", { name: "Choose plan" }).click();
}

async function completeStripeCheckout(page: Page) {
  await page.locator('input[name="cardNumber"]').fill("4242424242424242");
  await page.locator('input[name="cardExpiry"]').fill("1234");
  await page.locator('input[name="cardCvc"]').fill("123");
  const name = page.locator('input[name="billingName"]');
  if (await name.count()) await name.fill("Tymra Stripe Acceptance");
  const postcode = page.locator('input[name="billingPostalCode"]');
  if (await postcode.count()) await postcode.fill("8011");
  await page.getByRole("button", { name: /subscribe|pay/iu }).click();
}

async function expectMembership(page: Page, expected: { plan: string; status: string; pendingPlan?: string | null; cancelAtPeriodEnd?: boolean }) {
  await expect.poll(async () => {
    const response = await page.request.get("/api/v1/customer/membership", { timeout: 10_000 });
    if (!response.ok()) return `HTTP_${response.status()}`;
    const payload = await response.json() as { data?: { plan?: string; status?: string; pendingPlan?: string | null; cancelAtPeriodEnd?: boolean } };
    const membership = payload.data;
    if (!membership) return "NO_MEMBERSHIP";
    return JSON.stringify({
      plan: membership.plan,
      status: membership.status,
      ...(Object.hasOwn(expected, "pendingPlan") ? { pendingPlan: membership.pendingPlan ?? null } : {}),
      ...(Object.hasOwn(expected, "cancelAtPeriodEnd") ? { cancelAtPeriodEnd: membership.cancelAtPeriodEnd } : {}),
    });
  }, { timeout: 120_000, intervals: [2_000, 5_000, 10_000] }).toBe(JSON.stringify(expected));
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when STRIPE_TEST_E2E=1`);
  return value;
}
