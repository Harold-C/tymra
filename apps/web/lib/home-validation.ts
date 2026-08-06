import type { Locale } from "./home-content";
import { homeCopy } from "./home-content";

export type InputType = "empty" | "url" | "property_text";
export type ValidationCode = "empty" | "short" | "long" | "unsupportedUrl";

export type ValidationResult =
  | {
      ok: true;
      inputType: InputType;
    }
  | {
      ok: false;
      code: ValidationCode;
      message: string;
      inputType: InputType;
    };

export function getInputType(rawValue: string): InputType {
  const value = rawValue.trim();
  if (!value) return "empty";

  if (/^https?:\/\//i.test(value) || /^www\./i.test(value)) {
    return "url";
  }

  return "property_text";
}

export function validateHomeInput(rawValue: string, locale: Locale): ValidationResult {
  const value = rawValue.trim();
  const messages = homeCopy[locale].search.validations;
  const inputType = getInputType(rawValue);

  if (!value) {
    return { ok: false, code: "empty", message: messages.empty, inputType };
  }

  if (value.length < 3) {
    return { ok: false, code: "short", message: messages.short, inputType };
  }

  if (value.length > 500) {
    return { ok: false, code: "long", message: messages.long, inputType };
  }

  if (inputType !== "url" || !isSupportedListingUrl(value)) {
    return { ok: false, code: "unsupportedUrl", message: messages.unsupportedUrl, inputType };
  }

  return { ok: true, inputType };
}

export function isSupportedListingUrl(value: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (host === "booking.com" || host.endsWith(".booking.com")) return /^\/hotel\/nz\/[^/]+(?:\.html)?\/?$/i.test(url.pathname);
    if (["airbnb.com", "airbnb.co.nz"].some((domain) => host === domain || host.endsWith(`.${domain}`))) return /^\/rooms\/\d+(?:\/|$)/i.test(url.pathname);
    if (["expedia.co.nz", "expedia.com", "wotif.co.nz", "hotels.com"].some((domain) => host === domain || host.endsWith(`.${domain}`))) return /\.h\d+\.Hotel-Information|\/ho\d+(?:\/|$)/i.test(url.pathname) || Boolean(url.searchParams.get("selected") || url.searchParams.get("hotelId"));
    if (["bookabach.co.nz", "vrbo.com"].some((domain) => host === domain || host.endsWith(`.${domain}`))) return /\/p?\d+(?:ha)?(?:\/|$)/i.test(url.pathname) || Boolean(url.searchParams.get("propertyId"));
    if (host === "agoda.com" || host.endsWith(".agoda.com")) return /\/hotel\//i.test(url.pathname) || Boolean(url.searchParams.get("hotel_id"));
    if (host === "trip.com" || host.endsWith(".trip.com")) return /(?:hotel-detail-|\/detail\/)\d{3,}(?:\/|$)/i.test(url.pathname) || Boolean(url.searchParams.get("hotelId"));
    return false;
  } catch {
    return false;
  }
}
