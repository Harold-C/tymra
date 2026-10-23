import { locationScopeSchema, type LocationScope } from "@tymra/domain";
import { nzRegionForTerritorialAuthority } from "./address-identity";

const ENDPOINT = "https://services.arcgis.com/xdsHIIxuCWByZiCB/ArcGIS/rest/services/LINZ_NZ_Suburbs_and_Localities/FeatureServer/0/query";
export const LOCALITY_SOURCE = "https://data.linz.govt.nz/layer/113764-nz-suburbs-and-localities/";
export type NzLocality = { id: string; name: string; city: string; territorialAuthority: string };
type Feature = { attributes: Record<string, unknown>; geometry?: { rings?: number[][][] } };
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

export class LinzLocalitiesProvider {
  private cache = new Map<string, { until: number; value: Feature[] }>();
  private pending = new Map<string, Promise<Feature[]>>();
  constructor(private fetcher: typeof fetch = fetch) {}

  private async query(params: Record<string, string>): Promise<Feature[]> {
    const url = new URL(ENDPOINT);
    new URLSearchParams({ f: "json", returnGeometry: "false", ...params }).forEach((value, key) => url.searchParams.set(key, value));
    const key = url.toString();
    const cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = (async () => {
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("LOCALITY_SOURCE_UNAVAILABLE");
      const result = await response.json() as { features?: Feature[]; error?: unknown; exceededTransferLimit?: boolean };
      if (result.error || !Array.isArray(result.features) || result.exceededTransferLimit) throw new Error("LOCALITY_SOURCE_UNAVAILABLE");
      if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { until: Date.now() + 3600000, value: result.features });
      return result.features;
    })();
    this.pending.set(key, request);
    try { return await request; } finally { this.pending.delete(key); }
  }

  async cities(): Promise<string[]> {
    return [...new Set((await this.cityGroups()).flatMap(group => group.cities))].sort();
  }

  async cityGroups(): Promise<{ region: string; cities: string[]; authorities: string[] }[]> {
    const features = await this.query({ where: "territorial_authority IS NOT NULL", outFields: "major_name,major_name_type,territorial_authority", returnDistinctValues: "true", orderByFields: "territorial_authority,major_name", resultRecordCount: "2000" });
    const groups = new Map<string, { cities: Set<string>; authorities: Set<string> }>();
    for (const { attributes: a } of features) {
      const authority = String(a.territorial_authority ?? "");
      if (!authority) continue;
      // Navigation uses the project's existing regional grouping. The selected
      // locality's actual polygon remains the analysis boundary.
      for (const district of authority.split(",").map(part => part.trim()).filter(Boolean)) {
        const region = nzRegionForTerritorialAuthority(district) ?? "Other areas";
        const group = groups.get(region) ?? { cities: new Set<string>(), authorities: new Set<string>() };
        group.authorities.add(authority);
        group.cities.add(district);
        groups.set(region, group);
      }
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([region, group]) => ({ region, cities: [...group.cities].sort(), authorities: [...group.authorities].sort() }));
  }

  async search(query: string, city?: string, region?: string): Promise<NzLocality[]> {
    const term = query.trim().replace(/[%_]/g, "").slice(0, 100);
    if (!city && term.length < 2) return [];
    const filters: string[] = [];
    if (region) {
      const group = (await this.cityGroups()).find(item => item.region === region);
      if (!group || city && !group.cities.includes(city)) return [];
      const authorities = city ? group.authorities.filter(value => value.split(",").some(part => part.trim() === city)) : group.authorities;
      filters.push(`territorial_authority IN (${authorities.map(literal).join(",")})`);
    } else filters.push(city ? `major_name = ${literal(city)}` : "1=1");
    if (term) filters.push(`(UPPER(name) LIKE ${literal(`%${term.toUpperCase()}%`)} OR UPPER(name_ascii) LIKE ${literal(`%${term.toUpperCase()}%`)})`);
    const features = await this.query({ where: filters.join(" AND "), outFields: "id,name,major_name,territorial_authority", orderByFields: "name", resultRecordCount: "2000" });
    return features.map(mapLocality);
  }

  async resolve(id: string): Promise<{ locality: NzLocality; scope: LocationScope; latitude: number; longitude: number }> {
    if (!/^\d{1,10}$/.test(id)) throw new Error("INVALID_LOCALITY");
    const features = await this.query({ where: `id = ${id}`, outFields: "id,name,major_name,territorial_authority", returnGeometry: "true", outSR: "4326" });
    if (features.length !== 1) throw new Error("LOCALITY_NOT_FOUND");
    const locality = mapLocality(features[0]);
    const scope = locationScopeSchema.parse({ kind: "SUBURB_BOUNDARY", label: `${locality.name} · ${locality.city}`, localityId: id, city: locality.city, sourceUrl: LOCALITY_SOURCE, resolvedAt: new Date().toISOString(), rings: features[0].geometry?.rings });
    if (scope.kind !== "SUBURB_BOUNDARY") throw new Error("INVALID_LOCALITY");
    const points = scope.rings.flat();
    const longitude = points.reduce((sum, p) => sum + p[0], 0) / points.length;
    const latitude = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    return { locality, scope, latitude, longitude };
  }
}

function mapLocality(feature: Feature): NzLocality {
  const a = feature.attributes;
  if (!Number.isInteger(a.id) || !a.name) throw new Error("INVALID_LOCALITY");
  return { id: String(a.id), name: String(a.name), city: String(a.major_name || a.territorial_authority || "New Zealand"), territorialAuthority: String(a.territorial_authority ?? "") };
}
export const linzLocalitiesProvider = new LinzLocalitiesProvider();
