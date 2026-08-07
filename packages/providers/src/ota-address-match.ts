export type OtaAddressMatchInput = {
  address: string | null | undefined;
  city: string | null | undefined;
  region: string | null | undefined;
  countryCode: string | null | undefined;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
};

export type OtaAddressMatchResult = {
  status: "MATCH" | "CONFLICT" | "INSUFFICIENT";
  confidence: number;
  distanceMetres: number | null;
  reasons: string[];
};

export type OtaDiscoveryMarketResult = {
  status: "COMPARABLE" | "TARGET" | "OUT_OF_SCOPE" | "INSUFFICIENT";
  city: string | null;
  citySource: "LISTING" | "SEARCH_SCOPE" | null;
  distanceMetres: number | null;
  reasons: string[];
};

export function matchOtaListingToConfirmedAddress(confirmed: OtaAddressMatchInput, listing: OtaAddressMatchInput): OtaAddressMatchResult {
  const reasons: string[] = [];
  if (normalizeCountry(confirmed.countryCode) !== "NZ" || normalizeCountry(listing.countryCode) !== "NZ") {
    return { status: "CONFLICT", confidence: 0, distanceMetres: null, reasons: ["COUNTRY_MISMATCH"] };
  }
  const confirmedRegion = normalizeText(confirmed.region);
  const listingRegion = normalizeText(listing.region);
  if (confirmedRegion && listingRegion && confirmedRegion !== listingRegion) reasons.push("REGION_MISMATCH");
  const confirmedCity = normalizeText(confirmed.city);
  const listingCity = normalizeText(listing.city);
  if (confirmedCity && listingCity && confirmedCity !== listingCity) reasons.push("CITY_MISMATCH");

  const distanceMetres = coordinateDistanceMetres(confirmed, listing);
  if (distanceMetres !== null && distanceMetres > 2_000) reasons.push("COORDINATE_DISTANCE_EXCEEDED");
  if (reasons.length) return { status: "CONFLICT", confidence: 0, distanceMetres, reasons };

  const addressScore = tokenOverlap(normalizeText(confirmed.address), normalizeText(listing.address));
  const exactAddress = Boolean(normalizeText(confirmed.address)) && normalizeText(confirmed.address) === normalizeText(listing.address);
  if (distanceMetres !== null && distanceMetres <= 250) {
    return { status: "MATCH", confidence: Number(Math.max(0.9, 1 - distanceMetres / 2_500).toFixed(3)), distanceMetres, reasons: ["COORDINATES_WITHIN_250M"] };
  }
  if (distanceMetres !== null && distanceMetres <= 2_000 && (exactAddress || addressScore >= 0.7)) {
    return { status: "MATCH", confidence: Number(Math.max(0.82, 0.96 - distanceMetres / 10_000).toFixed(3)), distanceMetres, reasons: ["ADDRESS_AND_COORDINATES_AGREE"] };
  }
  if (exactAddress || addressScore >= 0.9) {
    return { status: "MATCH", confidence: exactAddress ? 0.92 : 0.85, distanceMetres, reasons: ["ADDRESS_TEXT_AGREES"] };
  }
  return { status: "INSUFFICIENT", confidence: 0, distanceMetres, reasons: ["LISTING_LOCATION_NOT_PRECISE_ENOUGH"] };
}

export function locateOtaDiscoveryCandidate(
  confirmed: OtaAddressMatchInput,
  listing: OtaAddressMatchInput,
  radiusMetres = 5_000,
): OtaDiscoveryMarketResult {
  if (normalizeCountry(confirmed.countryCode) !== "NZ" || normalizeCountry(listing.countryCode) !== "NZ") {
    return { status: "OUT_OF_SCOPE", city: null, citySource: null, distanceMetres: null, reasons: ["COUNTRY_MISMATCH"] };
  }
  const confirmedCity = normalizeText(confirmed.city);
  const listingCity = normalizeText(listing.city);
  if (confirmedCity && listingCity && confirmedCity !== listingCity) {
    return { status: "OUT_OF_SCOPE", city: null, citySource: null, distanceMetres: coordinateDistanceMetres(confirmed, listing), reasons: ["CITY_MISMATCH"] };
  }
  const distanceMetres = coordinateDistanceMetres(confirmed, listing);
  if (distanceMetres !== null && distanceMetres > radiusMetres) {
    return { status: "OUT_OF_SCOPE", city: null, citySource: null, distanceMetres, reasons: ["DISCOVERY_RADIUS_EXCEEDED"] };
  }
  const confirmedAddress = normalizeText(confirmed.address);
  const listingAddress = normalizeText(listing.address);
  const sameAddress = Boolean(confirmedAddress && listingAddress)
    && (confirmedAddress === listingAddress || tokenOverlap(confirmedAddress, listingAddress) >= 0.9);
  if (sameAddress && (distanceMetres === null || distanceMetres <= 500)) {
    return { status: "TARGET", city: listing.city ?? confirmed.city ?? null, citySource: listingCity ? "LISTING" : confirmedCity ? "SEARCH_SCOPE" : null, distanceMetres, reasons: ["TARGET_ADDRESS_MATCH"] };
  }
  const city = listing.city?.trim() || confirmed.city?.trim() || null;
  if (!city || (!listingCity && distanceMetres === null)) {
    return { status: "INSUFFICIENT", city: null, citySource: null, distanceMetres, reasons: ["DISCOVERY_LOCATION_NOT_PRECISE_ENOUGH"] };
  }
  return {
    status: "COMPARABLE",
    city,
    citySource: listingCity ? "LISTING" : "SEARCH_SCOPE",
    distanceMetres,
    reasons: listingCity ? ["LISTING_CITY_IN_SEARCH_SCOPE"] : ["COORDINATES_IN_SEARCH_SCOPE"],
  };
}

function coordinateDistanceMetres(left: OtaAddressMatchInput, right: OtaAddressMatchInput) {
  if (![left.latitude, left.longitude, right.latitude, right.longitude].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  const toRadians = (value: number) => value * Math.PI / 180;
  const leftLatitude = toRadians(left.latitude!);
  const rightLatitude = toRadians(right.latitude!);
  const latitudeDelta = rightLatitude - leftLatitude;
  const longitudeDelta = toRadians(right.longitude! - left.longitude!);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function normalizeCountry(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function normalizeText(value: string | null | undefined) {
  return value?.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\bnew zealand\b/g, "").replace(/[^a-z0-9]+/g, " ").trim() ?? "";
}

function tokenOverlap(left: string, right: string) {
  if (!left || !right) return 0;
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}
