import { createHmac, timingSafeEqual } from "node:crypto";
import { membershipCapacity, type MembershipPlanId } from "@tymra/domain";
import type Stripe from "stripe";

export class BillingError extends Error {
  constructor(readonly code: "BILLING_DISABLED" | "PLAN_NOT_AVAILABLE" | "SUBSCRIPTION_NOT_FOUND" | "INVALID_PRICE_CONFIGURATION" | "PRICING_UNIT_SELECTION_REQUIRED" | "INVALID_QUOTE" | "BILLING_CHANGE_PENDING" | "PAYMENT_REQUIRED", message: string) {
    super(message);
    this.name = "BillingError";
  }
}

export function validatedCapacity(plan: MembershipPlanId, requested?: number) {
  try { return membershipCapacity(plan, requested); }
  catch { throw new BillingError("PLAN_NOT_AVAILABLE", "Choose 1–200 monitored objects. Larger portfolios require a capacity review and quote."); }
}

// One licensed item, graduated tiers. Flat amounts are charged once per reached tier.
export const launchPriceTiers = {
  HOST: [{ up_to: 1, flat_amount: 1900, unit_amount: 0 }, { up_to: 5, flat_amount: 1000, unit_amount: 0 }, { up_to: null, flat_amount: 0, unit_amount: 400 }],
  PRO: [{ up_to: 20, flat_amount: 9900, unit_amount: 0 }, { up_to: null, flat_amount: 0, unit_amount: 490 }],
  PORTFOLIO: [{ up_to: 50, flat_amount: 24900, unit_amount: 0 }, { up_to: 100, flat_amount: 0, unit_amount: 400 }, { up_to: null, flat_amount: 0, unit_amount: 300 }],
} as const;

export function validateLaunchPrice(price: Stripe.Price, plan: Exclude<MembershipPlanId, "FREE">) {
  const tiers = launchPriceTiers[plan];
  if (!price.active || price.currency !== "nzd" || price.type !== "recurring" || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 || price.recurring.usage_type !== "licensed" || price.tax_behavior !== "inclusive" || price.billing_scheme !== "tiered" || price.tiers_mode !== "graduated" || price.transform_quantity || price.tiers?.length !== tiers.length || !tiers.every((tier, index) => {
    const actual = price.tiers?.[index];
    return actual?.up_to === tier.up_to && (actual.flat_amount ?? 0) === tier.flat_amount && (actual.unit_amount ?? 0) === tier.unit_amount && (actual.unit_amount_decimal == null || Number(actual.unit_amount_decimal) === tier.unit_amount) && (actual.flat_amount_decimal == null || Number(actual.flat_amount_decimal) === tier.flat_amount);
  })) throw new BillingError("INVALID_PRICE_CONFIGURATION", `${plan} requires the approved monthly NZD GST-inclusive graduated Price. Billing is closed until the tariff matches.`);
}

export type BillingQuote = { customerUserId: string; version: number; plan: Exclude<MembershipPlanId, "FREE">; capacity: number; prorationDate: number; priceId: string; mode: "IMMEDIATE" | "NEXT_PERIOD"; amountDueMinor: number; recurringMinor: number };

export function signBillingQuote(quote: BillingQuote, secret: string): string {
  const payload = Buffer.from(JSON.stringify(quote)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyBillingQuote(token: string | undefined, expected: Pick<BillingQuote, "customerUserId" | "version" | "plan" | "capacity" | "priceId">, secret: string, now = Date.now()): BillingQuote {
  try {
    const [payload, signature, extra] = (token ?? "").split(".");
    if (!payload || !signature || extra) throw new Error();
    const digest = createHmac("sha256", secret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== digest.length || !timingSafeEqual(actual, digest)) throw new Error();
    const quote = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as BillingQuote;
    if (!Object.entries(expected).every(([key, value]) => quote[key as keyof BillingQuote] === value) || quote.prorationDate * 1000 > now || now - quote.prorationDate * 1000 > 10 * 60_000) throw new Error();
    return quote;
  } catch { throw new BillingError("INVALID_QUOTE", "This quote has expired or the subscription changed. Review a fresh quote before confirming."); }
}
