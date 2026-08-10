import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { BillingError, constructStripeEvent, processStripeEvent } from "@/lib/server/stripe-billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return apiError(400, "STRIPE_SIGNATURE_REQUIRED", "The Stripe signature header is required.");
  const rawBody = await request.text();
  try {
    const event = constructStripeEvent(rawBody, signature);
    return apiSuccess(await processStripeEvent(event, rawBody));
  } catch (error) {
    if (error instanceof BillingError) return apiError(503, error.code, error.message);
    if (error instanceof Error && error.message.toLowerCase().includes("signature")) return apiError(400, "INVALID_STRIPE_SIGNATURE", "The Stripe webhook signature is invalid.");
    return apiException(error);
  }
}
