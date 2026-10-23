import { normalizeRateTerms, locationContains, type LocationScope } from "@tymra/domain";
import { nzDateKey } from "@tymra/domain/nz-time";
import type { MarketData, MarketRate } from "./market-data";

export type MarketFilter = { region: string; city: string; from: string; to: string; mode: "history" | "future"; category: string; scope?: LocationScope };
export const normalizePlace = (value: string | null) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ Region$/i, "").toLowerCase().trim();
type Place = { region: string | null; city: string | null; authority: string | null; latitude: number | null; longitude: number | null };
export function placeMatches(place: Place, filter: Pick<MarketFilter, "region" | "city" | "scope">) {
  if (normalizePlace(place.region) !== normalizePlace(filter.region)) return false;
  if (filter.scope) return locationContains(filter.scope, place.latitude, place.longitude);
  if (!filter.city) return true;
  const authority = normalizePlace(filter.city);
  if ((place.authority ?? "").split(",").some(part => normalizePlace(part) === authority)) return true;
  // Only an exact named city fallback, never fuzzy suburb-to-district inference.
  return / City$/.test(filter.city) && normalizePlace(place.city) === normalizePlace(filter.city.replace(/ City$/, ""));
}
const dateKey = (value: string) => nzDateKey(new Date(value));
const inRange = (key: string, filter: MarketFilter) => key >= filter.from && key <= filter.to;
const median = (values: number[]) => { const s = [...values].sort((a,b) => a-b); return (s[Math.floor((s.length-1)/2)] + s[Math.ceil((s.length-1)/2)]) / 2; };
function validRate(rate: MarketRate) {
  return rate.collector.startsWith("argus-ota") && rate.availability === "AVAILABLE" && rate.fees === "COMPLETE" && rate.currency === "NZD" && rate.amount > 0 && !rate.supersededAt;
}

// Fixed one-night/two-adult anonymous stay; different categories and terms never mix.
// A chart requires the same property/unit/listing cohort at every plotted date.
export function priceSeries(rates: MarketRate[], filter: MarketFilter, now: Date) {
  const groups = new Map<string, MarketRate[]>();
  for (const rate of rates) {
    if (!validRate(rate) || rate.nights !== 1 || rate.adults !== 2 || rate.units !== 1 || rate.childrenAges.length || !rate.mealPlan || !rate.cancellationCategory || !["PUBLIC","PUBLIC_SIGNED_OUT","PUBLIC_ANONYMOUS"].includes(rate.rateFence??"") || /UNKNOWN|UNDISCLOSED|NO_MEAL_DISCLOSED|ANY_PUBLIC/i.test(`${rate.mealPlan}|${rate.cancellationCategory}`) ||
      rate.qualityFlags.some(flag => /UNKNOWN|PARTIAL|NOT_CAPTURED|UNCLEAR|PROMOTION/.test(flag))) continue;
    if (filter.mode === "future" && (now.getTime()-Date.parse(rate.observedAt) > 7*86400000 || Date.parse(rate.observedAt)>now.getTime())) continue;
    const normalized = normalizeRateTerms({ ...rate, cancellationPolicy: rate.cancellationCategory });
    if (!normalized.comparisonKey || !rate.profileKey) continue;
    const terms = JSON.stringify([rate.category, normalized.comparisonKey, filter.mode === "history" ? rate.checkIn : dateKey(rate.observedAt)]);
    const group = groups.get(terms) ?? []; group.push(rate); groups.set(terms,group);
  }
  return [...groups.values()].flatMap(group => {
    const dates = new Map<string, Map<string, MarketRate>>();
    for (const rate of group) {
      const day = dateKey(filter.mode === "history" ? rate.observedAt : rate.checkIn);
      const cohortKey = `${rate.propertyId}|${rate.unitId}|${rate.listingId}|${rate.profileKey}`;
      const bucket = dates.get(day) ?? new Map<string, MarketRate>();
      const previous = bucket.get(cohortKey);
      if (!previous || rate.observedAt > previous.observedAt) bucket.set(cohortKey,rate);
      dates.set(day,bucket);
    }
    const days = [...dates.keys()].sort();
    if (days.length<2) return [];
    const common = [...dates.get(days[0])!.keys()].filter(key=>days.every(day=>dates.get(day)!.has(key)));
    // One stable unit/listing per property, chosen deterministically, avoids overweighting it.
    const chosen = new Map<string,string>();
    for (const key of common.sort()) { const property = dates.get(days[0])!.get(key)!.propertyId; if (!chosen.has(property)) chosen.set(property,key); }
    if (chosen.size<3) return [];
    const points = days.map(day=>{
      const values = [...chosen.values()].map(key=>dates.get(day)!.get(key)!.amount);
      return { date:day, median:median(values), low:Math.min(...values), high:Math.max(...values), properties:chosen.size };
    });
    return [{ category:group[0].category, checkIn:filter.mode === "history" ? dateKey(group[0].checkIn) : null, mealPlan:group[0].mealPlan, cancellation:group[0].cancellationCategory, points }];
  });
}

