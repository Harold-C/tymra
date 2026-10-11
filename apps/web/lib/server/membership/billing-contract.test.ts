import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { launchPriceTiers, signBillingQuote, validateLaunchPrice, verifyBillingQuote, type BillingQuote } from "./billing-contract";
import { csvCell } from "./member-exports";

describe("billing contract integrity", () => {
  it("accepts only the exact graduated monthly GST-inclusive tariff", () => {
    const price = { active: true, currency: "nzd", type: "recurring", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "inclusive", billing_scheme: "tiered", tiers_mode: "graduated", tiers: launchPriceTiers.HOST } as unknown as Stripe.Price;
    expect(() => validateLaunchPrice(price, "HOST")).not.toThrow();
    for (const change of [{ currency: "usd" }, { tax_behavior: "exclusive" }, { tiers_mode: "volume" }, { recurring: { interval: "year" } }, { tiers: [] }, { active: false }]) expect(() => validateLaunchPrice({ ...price, ...change } as Stripe.Price, "HOST")).toThrow();
  });
  it("binds a quote to its owner, subscription version, capacity and short expiry", () => {
    const secret = "synthetic-test-signing-key";
    const quote: BillingQuote = { customerUserId: "owner", version: 3, plan: "PRO", capacity: 20, prorationDate: 1000, priceId: "price_pro", mode: "IMMEDIATE", amountDueMinor: 3500, recurringMinor: 9900 };
    const token = signBillingQuote(quote, secret);
    expect(verifyBillingQuote(token, quote, secret, 1100000)).toEqual(quote);
    expect(() => verifyBillingQuote(token, { ...quote, customerUserId: "other" }, secret, 1100000)).toThrow();
    expect(() => verifyBillingQuote(token, { ...quote, capacity: 200 }, secret, 1100000)).toThrow();
    expect(() => verifyBillingQuote(token, quote, secret, 1600001)).toThrow();
    expect(() => verifyBillingQuote(`${token}x`, quote, secret, 1100000)).toThrow();
  });
  it("exports spreadsheet formulas as literal text", () => {
    expect(csvCell('=HYPERLINK("https://example.test")')).toBe('"\'=HYPERLINK(""https://example.test"")"');
    expect(csvCell("normal, value")).toBe('"normal, value"');
  });
});
