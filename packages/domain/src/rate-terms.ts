import { nzDateTime } from "./nz-time";

export const RATE_TERMS_VERSION = "public-rate-terms-v1";
/** Capture this key with the observation, never reconstruct old context from a mutable profile row. */
export function marketCollectionProfileKey(profile: Record<string, unknown>): string | null {
  const fields = ["id", "version", "ipRegion", "locale", "currency", "deviceType", "loggedInState", "memberState", "mobilePriceContext", "publicRateContext", "browserProfileVersion"];
  if (fields.some(field => profile[field] === undefined || profile[field] === null || profile[field] === "")
    || profile.loggedInState !== "LOGGED_OUT" || profile.memberState !== "NON_MEMBER" || profile.currency !== "NZD"
    || profile.publicRateContext !== "PUBLIC_ANONYMOUS") return null;
  return JSON.stringify(["market-profile-v1", ...fields.map(field => profile[field])]);
}
export type RateTermsInput = {
  mealPlan?: string | null; cancellationPolicy?: string | null; paymentTerms?: string | null;
  rateFence?: string | null; checkIn: string; qualityFlags?: readonly string[];
};
const token = (value?: string | null) => (value ?? "").normalize("NFKC").trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").replace(/[.!]$/, "");

/** Conservative, evidence-preserving aliases. No model inference or unknown-to-default conversion. */
export function normalizeRateTerms(input: RateTermsInput) {
  const meal = token(input.mealPlan), cancel = token(input.cancellationPolicy), pay = token(input.paymentTerms);
  const mealPlan = ["ROOM ONLY", "NO MEALS", "NO MEALS INCLUDED"].includes(meal) ? "ROOM_ONLY"
    : meal === "BREAKFAST INCLUDED" ? "BREAKFAST_INCLUDED"
    : meal === "NOT APPLICABLE" ? "NOT_APPLICABLE" : "UNKNOWN";
  const payment = ["PAY AT PROPERTY", "PAY AT THE PROPERTY", "NO PREPAYMENT NEEDED – PAY AT THE PROPERTY"].includes(pay) ? "PAY_AT_PROPERTY"
    : ["PREPAYMENT", "PAY NOW", "PREPAYMENT REQUIRED"].includes(pay) ? "PREPAYMENT" : "UNKNOWN";
  const cancellation = cancel === "NON REFUNDABLE" ? "NON_REFUNDABLE"
    : cancel === "FREE CANCELLATION" || /^FREE CANCELLATION BEFORE /.test(cancel) ? "FREE_CANCELLATION" : "UNKNOWN";
  // Only an explicit offset-bearing timestamp is unambiguous. Date-only/truncated OTA prose stays blocked.
  const deadline = /^Free cancellation before (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))\.?$/i.exec((input.cancellationPolicy ?? "").trim());
  let cancellationDeadlineHours: number | null = null;
  if (deadline && Number.isFinite(Date.parse(deadline[1]))) {
    const checkInMidnight = nzDateTime(`${input.checkIn.slice(0, 10)}T00:00`).getTime();
    cancellationDeadlineHours = (checkInMidnight - Date.parse(deadline[1])) / 3_600_000;
  }
  const publicRate = ["PUBLIC", "PUBLIC SIGNED OUT", "PUBLIC ANONYMOUS"].includes(token(input.rateFence));
  const blockers = [
    ...(mealPlan === "UNKNOWN" ? ["MEAL_TERMS_UNKNOWN"] : []),
    ...(payment === "UNKNOWN" ? ["PAYMENT_TERMS_UNKNOWN"] : []),
    ...(cancellation === "UNKNOWN" ? ["CANCELLATION_TERMS_UNKNOWN"] : []),
    ...(cancellation === "FREE_CANCELLATION" && cancellationDeadlineHours === null ? ["CANCELLATION_DEADLINE_UNKNOWN"] : []),
    ...(!publicRate ? ["NOT_ANONYMOUS_PUBLIC"] : []),
    ...(input.qualityFlags ?? []).filter(flag => /UNKNOWN|PARTIAL|NOT_CAPTURED|UNCLEAR|PROMOTION/.test(flag)),
  ];
  return {
    version: RATE_TERMS_VERSION,
    raw: { mealPlan: input.mealPlan ?? null, cancellationPolicy: input.cancellationPolicy ?? null, paymentTerms: input.paymentTerms ?? null, rateFence: input.rateFence ?? null },
    mealPlan, cancellation, cancellationDeadlineHours, payment, publicRate, blockers: [...new Set(blockers)],
    comparisonKey: blockers.length ? null : JSON.stringify([RATE_TERMS_VERSION, mealPlan, cancellation, cancellationDeadlineHours, payment, "PUBLIC_ANONYMOUS"]),
  };
}