export function summarizeMarket(data: MarketData, filter: MarketFilter, now = new Date()) {
  const locatedRates = data.rates.filter(rate=>placeMatches(rate,filter));
  const rates = locatedRates.filter(rate=>validRate(rate) && (filter.category === "ALL" || rate.category === filter.category) && inRange(dateKey(filter.mode === "history" ? rate.observedAt : rate.checkIn),filter));
  const matchingEvents = data.events.filter(event=>placeMatches(event,filter) && event.sources.length && ["SCHEDULED","RESCHEDULED"].includes(event.status) && event.endsAt>=event.startsAt && dateKey(event.endsAt)>=filter.from && dateKey(event.startsAt)<=filter.to).sort((a,b)=>b.observedAt.localeCompare(a.observedAt));
  const uniqueEvents = new Map<string,MarketData["events"][number]>();
  for (const event of matchingEvents) {
    const key=JSON.stringify([normalizePlace(event.title),event.venue,event.city,event.startsAt,event.endsAt]);
    const previous=uniqueEvents.get(key);
    if (!previous) uniqueEvents.set(key,{...event,sources:[...event.sources]});
    else for(const source of event.sources) if(!previous.sources.some(item=>item.name===source.name&&item.url===source.url))previous.sources.push(source);
  }
  const records=[...uniqueEvents.values()].sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
  // Long ranges may represent recurrence windows, not individual occurrences.
  const ongoing=records.filter(event=>Date.parse(event.endsAt)-Date.parse(event.startsAt)>7*86400000);
  const events=records.filter(event=>Date.parse(event.endsAt)-Date.parse(event.startsAt)<=7*86400000);
  const signals = data.signals.filter(signal=>normalizePlace(signal.region)===normalizePlace(filter.region) && signal.status==="CONFIRMED" && signal.sources.length && signal.endsAt>=signal.startsAt && dateKey(signal.endsAt)>=filter.from && dateKey(signal.startsAt)<=filter.to).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
  const weeks = new Map<string,number>();
  for (const event of events) {
    const key = dateKey(event.startsAt)<filter.from ? filter.from : dateKey(event.startsAt);
    const dayOffset = Math.floor((Date.parse(`${key}T00:00:00Z`)-Date.parse(`${filter.from}T00:00:00Z`))/86400000);
    const start = new Date(Date.parse(`${filter.from}T00:00:00Z`)+Math.floor(dayOffset/7)*7*86400000).toISOString().slice(0,10);
    weeks.set(start,(weeks.get(start)??0)+1);
  }
  const categories = [...new Set(locatedRates.filter(validRate).map(rate=>rate.category))].sort();
  return {
    asOf:data.asOf, categories, rateCount:rates.length, propertyCount:new Set(rates.map(rate=>rate.propertyId)).size,
    firstObserved:rates.length ? rates.reduce((a,b)=>a.observedAt<b.observedAt?a:b).observedAt : null,
    lastObserved:rates.length ? rates.reduce((a,b)=>a.observedAt>b.observedAt?a:b).observedAt : null,
    series:priceSeries(rates,filter,now),
    observations:[...rates].sort((a,b)=>b.observedAt.localeCompare(a.observedAt)).slice(0,12).map(rate=>({ id:rate.id, city:rate.city, category:rate.category, amount:rate.amount, checkIn:rate.checkIn, nights:rate.nights, adults:rate.adults, source:rate.source, sourceUrl:rate.sourceUrl, observedAt:rate.observedAt })),
    eventCount:events.length, events:events.slice(0,100), ongoingCount:ongoing.length, ongoing:ongoing.slice(0,12), duplicatesRemoved:matchingEvents.length-records.length, eventWeeks:[...weeks].sort(([a],[b])=>a.localeCompare(b)).map(([date,count])=>({date,count})),
    signalCount:signals.length, signals:signals.slice(0,100),
    missingCoordinates:filter.scope ? data.events.filter(event=>normalizePlace(event.region)===normalizePlace(filter.region) && (event.latitude==null || event.longitude==null) && dateKey(event.endsAt)>=filter.from && dateKey(event.startsAt)<=filter.to).length : 0,
  };
}
export type MarketSummary = ReturnType<typeof summarizeMarket> & { snapshot: boolean; scopeLabel: string };
