import { z } from "zod";

const point = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const locationScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ADDRESS_RADIUS"), label: z.string(), latitude: z.number(), longitude: z.number(), radiusMetres: z.literal(5000) }),
  z.object({ kind: z.literal("SUBURB_BOUNDARY"), label: z.string(), localityId: z.string(), city: z.string(), sourceUrl: z.string().url(), resolvedAt: z.string(), rings: z.array(z.array(point).min(4)).min(1) }),
]);
export type LocationScope = z.infer<typeof locationScopeSchema>;

export function readLocationScope(constraints: unknown): LocationScope | null {
  const value = constraints && typeof constraints === "object" ? (constraints as Record<string, unknown>).locationScope : undefined;
  if (value === undefined) return null;
  // A malformed persisted scope must never silently widen a search.
  return locationScopeSchema.parse(value);
}

export function locationContains(scope: LocationScope, latitude: number | null | undefined, longitude: number | null | undefined): boolean {
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (scope.kind === "ADDRESS_RADIUS") {
    const rad = Math.PI / 180;
    const a = Math.sin((latitude - scope.latitude) * rad / 2) ** 2 + Math.cos(latitude * rad) * Math.cos(scope.latitude * rad) * Math.sin((longitude - scope.longitude) * rad / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= scope.radiusMetres;
  }
  let inside = false;
  // Even/odd handles disjoint polygons and interior holes, independent of winding.
  for (const ring of scope.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
      if ((yi > latitude) !== (yj > latitude) && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
