"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, ChartNoAxesCombined, LoaderCircle, MapPin } from "lucide-react";
import { addNzCalendarDays, nzDateKey, nzStartOfDay } from "@tymra/domain/nz-time";
import { safeMarketUrl } from "@/lib/market-data";
import type { MarketSummary } from "@/lib/market-summary";
import { marketCopy } from "./market-copy";

type Filter = { region:string; city:string; locality:string; from:string; to:string; mode:"history"|"future"; category:string };
type Locality = {id:string;name:string};
export function RegionalMarket({locale,initial}:{locale:"en"|"zh";initial:Record<string,string|undefined>}) {
  const c=marketCopy[locale]; const router=useRouter();
  const [filter,setFilter]=useState<Filter>(()=>({region:initial.region??"",city:initial.city??"",locality:initial.locality??"",from:initial.from??nzDateKey(new Date()),to:initial.to??addNzCalendarDays(new Date(),30),mode:initial.mode==="history"?"history":"future",category:initial.category??"ALL"}));
  const [view,setView]=useState(initial.view==="events"?"events":"prices");
  const [groups,setGroups]=useState<{region:string;cities:string[]}[]>([]);
  const [localities,setLocalities]=useState<Locality[]>([]);
  const [localitySearch,setLocalitySearch]=useState("");
  const [locationsLoading,setLocationsLoading]=useState(false);
  const [locationsError,setLocationsError]=useState(false);
  const [summary,setSummary]=useState<MarketSummary|null>(null);
  const [categories,setCategories]=useState<string[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [authExpired,setAuthExpired]=useState(false);
  const [request,setRequest]=useState<Filter|null>(()=>initial.region?filter:null);
  const [retry,setRetry]=useState(0);
  const [eventCategory,setEventCategory]=useState("");
  const [eventLimit,setEventLimit]=useState(12);
  const [signalLimit,setSignalLimit]=useState(6);
  useEffect(()=>{let active=true; setLocationsError(false); void fetch("/api/v1/localities?cities=1").then(readJson).then(data=>{if(active)setGroups(data.groups);}).catch(()=>{if(active)setLocationsError(true);});return()=>{active=false;};},[retry]);
  useEffect(()=>{
    setLocalities([]); setLocationsLoading(false); if(!filter.city)return;
    const controller=new AbortController(); setLocationsLoading(true); setLocationsError(false);
    void fetch(`/api/v1/localities?${new URLSearchParams({region:filter.region,city:filter.city})}`,{signal:controller.signal}).then(readJson).then(data=>{if(!controller.signal.aborted)setLocalities(data.candidates);}).catch(()=>{if(!controller.signal.aborted)setLocationsError(true);}).finally(()=>{if(!controller.signal.aborted)setLocationsLoading(false);});
    return()=>controller.abort();
  },[filter.region,filter.city,retry]);
  useEffect(()=>{
    if(!request)return;
    const controller=new AbortController();setLoading(true);setError("");setAuthExpired(false);setSummary(null);
    const timeout=window.setTimeout(()=>{controller.abort();setLoading(false);setError(c.loadError);},20000);
    const params=new URLSearchParams(request);if(!request.locality)params.delete("locality");
    void fetch(`/api/v1/customer/market?${params}`,{signal:controller.signal}).then(readJson).then(data=>{if(!controller.signal.aborted){setSummary(data);setCategories(data.categories);}}).catch(caught=>{if(!controller.signal.aborted){setAuthExpired(caught instanceof Error&&caught.message==="AUTH_REQUIRED");setError(c.loadError);}}).finally(()=>{window.clearTimeout(timeout);if(!controller.signal.aborted)setLoading(false);});
    return()=>{controller.abort();window.clearTimeout(timeout);};
  },[request,retry,c.loadError]);
  function change(next:Partial<Filter>){setFilter(value=>({...value,...next}));setSummary(null);setRequest(null);setLoading(false);setError("");}
  function url(next:Filter,tab=view){const params=new URLSearchParams({...next,view:tab});if(!next.locality)params.delete("locality");return `/${locale}/account/market?${params}`;}
  function apply(){if(!filter.region||!filter.from||!filter.to||filter.to<filter.from||Date.parse(filter.to)-Date.parse(filter.from)>90*86400000){setError(c.invalid);return;}setEventLimit(12);setSignalLimit(6);setEventCategory("");setRequest({...filter});router.replace(url(filter),{scroll:false});}
  const date=(value:string)=>new Intl.DateTimeFormat(locale==="zh"?"zh-CN":"en-NZ",{dateStyle:"medium",timeZone:"Pacific/Auckland"}).format(value.length===10?nzStartOfDay(value):new Date(value));
  const money=(amount:number)=>new Intl.NumberFormat(locale==="zh"?"zh-NZ":"en-NZ",{style:"currency",currency:"NZD",maximumFractionDigits:0}).format(amount/100);
  const availableLocalities=localities.filter(item=>item.name.toLocaleLowerCase().includes(localitySearch.toLocaleLowerCase()));
  const letters=[...new Set(availableLocalities.map(item=>item.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").charAt(0).toUpperCase()))].sort();
  const events=summary?.events.filter(event=>!eventCategory||event.category===eventCategory)??[];
  return <section className="regional-market rough-shell">
    <Link className="location-back" href={`/${locale}/address-check`}><ArrowLeft size={16}/>{c.back}</Link>
    <header className="market-heading"><div><p className="market-eyebrow">{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div><MapPin size={32} aria-hidden="true"/></header>
    <div className="market-tabs" role="group" aria-label={c.views}><button type="button" aria-pressed={view==="prices"} onClick={()=>{setView("prices");router.replace(url(filter,"prices"),{scroll:false});}}><ChartNoAxesCombined size={20}/>{c.prices}</button><button type="button" aria-pressed={view==="events"} onClick={()=>{setView("events");router.replace(url(filter,"events"),{scroll:false});}}><CalendarDays size={20}/>{c.events}</button></div>
    <form className="market-filter" onSubmit={event=>{event.preventDefault();apply();}}>
      <div className="market-filter-grid">
        <label>{c.region}<select value={filter.region} onChange={event=>{change({region:event.target.value,city:"",locality:""});setLocalitySearch("");}}><option value="">{c.chooseRegion}</option>{groups.map(group=><option key={group.region}>{group.region}</option>)}</select></label>
        <label>{c.city}<select value={filter.city} disabled={!filter.region} onChange={event=>{change({city:event.target.value,locality:""});setLocalitySearch("");}}><option value="">{c.wholeRegion}</option>{groups.find(group=>group.region===filter.region)?.cities.map(city=><option key={city} value={city}>{city.replace(/ City$/,"")}</option>)}</select></label>
        <label>{c.suburb}<select value={filter.locality} disabled={!filter.city||locationsLoading} onChange={event=>change({locality:event.target.value})}><option value="">{locationsLoading?c.loading:c.wholeCity}</option>{availableLocalities.length>30?letters.map(letter=><optgroup key={letter} label={letter}>{availableLocalities.filter(item=>item.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").charAt(0).toUpperCase()===letter).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>):availableLocalities.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      {filter.city?<div className="market-locality-search"><label>{c.findSuburb}<input value={localitySearch} onChange={event=>{setLocalitySearch(event.target.value);change({locality:""});}} placeholder="Riccarton"/></label><small role="status">{localitySearch?`${availableLocalities.length} ${c.matches}`:c.optionalSuburb}</small>{localitySearch?<div className="market-locality-results">{availableLocalities.slice(0,12).map(item=><button type="button" key={item.id} onClick={()=>{change({locality:item.id});setLocalitySearch("");}}>{item.name}</button>)}</div>:null}</div>:<p className="location-hint">{c.optionalSuburb}</p>}
      {view==="prices"?<div className="market-price-controls"><label>{c.priceMode}<select value={filter.mode} onChange={event=>{const mode=event.target.value as Filter["mode"];change({mode,from:mode==="history"?addNzCalendarDays(new Date(),-30):nzDateKey(new Date()),to:mode==="history"?nzDateKey(new Date()):addNzCalendarDays(new Date(),30)});}}><option value="future">{c.future}</option><option value="history">{c.history}</option></select></label><label>{c.category}<select value={filter.category} onChange={event=>change({category:event.target.value})}><option value="ALL">{c.allCategories}</option>{categories.map(category=><option key={category}>{category}</option>)}</select></label><p>{c.priceBasis}</p></div>:null}
      <div className="market-filter-grid market-period"><label>{c.from}<input type="date" value={filter.from} required onChange={event=>change({from:event.target.value})}/></label><label>{c.to}<input type="date" value={filter.to} min={filter.from} required onChange={event=>change({to:event.target.value})}/></label><button className="button button-primary" disabled={!filter.region||loading} type="submit">{loading?<LoaderCircle size={18} className="spin"/>:null}{loading?c.loading:c.show}</button></div>
      {locationsError?<p role="alert">{c.locationError} <button className="text-link" type="button" onClick={()=>setRetry(value=>value+1)}>{c.retry}</button></p>:null}
    </form>
    <div role="status" aria-live="polite">{loading?c.loading:authExpired?<Link className="text-link" href={`/${locale}/sign-in?returnTo=${encodeURIComponent(url(filter))}`}>{locale==="zh"?"登录已过期，请重新登录查看行情。":"Your session expired. Sign in to view market data."}</Link>:error?<span>{error} <button className="text-link" onClick={apply}>{c.retry}</button></span>:!summary?c.choosePrompt:null}</div>
    {summary?<>
      <div className="market-data-note"><strong>{summary.scopeLabel}</strong><span>{date(filter.from)} — {date(filter.to)}</span><span>{summary.snapshot?c.snapshot:c.readAt} {date(summary.asOf)}</span><small>{c.noCollection}</small></div>
      {view==="prices"?<>
        <div className="market-metrics"><div><span>{c.observations}</span><strong>{summary.rateCount}</strong></div><div><span>{c.properties}</span><strong>{summary.propertyCount}</strong></div><div><span>{c.lastObserved}</span><strong className="market-date">{summary.lastObserved?date(summary.lastObserved):c.noData}</strong></div></div>
        <p className="market-notice">{c.sampleWarning}</p>
        {summary.series.length?summary.series.map((series,index)=><article className="market-panel" key={index}><h2>{series.category} · {filter.mode==="history"?c.history:c.future}</h2><p>{series.checkIn?`${c.checkIn} ${date(series.checkIn)} · `:""}{series.mealPlan} · {series.cancellation}</p><div className="market-bars">{series.points.map(point=><div key={point.date}><span>{date(point.date)}</span><meter aria-label={`${point.date} ${c.median}`} min={0} max={Math.max(...series.points.map(p=>p.high))} value={point.median}/><strong>{money(point.median)}</strong><small>{money(point.low)}–{money(point.high)} · {point.properties} {c.properties}</small></div>)}</div></article>):<div className="market-empty"><ChartNoAxesCombined size={28}/><h2>{c.notEnough}</h2><p>{c.notEnoughBody}</p></div>}
        {summary.observations.length?<article className="market-panel"><h2>{c.availablePrices}</h2><p>{c.priceListHint}</p><div className="market-observations">{summary.observations.map(rate=><article key={rate.id}><div><strong>{rate.city||summary.scopeLabel}</strong><small>{rate.category} · {date(rate.checkIn)} · {rate.nights} {c.nights} · {rate.adults} {c.adults}</small></div><div><strong>{money(rate.amount)}<small> / {c.night}</small></strong><small>{c.observed} {date(rate.observedAt)}</small>{safeMarketUrl(rate.sourceUrl)?<a href={safeMarketUrl(rate.sourceUrl)} target="_blank" rel="noreferrer">{rate.source} ↗</a>:<small>{rate.source}</small>}</div></article>)}</div></article>:null}
      </>:<>
        <div className="market-metrics"><div><span>{c.recordedEvents}</span><strong>{summary.eventCount}</strong></div><div><span>{c.regionSignals}</span><strong>{summary.signalCount}</strong></div><div><span>{c.demandConclusion}</span><strong className="market-date">{c.notEstablished}</strong></div></div>
        <p className="market-notice">{c.eventWarning}</p>
        {summary.eventWeeks.length?<article className="market-panel"><h2>{c.eventDistribution}</h2><p>{c.distributionHint}</p><div className="market-bars">{summary.eventWeeks.map(week=><div key={week.date}><span>{date(week.date)}</span><meter min={0} max={Math.max(...summary.eventWeeks.map(w=>w.count))} value={week.count} aria-label={`${week.date} ${c.recordedEvents}`}/><strong>{week.count}</strong></div>)}</div></article>:null}
        <article className="market-panel"><div className="market-panel-heading"><h2>{c.calendar}</h2><label>{c.eventCategory}<select value={eventCategory} onChange={event=>{setEventCategory(event.target.value);setEventLimit(12);}}><option value="">{c.allEvents}</option>{[...new Set(summary.events.map(event=>event.category).filter((category):category is string=>Boolean(category)))].sort().map(category=><option key={category}>{category}</option>)}</select></label></div>
          {!events.length?<p>{c.noEvents}</p>:<ul className="market-event-list">{events.slice(0,eventLimit).map(event=><li key={event.id}><time>{date(event.startsAt)}{date(event.endsAt)!==date(event.startsAt)?` — ${date(event.endsAt)}`:""}</time><div><h3>{event.title}</h3><p>{[event.venue,event.city,event.category].filter(Boolean).join(" · ")}</p><small>{c.observed} {date(event.observedAt)}{Date.now()-Date.parse(event.observedAt)>14*86400000?` · ${c.stale}`:""}{event.status==="RESCHEDULED"?` · ${c.rescheduled}`:""}</small><div className="market-sources">{event.sources.map((source,index)=>safeMarketUrl(source.url)?<a key={index} href={safeMarketUrl(source.url)} target="_blank" rel="noreferrer">{source.name} ↗</a>:<span key={index}>{source.name}</span>)}</div></div></li>)}</ul>}
          {events.length>eventLimit?<button className="button button-secondary" onClick={()=>setEventLimit(value=>value+12)}>{c.more}</button>:null}{summary.eventCount>100?<p>{c.first100}</p>:null}{summary.missingCoordinates>0?<p>{c.locationGap.replace("{count}",String(summary.missingCoordinates))}</p>:null}
        </article>
        {summary.ongoingCount?<article className="market-panel"><h2>{locale==="zh"?"持续／重复活动，场次待细化":"Ongoing / recurring records"} ({summary.ongoingCount})</h2><p>{locale==="zh"?"这些记录跨度超过 7 天，可能代表整个系列或展期；未计入上方场次分布。这里只列出前 12 条，请以来源的具体场次为准。":"These records span more than 7 days and may describe a series or exhibition period. They are excluded from occurrence counts above. Up to 12 are listed; check the source for individual dates."}</p><ul className="market-event-list">{summary.ongoing.map(event=><li key={event.id}><time>{date(event.startsAt)} — {date(event.endsAt)}</time><div><h3>{event.title}</h3><p>{event.venue} · {event.city}</p><small>{c.observed} {date(event.observedAt)}</small><div className="market-sources">{event.sources.map((source,index)=>safeMarketUrl(source.url)?<a key={index} href={safeMarketUrl(source.url)} target="_blank" rel="noreferrer">{source.name} ↗</a>:<span key={index}>{source.name}</span>)}</div></div></li>)}</ul></article>:null}
        <article className="market-panel"><h2>{c.regionSignals}</h2><p>{c.signalHint}</p>{!summary.signals.length?<p>{c.noSignals}</p>:<ul className="market-event-list">{summary.signals.slice(0,signalLimit).map(signal=><li key={signal.id}><time>{date(signal.startsAt)}</time><div><h3>{signal.title}</h3><p>{signal.region} · {date(signal.startsAt)} — {date(signal.endsAt)}</p><small>{c.observed} {date(signal.observedAt)}</small><div className="market-sources">{signal.sources.map((source,index)=>safeMarketUrl(source.url)?<a key={index} href={safeMarketUrl(source.url)} target="_blank" rel="noreferrer">{source.name} ↗</a>:<span key={index}>{source.name}</span>)}</div></div></li>)}</ul>}{summary.signals.length>signalLimit?<button className="button button-secondary" onClick={()=>setSignalLimit(value=>value+6)}>{c.more}</button>:null}{summary.signalCount>100?<p>{c.first100}</p>:null}</article>
      </>}
    </>:null}
  </section>;
}
async function readJson(response:Response){const payload=await response.json();if(!response.ok||!payload.data)throw new Error(response.status===401?"AUTH_REQUIRED":"UNAVAILABLE");return payload.data;}
