import { linzLocalitiesProvider } from "@tymra/providers/nz-localities";
import { apiError, apiSuccess } from "@/lib/server/api";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export async function GET(request: Request) {
  const rate = consumeRateLimit(request, "locality-search", 60);
  if (!rate.allowed) return apiError(429, "RATE_LIMITED", "Please retry shortly.", { headers: { "retry-after": String(rate.retryAfterSeconds) } });
  const params = new URL(request.url).searchParams;
  try {
    if (params.get("cities") === "1") {
      const groups = await linzLocalitiesProvider.cityGroups();
      return apiSuccess({ cities: [...new Set(groups.flatMap(group => group.cities))].sort(), groups: groups.map(({ region, cities }) => ({ region, cities })) });
    }
    const query = params.get("q") ?? "";
    const city = params.get("city") || undefined;
    const region = params.get("region") || undefined;
    if (query.length > 100 || (city?.length ?? 0) > 200 || (region?.length ?? 0) > 100) return apiError(422, "INVALID_SEARCH", "Search is too long.");
    return apiSuccess({ candidates: await linzLocalitiesProvider.search(query, city, region) });
  } catch {
    return apiError(503, "LOCALITY_SOURCE_UNAVAILABLE", "The locality service is temporarily unavailable. Please retry.");
  }
}
