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
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (hostname === "booking.com" || hostname.endsWith(".booking.com")) {
      return /^\/hotel\/nz\/[^/]+(?:\.html)?\/?$/i.test(url.pathname);
    }
    if (hostname === "airbnb.com" || hostname.endsWith(".airbnb.com") || hostname === "airbnb.co.nz" || hostname.endsWith(".airbnb.co.nz")) {
      return /^\/rooms\/\d+(?:\/|$)/i.test(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
}
