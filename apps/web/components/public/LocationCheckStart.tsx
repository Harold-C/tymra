"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, MapPin, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { addNzCalendarDays, nzDateKey, nzStartOfDay } from "@tymra/domain/nz-time";
import { locationCopy } from "./location-copy";

type Candidate = { id: string; label: string; detail: string; addressExternalId?: string; localityId?: string };
type Draft = { mode: "ADDRESS" | "AREA"; query: string; region: string; city: string; selected: Candidate | null; stage: number; checkIn: string; checkOut: string; adults: number; children: number; accommodationType: "ANY" | "ENTIRE" | "PRIVATE"; key: string; checkId?: string };
const STORAGE = "tymra-location-draft-v1";

export function LocationCheckStart({ locale, initialInput = "", memberEmail }: { locale: "en" | "zh"; initialInput?: string; memberEmail?: string }) {
  const c = locationCopy[locale];
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => ({ mode: "ADDRESS", query: initialInput, region: "", city: "", selected: null, stage: 0, checkIn: addNzCalendarDays(new Date(), 7), checkOut: addNzCalendarDays(new Date(), 8), adults: 2, children: 0, accommodationType: "ANY", key: "" }));
  const [ready, setReady] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [cityGroups, setCityGroups] = useState<{ region: string; cities: string[] }[]>([]);
  const cities = cityGroups.find(group => group.region === draft.region)?.cities ?? [];
  const [cityError, setCityError] = useState(false);
  const selectedAddress = draft.mode === "ADDRESS" ? draft.selected : null;
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [challengeToken, setChallengeToken] = useState<string>();
  const submission = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const localityOptions = draft.selected && !candidates.some(candidate => candidate.id === draft.selected?.id) ? [draft.selected, ...candidates] : candidates;
  const localityGroups = new Map<string, Candidate[]>();
  if (draft.mode === "AREA" && localityOptions.length > 30) {
    for (const candidate of localityOptions) {
      const initial = candidate.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().charAt(0).toUpperCase();
      const letter = /^[A-Z]$/.test(initial) ? initial : "#";
      const group = localityGroups.get(letter) ?? [];
      group.push(candidate);
      localityGroups.set(letter, group);
    }
  }
  const showSearchResults = !draft.selected && (draft.mode === "ADDRESS" || draft.query.trim().length >= 2);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE) ?? "null") as Draft | null;
      if (saved && ["ADDRESS", "AREA"].includes(saved.mode) && typeof saved.query === "string" && typeof saved.city === "string" && /^\d{4}-\d{2}-\d{2}$/.test(saved.checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(saved.checkOut) && Number.isFinite(Date.parse(saved.checkIn)) && Number.isFinite(Date.parse(saved.checkOut)) && [0, 1, 2].includes(saved.stage) && typeof saved.key === "string" && Number.isInteger(saved.adults) && Number.isInteger(saved.children) && ["ANY", "ENTIRE", "PRIVATE"].includes(saved.accommodationType) && (!saved.stage || saved.selected) && (!saved.selected || typeof saved.selected.label === "string" && typeof saved.selected.detail === "string")) setDraft(saved);
    } catch { /* Storage is optional; the form remains usable. */ }
    setReady(true);
  }, []);

  useEffect(() => { if (ready) { try { sessionStorage.setItem(STORAGE, JSON.stringify(draft)); } catch { /* Private browsing may block storage. */ } } }, [draft, ready]);

  useEffect(() => {
    if (draft.mode !== "AREA") return;
    let active = true;
    setCityError(false);
    void json<{ groups: { region: string; cities: string[] }[] }>("/api/v1/localities?cities=1").then(result => {
      if (!active) return;
      setCityGroups(result.groups);
      setDraft(previous => {
        const matches = result.groups.filter(group => group.cities.includes(previous.city));
        if (previous.stage === 0 && previous.city && !matches.length) return { ...previous, city: "", selected: null };
        return !previous.region && previous.city && matches.length === 1 ? { ...previous, region: matches[0].region } : previous;
      });
    }).catch(() => { if (active) setCityError(true); });
    return () => { active = false; };
  }, [draft.mode, retry]);

  useEffect(() => {
    setCandidates([]); setSearchError(null); setSearched(false); setSearching(false);
    if (!ready || draft.stage !== 0 || selectedAddress || (draft.mode === "ADDRESS" ? draft.query.trim().length < 3 : !draft.city && draft.query.trim().length < 2)) return;
    let active = true;
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        let found: Candidate[];
        if (draft.mode === "ADDRESS") {
          const result = await json<{ supportStatus: string; candidates: { addressExternalId?: string; address: string; city: string; isDemo: boolean }[] }>("/api/v1/property-search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: draft.query, locale, mode: "ADDRESS" }), signal: controller.signal });
          if (result.supportStatus !== "SUPPORTED") throw new Error("SOURCE_UNAVAILABLE");
          found = result.candidates.filter(item => item.addressExternalId && !item.isDemo).map(item => ({ id: item.addressExternalId!, addressExternalId: item.addressExternalId, label: item.address, detail: item.city }));
        } else {
          const params = new URLSearchParams({ q: draft.query, city: draft.city, region: draft.region ?? "" });
          const result = await json<{ candidates: { id: string; name: string; city: string; territorialAuthority: string }[] }>(`/api/v1/localities?${params}`, { signal: controller.signal });
          found = result.candidates.map(item => ({ id: item.id, localityId: item.id, label: item.name, detail: item.territorialAuthority.replace(/ (City|District)$/u, "") === item.city ? item.city : `${item.city} · ${item.territorialAuthority}` }));
        }
        if (active) { setCandidates(found); setSearched(true); }
      } catch (caught) {
        if (active) setSearchError(caught instanceof ApiError && caught.code === "RATE_LIMITED" ? c.rateLimited : c.sourceError);
      } finally { if (active) setSearching(false); }
    }, 450);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [draft.mode, draft.query, draft.city, draft.region, selectedAddress, draft.stage, ready, retry, locale, c.rateLimited, c.sourceError]);

  function update(change: Partial<Draft>) {
    setError(null); setChallengeToken(undefined);
    setDraft(previous => ({ ...previous, ...change, key: "", checkId: undefined }));
  }
  function stage(value: number) {
    setError(null);
    setDraft(previous => ({ ...previous, stage: value }));
    requestAnimationFrame(() => heading.current?.focus());
  }
  function review() {
    if (!draft.checkIn || !draft.checkOut || draft.checkIn < nzDateKey(new Date()) || draft.checkOut <= draft.checkIn || !Number.isInteger(draft.adults) || draft.adults < 1 || draft.adults > 16 || !Number.isInteger(draft.children) || draft.children < 0 || draft.children > 16) { setError(c.invalidDates); return; }
    stage(2);
  }
  async function start() {
    if (!memberEmail || !draft.selected || submission.current) return;
    submission.current = true; setBusy(true); setError(null);
    const key = draft.key || crypto.randomUUID();
    setDraft(previous => ({ ...previous, key }));
    const stayQuery = { checkIn: draft.checkIn, checkOut: draft.checkOut, adults: draft.adults, children: draft.children, units: 1, currency: "NZD", timezone: "Pacific/Auckland", cancellationCategory: "STANDARD", accommodationType: draft.accommodationType };
    try {
      let checkId = draft.checkId;
      if (!checkId) {
        const created = await json<{ checkId: string }>("/api/v1/price-checks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ analysisType: "LOCATION_BENCHMARK", locationSearch: true, input: draft.mode === "ADDRESS" ? draft.query.trim() : `${draft.selected.label} · ${draft.selected.detail}`, addressExternalId: draft.selected.addressExternalId, localityId: draft.selected.localityId, email: memberEmail, locale, stayQuery, serviceConsent: true, marketingConsent: false, idempotencyKey: key }) });
        checkId = created.checkId;
        setDraft(previous => ({ ...previous, key, checkId }));
      }
      await json(`/api/v1/price-checks/${checkId}/confirm-query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...stayQuery, ...(challengeToken ? { challengeToken } : {}) }) });
      try { sessionStorage.removeItem(STORAGE); } catch { /* Optional draft storage. */ }
      router.push(`/${locale}/account/checks/${checkId}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.challengeToken) setChallengeToken(caught.challengeToken);
        setError(c.errors[caught.code as keyof typeof c.errors] ?? c.submitError);
      } else setError(c.submitError);
    } finally { setBusy(false); submission.current = false; }
  }

  const scope = draft.mode === "AREA" ? c.areaScope : c.addressScope;
  const date = (value: string) => new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeZone: "Pacific/Auckland" }).format(nzStartOfDay(value));
  return <section className="flow-page location-page"><div className="flow-container">
    <Link className="location-back" href={`/${locale}/${memberEmail ? "account" : ""}`}><ArrowLeft size={16} aria-hidden="true" />{memberEmail ? c.backAccount : c.backHome}</Link>
    <ol className="flow-stepper location-stepper" aria-label={c.progress}>{c.steps.map((label, index) => <li key={label} className={index === draft.stage ? "is-current" : index < draft.stage ? "is-complete" : ""} aria-current={index === draft.stage ? "step" : undefined}><span>{index < draft.stage ? <CheckCircle2 size={16} /> : index + 1}</span><strong>{label}</strong></li>)}</ol>
    <div className="flow-heading"><h1 ref={heading} tabIndex={-1}>{draft.stage === 0 ? c.title : draft.stage === 1 ? c.conditions : c.review}</h1><p>{draft.stage === 0 ? c.intro : draft.stage === 1 ? c.conditionsIntro : c.reviewIntro}</p></div>
    {draft.stage === 0 ? <Link className="location-market-link" href={`/${locale}/account/market?${new URLSearchParams({region:draft.region??"",city:draft.city,...(draft.mode==="AREA"&&draft.selected?.localityId?{locality:draft.selected.localityId}:{})})}`}><div><strong>{locale==="zh"?"只想了解地区行情？":"Exploring a region?"}</strong><p>{locale==="zh"?"查看价格趋势、活动与需求信号，无需选择具体房型。":"Explore price trends, events and demand signals without choosing a room."}</p></div><span>{locale==="zh"?"区域行情":"Regional market"} <ArrowRight size={18}/></span></Link> : null}
    <div className="flow-surface"><div className="flow-form">
      {draft.stage === 0 ? <>
        <div className="location-modes" role="group" aria-label={c.mode}>{(["ADDRESS", "AREA"] as const).map(mode => <button key={mode} type="button" aria-pressed={draft.mode === mode} className={draft.mode === mode ? "is-selected" : ""} onClick={() => update({ mode, query: "", selected: null, region: "", city: "" })}>{mode === "ADDRESS" ? <MapPin size={18} /> : <Search size={18} />}{mode === "ADDRESS" ? c.byAddress : c.byArea}</button>)}</div>
        {draft.mode === "AREA" ? <div>
          <p className="location-hierarchy-hint">{c.hierarchy}</p>
          <div className="field-grid location-hierarchy">
            <div className="form-field"><label htmlFor="location-region">{c.region}</label><select id="location-region" value={draft.region ?? ""} disabled={!cityGroups.length} onChange={event => update({ region: event.target.value, city: "", selected: null, query: "" })}><option value="">{cityGroups.length ? c.chooseRegion : c.loadingRegions}</option>{cityGroups.map(group => <option key={group.region} value={group.region}>{group.region === "Other areas" ? c.otherAreas : group.region}</option>)}</select></div>
            <div className="form-field"><label htmlFor="location-city">{c.cityLevel}</label><select id="location-city" value={draft.city} disabled={!draft.region || !cities.length} onChange={event => update({ city: event.target.value, selected: null, query: "" })}><option value="">{!draft.region ? c.regionFirst : cities.length ? c.chooseCityLevel : c.searchLocality}</option>{cities.map(city => <option key={city} value={city}>{city.replace(/ City$/, "")}</option>)}</select></div>
          </div>
          {cityError ? <p className="field-error">{c.cityError} <button type="button" className="text-link" onClick={() => setRetry(value => value + 1)}>{c.retry}</button></p> : null}
        </div> : null}
        <form onSubmit={event => { event.preventDefault(); update({ selected: null }); setRetry(value => value + 1); }}>
          <label htmlFor="location-query">{draft.mode === "ADDRESS" ? c.address : c.filterLocality}</label>
          <div className="location-search-row"><div className="input-with-icon"><Search size={19} aria-hidden="true" /><input ref={queryInput} id="location-query" value={draft.query} onChange={event => update({ query: event.target.value, selected: null })} placeholder={draft.mode === "ADDRESS" ? c.addressPlaceholder : c.areaPlaceholder} maxLength={draft.mode === "ADDRESS" ? 500 : 100} autoComplete="off" aria-describedby="location-hint location-search-status" aria-controls="location-candidates" />{draft.query ? <button className="location-clear" type="button" aria-label={c.clearSearch} onClick={() => { update({ query: "", selected: null }); queryInput.current?.focus(); }}><X size={18} aria-hidden="true" /></button> : null}</div><button className="button button-secondary" type="submit" disabled={searching || (draft.mode === "ADDRESS" ? draft.query.trim().length < 3 : draft.query.trim().length < 2)}>{c.search}</button></div>
          <p id="location-hint" className="location-hint">{draft.mode === "ADDRESS" ? c.addressHint : c.groupedAreaHint}</p>
        </form>
        <div id="location-search-status" role="status" aria-live="polite">{searching ? <span className="location-loading"><LoaderCircle size={18} className="spin" />{c.searching}</span> : searchError ? <p className="field-error">{searchError} <button type="button" className="text-link" onClick={() => setRetry(value => value + 1)}>{c.retry}</button></p> : draft.mode === "AREA" && draft.query.trim().length === 1 ? <span className="location-hint">{c.minQuery}</span> : searched && !candidates.length ? <p>{c.noMatch}</p> : candidates.length && !draft.selected ? <span className="location-hint">{showSearchResults ? c.chooseCandidate : c.browseLocalities} ({candidates.length})</span> : null}</div>
        <div id="location-candidates" aria-busy={searching} hidden={!showSearchResults || !candidates.length}>{showSearchResults && candidates.length ? <ul className="location-candidates" aria-label={c.chooseCandidate}>{candidates.map(candidate => <li key={candidate.id}><button type="button" onClick={() => update({ selected: candidate })}><MapPin size={18} aria-hidden="true" /><span><strong>{candidate.label}</strong><small>{candidate.detail}</small></span><ArrowRight size={18} aria-hidden="true" /></button></li>)}</ul> : null}</div>
        {draft.mode === "AREA" ? <div className="form-field"><label htmlFor="location-locality">{c.localityLevel}</label><select id="location-locality" value={draft.selected?.id ?? ""} disabled={searching || !draft.selected && !candidates.length} aria-describedby={localityGroups.size ? "location-group-hint" : undefined} onChange={event => update({ selected: localityOptions.find(candidate => candidate.id === event.target.value) ?? null })}><option value="">{searching ? c.searching : c.chooseLocality}</option>{localityGroups.size ? [...localityGroups].sort(([a], [b]) => a.localeCompare(b)).map(([letter, options]) => <optgroup key={letter} label={`${letter} (${options.length})`}>{options.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label}{draft.city ? "" : ` · ${candidate.detail}`}</option>)}</optgroup>) : localityOptions.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label}{draft.city ? "" : ` · ${candidate.detail}`}</option>)}</select>{localityGroups.size ? <p id="location-group-hint" className="location-hint">{c.alphabetGroups}</p> : null}</div> : null}
        {draft.selected ? <div className="location-selected"><CheckCircle2 size={22} aria-hidden="true" /><div><strong>{draft.selected.label}</strong><p>{draft.selected.detail}</p><small>{scope}</small></div><button type="button" className="text-link" onClick={() => update({ selected: null })}>{c.change}</button></div> : null}
        <p className="location-hint">{c.freeSearch} <a className="text-link" href={draft.mode === "AREA" ? "https://www.linz.govt.nz/products-services/data/types-linz-data/suburbs-and-localities-data" : "https://data.linz.govt.nz/layer/105689-nz-addresses/"} target="_blank" rel="noreferrer">{locale === "zh" ? "位置数据：LINZ" : "Location data: LINZ"}</a></p>
        <button className="button button-primary flow-primary" type="button" disabled={!draft.selected || !ready} onClick={() => stage(1)}>{draft.mode === "ADDRESS" ? c.useAddress : c.useArea}<ArrowRight size={18} /></button>
        <Link className="text-link location-ota" href={`/${locale}/check`}>{c.ota}</Link>
      </> : <>
        <div className="location-selected"><MapPin size={22} aria-hidden="true" /><div><strong>{draft.selected?.label}</strong><p>{draft.selected?.detail}</p>{draft.stage === 1 ? <small>{scope}</small> : null}</div>{!busy && !draft.checkId ? <button type="button" className="text-link" onClick={() => stage(0)}>{c.change}</button> : null}</div>
        {draft.stage === 1 ? <form className="flow-form" onSubmit={event => { event.preventDefault(); review(); }}>
          <div className="field-grid"><label>{c.checkIn}<input aria-label={c.checkIn} type="date" min={nzDateKey(new Date())} required value={draft.checkIn} onChange={event => update({ checkIn: event.target.value })} /></label><label>{c.checkOut}<input aria-label={c.checkOut} type="date" min={draft.checkIn} required value={draft.checkOut} onChange={event => update({ checkOut: event.target.value })} /></label></div>
          <div className="field-grid"><label>{c.adults}<input aria-label={c.adults} type="number" min={1} max={16} required value={draft.adults} onChange={event => update({ adults: Number(event.target.value) })} /></label><label>{c.children}<input aria-label={c.children} type="number" min={0} max={16} required value={draft.children} onChange={event => update({ children: Number(event.target.value) })} /></label></div>
          <div className="form-field"><label htmlFor="location-accommodation">{c.accommodation}</label><select id="location-accommodation" value={draft.accommodationType} onChange={event => update({ accommodationType: event.target.value as Draft["accommodationType"] })}>{(["ANY", "ENTIRE", "PRIVATE"] as const).map(value => <option value={value} key={value}>{c.types[value]}</option>)}</select></div>
          <p className="location-hint">{c.stayHint}</p><button className="button button-primary flow-primary" type="submit">{c.toReview}<ArrowRight size={18} /></button>
        </form> : <>
          <dl className="location-summary"><div><dt>{c.dates}</dt><dd>{date(draft.checkIn)} — {date(draft.checkOut)}</dd></div><div><dt>{c.guests}</dt><dd>{draft.adults} {c.adults} · {draft.children} {c.children}</dd></div><div><dt>{c.accommodation}</dt><dd>{c.types[draft.accommodationType]}</dd></div><div><dt>{c.range}</dt><dd>{scope}</dd></div></dl>
          <p className="location-hint">{c.evidenceHint}</p><p>{draft.mode === "AREA" ? c.areaQuota : c.addressQuota}</p>
          {memberEmail ? <><p className="location-hint">{c.member}</p><button className="button button-primary flow-primary" type="button" disabled={busy} onClick={start}>{busy ? <LoaderCircle size={18} className="spin" /> : <Search size={18} />}{busy ? c.starting : c.start}</button></> : <Link className="button button-primary" href={`/${locale}/sign-in?returnTo=/${locale}/address-check`}>{c.signIn}</Link>}
          {!busy && !draft.checkId ? <button className="text-link" type="button" onClick={() => stage(1)}>{c.editConditions}</button> : null}
        </>}
      </>}
      {error ? <div className="flow-notice flow-notice-danger" role="alert"><p>{error}</p>{draft.checkId ? <Link className="text-link" href={`/${locale}/account/settings`}>{c.settings}</Link> : null}</div> : null}
    </div></div>
  </div></section>;
}

class ApiError extends Error { constructor(readonly code: string, readonly challengeToken?: string) { super(code); } }
async function json<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok || !payload.data) throw new ApiError(payload.error?.code ?? "UNAVAILABLE", payload.error?.details?.challenge?.mode === "deterministic" ? payload.error.details.challenge.token : undefined);
  return payload.data as T;
}
