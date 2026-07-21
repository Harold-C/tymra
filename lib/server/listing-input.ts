export type SupportedOta = "BOOKING" | "AIRBNB";

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
    super("Enter a supported Booking.com or Airbnb listing URL.");
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
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  let platform: SupportedOta;
  let listingId: string | null = null;

  if (hostname === "booking.com" || hostname.endsWith(".booking.com")) {
    platform = "BOOKING";
    const match = url.pathname.match(/^\/hotel\/nz\/([^/]+?)(?:\.html)?\/?$/i);
    listingId = match?.[1] ? decodeURIComponent(match[1]).toLowerCase() : null;
  } else if (hostname === "airbnb.com" || hostname.endsWith(".airbnb.com") || hostname === "airbnb.co.nz" || hostname.endsWith(".airbnb.co.nz")) {
    platform = "AIRBNB";
    const match = url.pathname.match(/^\/rooms\/(\d+)(?:\/|$)/i);
    listingId = match?.[1] ?? null;
  } else {
    throw new UnsupportedListingUrlError();
  }

  if (!listingId) throw new UnsupportedListingUrlError();
  const embedded = readEmbeddedContext(url, platform);
  return {
    platform,
    listingId,
    context: embedded ?? defaultContext(now),
  };
}

function readEmbeddedContext(url: URL, platform: SupportedOta): ListingPricingContext | null {
  const checkIn = url.searchParams.get(platform === "BOOKING" ? "checkin" : "check_in");
  const checkOut = url.searchParams.get(platform === "BOOKING" ? "checkout" : "check_out");
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) return null;

  return {
    source: "URL",
    checkIn,
    checkOut,
    adults: boundedInteger(url.searchParams.get(platform === "BOOKING" ? "group_adults" : "adults"), 2, 1, 16),
    children: boundedInteger(url.searchParams.get(platform === "BOOKING" ? "group_children" : "children"), 0, 0, 16),
    units: boundedInteger(url.searchParams.get(platform === "BOOKING" ? "no_rooms" : "units"), 1, 1, 10),
    currency: "NZD",
    timezone: "Pacific/Auckland",
  };
}

function defaultContext(now: Date): ListingPricingContext {
  const checkIn = startOfUtcDay(now);
  checkIn.setUTCDate(checkIn.getUTCDate() + 7);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 1);
  return {
    source: "OTA_DEFAULT",
    checkIn: isoDate(checkIn),
    checkOut: isoDate(checkOut),
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

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
