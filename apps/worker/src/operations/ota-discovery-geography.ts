// City searches are explicit frontier samples; they do not claim regional coverage.
const regionCities: Record<string, string> = {
  northland: "Whangarei", auckland: "Auckland", waikato: "Hamilton", "bay-of-plenty": "Tauranga",
  gisborne: "Gisborne", "hawkes-bay": "Napier", taranaki: "New Plymouth", "manawatu-whanganui": "Palmerston North",
  wellington: "Wellington", tasman: "Motueka", nelson: "Nelson", marlborough: "Blenheim", "west-coast": "Greymouth",
  canterbury: "Christchurch", otago: "Dunedin", southland: "Invercargill",
};

export function otaDiscoveryGeography(source: string, region: { key: string; name: string }) {
  const city = ["agoda", "trip"].includes(source) ? regionCities[region.key] : undefined;
  return { query: `${city ?? region.name}, New Zealand`, queryScope: city ? "CITY" : "REGION", searchCity: city ?? null };
}

export function otaObservedRegion(location: { city: string | null; region: string | null }, frontier: { regionKey?: unknown; regionName?: unknown }): string | null {
  const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (typeof frontier.regionKey !== "string" || typeof frontier.regionName !== "string") return location.region;
  const city = regionCities[frontier.regionKey];
  if (!city) return location.region;
  const expected = normalize(city);
  const actualCity = normalize(location.city ?? "");
  const actualRegion = normalize(location.region ?? "");
  // Some OTA postal schemas put the city in addressRegion. Correct that only
  // when both public locality fields establish the configured NZ city.
  if ((actualCity === expected || actualCity === `${expected} airport`)
    && (!actualRegion || actualRegion === expected || actualRegion === `${expected} airport`)) return frontier.regionName;
  return location.region;
}
