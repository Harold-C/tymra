"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "../contracts";
import { api } from "./api";
import { Page, Loading, ErrorState } from "./shared";

type Alerts = { alerts: { id: string; priceCheckId: string; createdAt: string; metadata: { kind: string; acknowledged?: boolean; gapPercent?: number } }[]; units: { id: string; name: string; version: number; emailAlerts: boolean }[] };
export function AlertsView({ locale }: { locale: Locale }) {
  const zh = locale === "zh"; const [data, setData] = useState<Alerts | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const reload = () => api<Alerts>("/api/v1/customer/alerts").then(setData);
  useEffect(() => { void reload().catch(error => setError(error.message)); }, []);
  const save = async (input: unknown) => { setBusy(true); setError(null); try { await api("/api/v1/customer/alerts", { method: "PATCH", body: JSON.stringify(input) }); await reload(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } };
  const names: Record<string, string> = zh ? { BELOW_MARKET: "值得复核的市场价差", HIGH_IMPACT_DATE: "重要日期", DATA_LIMITATION: "采集或证据受限" } : { BELOW_MARKET: "Market gap to review", HIGH_IMPACT_DATE: "High-impact date", DATA_LIMITATION: "Collection or evidence limitation" };
  return <Page locale={locale} eyebrow={zh ? "重要变化" : "IMPORTANT CHANGES"} title={zh ? "价格提醒" : "Price alerts"} body={zh ? "提醒基于已完成的检查，每个对象同类提醒每天最多一次。邮件设置不会影响报告保留。" : "Alerts follow completed checks, with at most one alert of each kind per object per day. Email preferences do not affect retained reports."}>
    {error ? <ErrorState message={error} /> : null}
    {!data ? error ? <Link href={`/${locale}/account/billing`}>{zh ? "查看方案" : "Compare plans"}</Link> : <Loading locale={locale} /> : <>
      <fieldset disabled={busy}><legend>{zh ? "重要提醒邮件" : "Important alert emails"}</legend>{data.units.map(unit => <label className="member-alert-preference" key={unit.id}><input type="checkbox" checked={unit.emailAlerts} onChange={event => void save({ unitId: unit.id, version: unit.version, emailAlerts: event.target.checked })} />{unit.name}</label>)}</fieldset>
      {data.alerts.length ? <div className="member-strategy-units">{data.alerts.map(alert => <article key={alert.id}><h2>{names[alert.metadata.kind] ?? alert.metadata.kind}</h2><p>{new Intl.DateTimeFormat(zh ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }).format(new Date(alert.createdAt))}</p>{typeof alert.metadata.gapPercent === "number" ? <p>{alert.metadata.gapPercent}%</p> : null}<Link href={`/${locale}/account/checks/${alert.priceCheckId}`}>{zh ? "查看依据" : "View evidence"}</Link>{alert.metadata.acknowledged ? <p>{zh ? "已处理" : "Acknowledged"}</p> : <button type="button" className="button button-secondary" disabled={busy} onClick={() => void save({ alertId: alert.id, acknowledged: true })}>{zh ? "标记已处理" : "Acknowledge"}</button>}</article>)}</div> : <p>{zh ? "目前没有需要处理的提醒。" : "No alerts need attention."}</p>}
    </>}
  </Page>;
}
