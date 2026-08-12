import { createHash } from "node:crypto";

import { membershipEntitlements, type MembershipPlanId } from "@tymra/domain";
import Stripe from "stripe";

const paidPlans = ["HOST", "PRO", "PORTFOLIO"] as const satisfies readonly MembershipPlanId[];

async function main() {
  requireExact("STRIPE_ACCEPTANCE_CONFIRM_TEST_MODE", "YES");
  const secretKey = required("STRIPE_SECRET_KEY");
  if (!secretKey.startsWith("sk_test_")) throw new Error("STRIPE_SECRET_KEY must be a Stripe test-mode key");
  const webhookSecret = required("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret.startsWith("whsec_")) throw new Error("STRIPE_WEBHOOK_SECRET must be a webhook signing secret");
  const portalConfigurationId = required("STRIPE_PORTAL_CONFIGURATION_ID");
  const priceIds = {
    HOST: required("STRIPE_HOST_PRICE_ID"),
    PRO: required("STRIPE_PRO_PRICE_ID"),
    PORTFOLIO: required("STRIPE_PORTFOLIO_PRICE_ID"),
  } as const;
  if (new Set(Object.values(priceIds)).size !== paidPlans.length) throw new Error("Each paid plan must use a distinct Stripe Price");

  const client = new Stripe(secretKey);
  const [account, portal, ...prices] = await Promise.all([
    client.accounts.retrieve(),
    client.billingPortal.configurations.retrieve(portalConfigurationId),
    ...paidPlans.map((plan) => client.prices.retrieve(priceIds[plan])),
  ]);
  if (portal.livemode) throw new Error("The configured Stripe Customer Portal is not in test mode");
  if (!portal.active) throw new Error("The configured Stripe Customer Portal is inactive");

  for (const [index, plan] of paidPlans.entries()) {
    const price = prices[index]!;
    const expectedMinor = membershipEntitlements[plan].monthlyPriceMinor;
    if (price.livemode || !price.active || price.currency !== "nzd" || price.type !== "recurring"
      || price.recurring?.interval !== "month" || price.unit_amount !== expectedMinor || price.tax_behavior !== "inclusive") {
      throw new Error(`${plan} must map to an active test-mode monthly NZD GST-inclusive Price for ${expectedMinor} minor units`);
    }
  }

  process.stdout.write(`${JSON.stringify({
    ready: true,
    mode: "test",
    account: fingerprint((account as Stripe.Account).id),
    portal: fingerprint(portal.id),
    prices: Object.fromEntries(paidPlans.map((plan) => [plan, fingerprint(priceIds[plan])])),
    webhookConfigured: true,
  })}\n`);
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireExact(name: string, expected: string) {
  if (process.env[name] !== expected) throw new Error(`${name}=${expected} is required to prove explicit Stripe test-mode intent`);
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Stripe readiness verification failed"}\n`);
  process.exitCode = 1;
});
