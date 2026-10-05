import type { z } from "zod";
import type { otaListingIdentitySchema } from "@tymra/providers";

type Identity = z.infer<typeof otaListingIdentitySchema>;

// Bump when identity extraction or validation changes so unchanged list cards
// cannot reuse details produced by the superseded parser.
export const OTA_IDENTITY_PARSER_VERSION = "ota-public-identity-20261003";

/** Pick the smallest physical unit that fits the bounded public stay. */
export function selectBoundedOtaUnits(units: Identity["units"], adults: number): Identity["units"] {
  return units.filter(unit => unit.capacity !== null && unit.capacity >= adults)
    .sort((left, right) => left.capacity! - right.capacity!
      || (left.externalId < right.externalId ? -1 : left.externalId > right.externalId ? 1 : 0)).slice(0, 1);
}

/** Public rental previews establish a source identity, never an exact-address match. */
export function isSourceScopedRentalIdentity(identity: Identity): boolean {
  if (identity.address && identity.latitude !== null && identity.longitude !== null) return false;
  if (!["airbnb", "bookabach"].includes(identity.provider) || identity.countryCode !== "NZ"
    || !identity.approximateLocation?.label.trim() || !(identity.city?.trim() || identity.region?.trim())
    || identity.warnings.includes("UNIT_CAPACITY_FROM_SEARCH_OCCUPANCY")) return false;
  const match = /^(airbnb|bookabach):([1-9]\d*)$/.exec(identity.sourceListingId);
  if (!match || match[1] !== identity.provider) return false;
  let url: URL;
  try { url = new URL(identity.canonicalUrl); } catch { return false; }
  const expectedPath = identity.provider === "airbnb" ? `/rooms/${match[2]}` : `/holiday-accommodation/p${match[2]}`;
  const hosts = identity.provider === "airbnb" ? ["www.airbnb.co.nz", "www.airbnb.com"] : ["www.bookabach.co.nz"];
  const unitId = identity.provider === "airbnb" ? identity.sourceListingId : `${identity.sourceListingId}:entire-home`;
  return hosts.includes(url.hostname) && url.pathname === expectedPath
    && identity.units.length === 1 && identity.units[0]?.externalId === unitId
    && identity.units[0].capacity !== null && identity.units[0].capacity > 0
    && identity.units[0].unitType !== "Search summary (not sellable)";
}
