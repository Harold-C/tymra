import { NextRequest } from "next/server";
import { z } from "zod";
import { linzLocalitiesProvider } from "@tymra/providers/nz-localities";
import { apiError, apiSuccess } from "@/lib/server/api";
import { getCustomerSession } from "@/lib/server/membership/customer-auth";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { loadMarketData } from "@/lib/server/market-data";
import { summarizeMarket } from "@/lib/market-summary";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value);
const query = z.object({ region:z.string().min(1).max(100),city:z.string().max(200).default(""),locality:z.string().regex(/^\d{1,10}$/).optional(),from:day,to:day,mode:z.enum(["history","future"]).default("future"),category:z.string().max(100).default("ALL") }).refine(value=>value.to>=value.from && Date.parse(value.to)-Date.parse(value.from)<=90*86400000);
export async function GET(request: NextRequest) {
  if (!await getCustomerSession(request)) return apiError(401,"AUTH_REQUIRED","Sign in to view market data.");
  if (!consumeRateLimit(request,"market-overview",30).allowed) return apiError(429,"RATE_LIMITED","Please retry shortly.");
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError(422,"INVALID_FILTER","Choose a region and a date range of up to 90 days.");
  try {
    const filter = parsed.data;
    const groups = await linzLocalitiesProvider.cityGroups();
    const group = groups.find(item=>item.region===filter.region);
    if (!group || filter.city && !group.cities.includes(filter.city)) return apiError(422,"INVALID_FILTER","City does not belong to this region.");
    const locality = filter.locality ? await linzLocalitiesProvider.resolve(filter.locality) : null;
    if (locality && (!filter.city || !locality.locality.territorialAuthority.split(",").some(part=>part.trim()===filter.city))) return apiError(422,"INVALID_FILTER","Suburb does not belong to this city.");
    const loaded = await loadMarketData();
    const result = summarizeMarket(loaded.data,{...filter,scope:locality?.scope});
    return apiSuccess({...result,snapshot:loaded.snapshot,scopeLabel:locality?.locality.name ?? (filter.city || filter.region)}, {headers:{"cache-control":"private, no-store"}});
  } catch {
    return apiError(503,"MARKET_DATA_UNAVAILABLE","Market data is unavailable. Your filters can be retried.");
  }
}
