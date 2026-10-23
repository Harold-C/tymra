import { describe,expect,it } from "vitest";
import { placeMatches,priceSeries,summarizeMarket,type MarketFilter } from "./market-summary";
import { marketDataSchema,safeMarketUrl,type MarketRate,type MarketData } from "./market-data";

const filter:MarketFilter={region:"Canterbury",city:"Christchurch City",from:"2026-10-01",to:"2026-10-31",mode:"history",category:"ALL"};
const now=new Date("2026-10-14T00:00:00Z");
function rate(property:string,day:string,amount=20000):MarketRate{return {id:`${property}-${day}-${amount}`,propertyId:property,listingId:`l-${property}`,unitId:`u-${property}`,city:"Christchurch",region:"Canterbury Region",authority:null,latitude:-43.53,longitude:172.60,category:"Hotel",amount,observedAt:`2026-10-${day}T00:00:00Z`,checkIn:"2026-10-20T00:00:00Z",checkOut:"2026-10-21T00:00:00Z",nights:1,adults:2,units:1,childrenAges:[],cancellationCategory:"NON_REFUNDABLE",paymentTerms:"PAY_AT_PROPERTY",profileKey:`profile-${property}`,mealPlan:"ROOM_ONLY",rateFence:"PUBLIC",availability:"AVAILABLE",fees:"COMPLETE",currency:"NZD",collector:"argus-ota-panel-v1",qualityFlags:[],supersededAt:null,source:"Source",sourceUrl:"https://example.com/rate"};}
function data(rates:MarketRate[]=[]):MarketData{return {version:1,asOf:now.toISOString(),rates,events:[],signals:[]};}
describe("regional market evidence",()=>{
  it("compares the same properties and terms and deduplicates repeated observations",()=>{
    const rates=[...['a','b','c'].flatMap(p=>[rate(p,'10'),rate(p,'11',24000)]),rate('a','11',24000)];
    const series=priceSeries(rates,filter,now);
    expect(series).toHaveLength(1);expect(series[0].points.map(p=>[p.median,p.properties])).toEqual([[20000,3],[24000,3]]);
  });
  it("does not invent a trend from changing properties, room identities or stay dates",()=>{
    expect(priceSeries(['a','b','c'].map(p=>rate(p,'10')).concat(['d','e','f'].map(p=>rate(p,'11'))),filter,now)).toEqual([]);
    expect(priceSeries(['a','b','c'].flatMap(p=>[rate(p,'10'),{...rate(p,'11'),checkIn:'2026-10-21T00:00:00Z'}]),filter,now)).toEqual([]);
    expect(priceSeries(['a','b','c'].flatMap(p=>[rate(p,'10'),{...rate(p,'11'),unitId:'changed'}]),filter,now)).toEqual([]);
  });
  it("uses canonical terms while rejecting a changed collection context or missing payment terms",()=>{
    const rates=['a','b','c'].flatMap(p=>[rate(p,'10'),{...rate(p,'11',24000),cancellationCategory:'Non-refundable.',mealPlan:'No meals included',paymentTerms:'Pay at the property'}]);
    expect(priceSeries(rates,filter,now)).toHaveLength(1);
    expect(priceSeries(rates.map(r=>r.observedAt.includes('-11T')?{...r,profileKey:'different-context'}:r),filter,now)).toEqual([]);
    expect(priceSeries(rates.map(r=>({...r,paymentTerms:null})),filter,now)).toEqual([]);
    expect(priceSeries(rates.map(r=>({...r,profileKey:null})),filter,now)).toEqual([]);
  });
  it("rejects partial fees, unverified imports, unknown terms and stale forward prices",()=>{
    const rates=['a','b','c'].flatMap(p=>[rate(p,'10'),rate(p,'11')]);
    expect(priceSeries(rates.map(r=>({...r,qualityFlags:['CANCELLATION_POLICY_UNKNOWN']})),filter,now)).toEqual([]);
    expect(priceSeries(rates.map(r=>({...r,mealPlan:'UNKNOWN'})),filter,now)).toEqual([]);
    expect(priceSeries(rates.map(r=>({...r,rateFence:'MEMBER_ONLY'})),filter,now)).toEqual([]);
    expect(summarizeMarket(data(rates.map(r=>({...r,fees:'PARTIAL'}))),filter,now).rateCount).toBe(0);
    expect(summarizeMarket(data(rates.map(r=>({...r,collector:'manual-import-v1'}))),filter,now).rateCount).toBe(0);
    const forward=rates.map((r,i)=>({...r,observedAt:'2026-10-01T00:00:00Z',checkIn:`2026-10-${20+i%2}T00:00:00Z`}));
    expect(priceSeries(forward,{...filter,mode:'future'},now)).toEqual([]);
  });
  it("requires exact geography and coordinates for a suburb",()=>{
    expect(placeMatches(rate('a','10'),filter)).toBe(true);
    expect(placeMatches({...rate('a','10'),city:'Rolleston'},{...filter,city:'Selwyn District'})).toBe(false);
    const scope={kind:'SUBURB_BOUNDARY' as const,label:'test',localityId:'1',city:'Christchurch',sourceUrl:'https://example.com',resolvedAt:now.toISOString(),rings:[[[172,-44],[173,-44],[173,-43],[172,-43],[172,-44]]] as [number,number][][]};
    expect(placeMatches({...rate('a','10'),latitude:null},{...filter,scope})).toBe(false);
    expect(placeMatches(rate('a','10'),{...filter,scope})).toBe(true);
  });
  it("compares future stay dates only from the same recent observation day",()=>{
    const rates=['a','b','c'].flatMap(p=>[rate(p,'12'),{...rate(p,'12',22000),checkIn:'2026-10-21T00:00:00Z',checkOut:'2026-10-22T00:00:00Z'}]);
    expect(priceSeries(rates,{...filter,mode:'future'},now)[0].points.map(point=>point.median)).toEqual([20000,22000]);
    expect(priceSeries(rates.map(r=>r.checkIn.startsWith('2026-10-21')?{...r,observedAt:'2026-10-13T00:00:00Z'}:r),{...filter,mode:'future'},now)).toEqual([]);
  });
  it("counts sourced canonical events once and excludes cancellation and unknown location",()=>{
    const fixture=data();const event={id:'e',title:'Event',category:'Music',venue:'Venue',city:'Christchurch',region:'Canterbury',authority:'Christchurch City',latitude:-43.53,longitude:172.60,startsAt:'2026-10-20T00:00:00Z',endsAt:'2026-10-20T04:00:00Z',status:'SCHEDULED',observedAt:now.toISOString(),impactStatus:'PENDING_EVIDENCE',sources:[{name:'A',url:'https://example.com'},{name:'B',url:'https://example.org'}]};
    fixture.events=[event,{...event,id:'duplicate'},{...event,id:'series',endsAt:'2026-12-20T04:00:00Z'},{...event,id:'cancelled',status:'CANCELLED'},{...event,id:'unknown',region:null},{...event,id:'no-source',sources:[]}];
    fixture.signals=[{id:'signal',title:'Holiday',type:'SCHOOL_HOLIDAY',region:'Canterbury',marketKey:'regional',startsAt:event.startsAt,endsAt:event.endsAt,status:'CONFIRMED',observedAt:now.toISOString(),sources:event.sources}];
    const result=summarizeMarket(fixture,filter,now);expect(result.eventCount).toBe(1);expect(result.eventWeeks[0].count).toBe(1);expect(result.signalCount).toBe(1);expect(result.ongoingCount).toBe(1);expect(result.duplicatesRemoved).toBe(1);
  });
  it("normalizes UTC database timestamps and rejects unsafe source links",()=>{
    expect(marketDataSchema.parse({...data(),asOf:'2026-10-14T01:00:00'}).asOf).toBe('2026-10-14T01:00:00Z');
    expect(safeMarketUrl('javascript:alert(1)')).toBeUndefined();expect(safeMarketUrl('https://secret:password@example.com')).toBeUndefined();
  });
});
