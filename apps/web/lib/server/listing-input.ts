import { addNzCalendarDays } from "@tymra/domain";
import { otaProviderDetails, parseOtaListingReference, type OtaProvider } from "@tymra/providers";

export type SupportedOta = "BOOKING" | "AIRBNB" | "EXPEDIA" | "WOTIF" | "HOTELS_COM" | "BOOKABACH" | "VRBO" | "AGODA" | "TRIP_COM";

export type ListingPricingContext = {
  source: "URL" | "OTA_DEFAULT";
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  units: number;
  currency: "NZD";
  timezone: "Pacific/Auckland";
};

export type ResolvedListingInput = {
  platform: SupportedOta;
  listingId: string;
  context: ListingPricingContext;
};

export class UnsupportedListingUrlError extends Error {
  constructor() {
    super("Enter a supported public OTA listing URL.");
    this.name = "UnsupportedListingUrlError";
  }
}

export function resolveSupportedListingUrl(rawInput: string, now: Date = new Date()): ResolvedListingInput {
  let url: URL;
  try {
    url = new URL(rawInput.trim());
  } catch {
    throw new UnsupportedListingUrlError();
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsupportedListingUrlError();
  let reference;
  try {
    reference = parseOtaListingReference(url.toString());
  } catch {
    throw new UnsupportedListingUrlError();
  }
  if (reference.sourceId === "google_hotels") throw new UnsupportedListingUrlError();
  const provider = otaProviderDetails(reference.sourceId);
  if (!provider) throw new UnsupportedListingUrlError();
  const platform = provider.brand as SupportedOta;
  const embedded = readEmbeddedContext(url, reference.sourceId as OtaProvider);
  return {
    platform,
    listingId: reference.sourceListingId,
    context: embedded ?? defaultContext(now),
  };
}

function readEmbeddedContext(url: URL, provider: OtaProvider): ListingPricingContext | null {
  const parameterNames = pricingParameterNames(provider);
  const checkIn = firstParameter(url, parameterNames.checkIn);
  const checkOut = firstParameter(url, parameterNames.checkOut);
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) return null;

  return {
    source: "URL",
    checkIn,
    checkOut,
    adults: boundedInteger(firstParameter(url, parameterNames.adults), 2, 1, 16),
    children: boundedInteger(firstParameter(url, parameterNames.children), 0, 0, 16),
    units: boundedInteger(firstParameter(url, parameterNames.units), 1, 1, 10),
    currency: "NZD",
    timezone: "Pacific/Auckland",
  };
}

function pricingParameterNames(provider: OtaProvider) {
  if (provider === "booking") return { checkIn: ["checkin"], checkOut: ["checkout"], adults: ["group_adults"], children: ["group_children"], units: ["no_rooms"] };
  if (provider === "airbnb") return { checkIn: ["check_in"], checkOut: ["check_out"], adults: ["adults"], children: ["children"], units: ["units"] };
  if (["expedia", "wotif", "hotels"].includes(provider)) return { checkIn: ["chkin", "checkIn"], checkOut: ["chkout", "checkOut"], adults: ["adults"], children: ["children"], units: ["rooms", "units"] };
  return { checkIn: ["checkIn", "check_in"], checkOut: ["checkOut", "check_out"], adults: ["adults"], children: ["children"], units: ["rooms", "units"] };
}

function firstParameter(url: URL, names: string[]) {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value !== null) return value;
  }
  return null;
}

function defaultContext(now: Date): ListingPricingContext {
  const checkIn = addNzCalendarDays(now, 7);
  const checkOut = addNzCalendarDays(checkIn, 1);
  return {
    source: "OTA_DEFAULT",
    checkIn,
    checkOut,
    adults: 2,
    children: 0,
    units: 1,
    currency: "NZD",
    timezone: "Pacific/Auckland",
  };
}

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()));
}
