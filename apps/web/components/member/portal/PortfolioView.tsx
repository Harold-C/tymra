"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { memberStrategySchema, type MemberStrategy } from "@tymra/domain/member-strategy";
import { Page, Loading, ErrorState } from "./shared";
import { api } from "./api";
import type { Locale } from "../contracts";
import { accountCopy } from "../AccountState";

type Portfolio = { canBulk: boolean; candidates: { id: string; name: string }[]; units: { id: string; name: string; propertyName: string; active: boolean; groupName: string | null; strategyVersion: number; strategy: MemberStrategy; checkId: string | null; status: string; asOf: string | null; gapPercent: number | null; reviewRange: { lowMinor: number; highMinor: number } | null }[] };
type Preview = { previewToken: string; affectedCount: number };
export function PortfolioView({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const statusLabels: Record<string, string> = accountCopy[locale].status;
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<MemberStrategy>(memberStrategySchema.parse({}));
  const [group, setGroup] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const key = useRef<string | null>(null);
  const reload = () => api<Portfolio>("/api/v1/customer/portfolio").then(setData);
  useEffect(() => { void reload().catch(error => setError(error.message)); }, []);
  const money = (minor: number) => new Intl.NumberFormat(zh ? "zh-NZ" : "en-NZ", { style: "currency", currency: "NZD" }).format(minor / 100);
  const select = (id: string, checked: boolean) => {
    setSaved(false); setPreview(null);
    if (!selected.length && checked) { const unit = data!.units.find(unit => unit.id === id)!; setStrategy(unit.strategy); setGroup(unit.groupName ?? ""); }
    setSelected(ids => checked ? [...ids, id] : ids.filter(item => item !== id));
  };
  const review = async () => {
    setBusy(true); setError(null); setSaved(false);
    try { setPreview(await api<Preview>("/api/v1/customer/portfolio", { method: "POST", body: JSON.stringify({ units: selected.map(id => ({ id, version: data!.units.find(unit => unit.id === id)!.strategyVersion })), patch: { strategy, ...(data!.canBulk ? { groupName: group || null } : {}) } }) })); key.current = crypto.randomUUID(); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setError(null);
    try { await api("/api/v1/customer/portfolio", { method: "PATCH", headers: { "idempotency-key": key.current! }, body: JSON.stringify({ previewToken: preview!.previewToken }) }); await reload(); setPreview(null); setSelected([]); setSaved(true); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  return <Page locale={locale} eyebrow={zh ? "监测与策略" : "MONITORING & STRATEGY"} title={zh ? "组合管理" : "Portfolio"} body={zh ? "按已观察到的市场差距排序。缺失价格不计为机会；策略只影响分析建议，不会修改OTA价格。" : "Ranked by observed market gaps. Missing prices are not opportunities. Strategies affect analysis only; they never change OTA prices."}>
    {error ? <ErrorState message={error} /> : null}
    {!data ? error ? <Link href={`/${locale}/account/billing`}>{zh ? "查看方案" : "Compare plans"}</Link> : <Loading locale={locale} /> : <>
      {saved ? <p role="status">{zh ? "策略已保存，将用于后续分析。" : "Strategy saved for future analyses."}</p> : null}
      {data.canBulk ? <label>{zh ? "分组筛选" : "Filter group"}<select value={groupFilter} onChange={event => setGroupFilter(event.target.value)}><option value="">{zh ? "所有分组" : "All groups"}</option>{[...new Set(data.units.flatMap(unit => unit.groupName ? [unit.groupName] : []))].map(name => <option key={name}>{name}</option>)}</select></label> : null}
      {!data.units.length ? <p>{zh ? "确认第一个价格检查后，可在这里管理策略。" : "Confirm your first Price Check to manage its strategy here."}</p> : <div className="member-strategy-units">{data.units.filter(unit => !groupFilter || unit.groupName === groupFilter).map(unit => <article key={unit.id}>
        <label><input type="checkbox" checked={selected.includes(unit.id)} disabled={busy || Boolean(preview) || !data.canBulk && selected.length > 0 && !selected.includes(unit.id)} onChange={event => select(unit.id, event.target.checked)} />{unit.propertyName} · {unit.name}</label>
        <p>{unit.groupName ? `${unit.groupName} · ` : ""}{unit.active ? zh ? "监测中" : "Monitoring" : zh ? "已停用" : "Inactive"} · {statusLabels[unit.status] ?? (zh ? "尚无报告" : "No report yet")}</p>
        <p>{unit.gapPercent === null ? zh ? "比较证据不足" : "Insufficient comparison evidence" : `${zh ? "市场中位价差距" : "Market median gap"}: ${unit.gapPercent}%`}</p>
        {unit.reviewRange ? <p>{zh ? "按当前策略的参考范围" : "Review range under current strategy"}: {money(unit.reviewRange.lowMinor)}–{money(unit.reviewRange.highMinor)}</p> : null}
        <p>{zh ? "最近价格证据" : "Latest price evidence"}: {unit.asOf ? new Intl.DateTimeFormat(zh ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }).format(new Date(unit.asOf)) : "—"}</p>
        {unit.checkId ? <Link href={`/${locale}/account/checks/${unit.checkId}`}>{zh ? "查看报告" : "View report"}</Link> : null}
      </article>)}</div>}
      {selected.length ? <section className="membership-quote" aria-label={zh ? "房源策略" : "Object strategy"}><h2>{zh ? `编辑 ${selected.length} 个对象` : `Edit ${selected.length} object(s)`}</h2>
        <fieldset disabled={busy || Boolean(preview)} className="member-strategy-form"><legend>{zh ? "策略设置" : "Strategy settings"}</legend>
          {data.canBulk ? <label>{zh ? "分组名称（留空取消分组）" : "Group name (blank removes grouping)"}<input value={group} maxLength={60} onChange={event => setGroup(event.target.value)} /></label> : null}
          {(["minimumPriceMinor", "maximumPriceMinor"] as const).map((field, index) => <label key={field}>{zh ? ["最低每晚参考价 NZD", "最高每晚参考价 NZD"][index] : ["Minimum nightly review price NZD", "Maximum nightly review price NZD"][index]}<input type="number" min={0} step="0.01" value={strategy[field] === null ? "" : strategy[field]! / 100} onChange={event => setStrategy(value => ({ ...value, [field]: event.target.value === "" ? null : Math.round(Number(event.target.value) * 100) }))} /></label>)}
          <label>{zh ? "最大调整幅度 %" : "Maximum adjustment %"}<input type="number" min={1} max={100} value={strategy.maximumAdjustmentPercent} onChange={event => setStrategy(value => ({ ...value, maximumAdjustmentPercent: Number(event.target.value) }))} /></label>
          <label>{zh ? "提醒价差阈值 %" : "Alert gap threshold %"}<input type="number" min={1} max={100} value={strategy.alertThresholdPercent} onChange={event => setStrategy(value => ({ ...value, alertThresholdPercent: Number(event.target.value) }))} /></label>
          <label>{zh ? "最低建议置信度" : "Minimum recommendation confidence"}<select value={strategy.minimumConfidence} onChange={event => setStrategy(value => ({ ...value, minimumConfidence: event.target.value as MemberStrategy["minimumConfidence"] }))}><option value="LOW">{zh ? "低" : "Low"}</option><option value="MEDIUM">{zh ? "中" : "Medium"}</option><option value="HIGH">{zh ? "高" : "High"}</option></select></label>
          <label><input type="checkbox" checked={strategy.emailAlerts} onChange={event => setStrategy(value => ({ ...value, emailAlerts: event.target.checked }))} />{zh ? "发送重要提醒邮件" : "Email important alerts"}</label>
          {data.candidates.length ? <fieldset><legend>{zh ? "比较对象（证据要求保持不变）" : "Comparables (evidence requirements still apply)"}</legend>{data.candidates.map(item => <label key={item.id}>{item.name}<select value={strategy.excludedComparableUnitIds.includes(item.id) ? "exclude" : strategy.pinnedComparableUnitIds.includes(item.id) ? "pin" : "auto"} onChange={event => setStrategy(value => ({ ...value, excludedComparableUnitIds: [...value.excludedComparableUnitIds.filter(id => id !== item.id), ...(event.target.value === "exclude" ? [item.id] : [])], pinnedComparableUnitIds: [...value.pinnedComparableUnitIds.filter(id => id !== item.id), ...(event.target.value === "pin" ? [item.id] : [])] }))}><option value="auto">{zh ? "自动" : "Automatic"}</option><option value="pin">{zh ? "优先参考" : "Prefer"}</option><option value="exclude">{zh ? "排除" : "Exclude"}</option></select></label>)}</fieldset> : null}
        </fieldset>
        {preview ? <div role="region" aria-label={zh ? "确认策略修改" : "Confirm strategy change"}><p>{zh ? `将把以上策略应用于 ${preview.affectedCount} 个对象，并覆盖其现有设置。已生成的报告不改写。` : `Apply the settings above to ${preview.affectedCount} object(s), replacing their current settings. Existing reports remain unchanged.`}</p><button type="button" className="button button-secondary" disabled={busy} onClick={() => setPreview(null)}>{zh ? "返回修改" : "Back"}</button><button type="button" className="button button-primary" disabled={busy} onClick={() => void apply()}>{zh ? "确认保存" : "Confirm and save"}</button></div> : <button type="button" className="button button-primary" disabled={busy} onClick={() => void review()}>{zh ? "预览修改" : "Preview change"}</button>}
      </section> : null}
    </>}
  </Page>;
}
