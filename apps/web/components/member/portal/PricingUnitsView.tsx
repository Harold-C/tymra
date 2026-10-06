"use client";

import { Building2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type MembershipSummary } from "../contracts";
import { Page, Loading, ErrorState } from "./shared";
import type { Locale } from "../contracts";
import { api } from "./api";

export function PricingUnitsView({ locale }: { locale: Locale }) {
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<MembershipSummary>("/api/v1/customer/membership").then(setSummary).catch((caught) => setError(String(caught.message ?? caught)));
  useEffect(() => { void load(); }, []);
  const toggle = async (id: string, active: boolean) => { try { await api(`/api/v1/customer/membership/pricing-units/${id}`, { method: "PATCH", body: JSON.stringify({ active: !active }) }); await load(); } catch (caught) { setError(String((caught as Error).message)); } };
  return <Page locale={locale} eyebrow={locale === "zh" ? "房源" : "PROPERTIES"} title={locale === "zh" ? "房源额度" : "Property slots"} body={locale === "zh" ? "同一真实房源无论通过地址还是 OTA 链接分析，都只占一个房源额度。停用后额度保留 30 天，防止通过频繁更换地址规避计费。" : "The same physical property uses one slot whether analysed by address or OTA URL. A deactivated slot remains reserved for 30 days to prevent repeated address swapping."}>
    {error ? <ErrorState message={error} /> : !summary ? <Loading locale={locale} /> : <><div className="member-metric-grid"><article><span>{locale === "zh" ? "已占房源额度" : "Occupied property slots"}</span><strong>{summary.pricingUnits.filter((unit) => unit.occupiesSlot).length}/{summary.entitlements.activePricingUnitLimit}</strong></article><article><span>{locale === "zh" ? "监测范围" : "Monitoring horizon"}</span><strong>{summary.entitlements.monitoringHorizonDays} {locale === "zh" ? "天" : "days"}</strong></article></div>{summary.pricingUnits.length ? <div className="pricing-unit-grid">{summary.pricingUnits.map((unit) => <article key={unit.id}><Building2 aria-hidden="true" /><div><h2>{unit.propertyName}</h2><p>{unit.unitName}{unit.city ? ` · ${unit.city}` : ""}</p><small>{unit.active ? locale === "zh" ? "正在监测" : "Monitoring active" : unit.occupiesSlot && unit.slotRetainedUntil ? (locale === "zh" ? `已停用，额度保留至 ${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "Pacific/Auckland" }).format(new Date(unit.slotRetainedUntil))}` : `Inactive · slot retained until ${new Intl.DateTimeFormat("en-NZ", { dateStyle: "medium", timeZone: "Pacific/Auckland" }).format(new Date(unit.slotRetainedUntil))}`) : locale === "zh" ? "已停用，可替换" : "Inactive · replacement available"}</small></div><div><Link href={`/${locale}/account/pricing-units/${unit.id}`}>{locale === "zh" ? "查看详情" : "View details"}</Link><Link href={`/${locale}/account/calendar?pricingUnitId=${unit.id}`}>{locale === "zh" ? "查看日历" : "View calendar"}</Link><button onClick={() => void toggle(unit.id, unit.active)}>{unit.active ? locale === "zh" ? "停用" : "Deactivate" : locale === "zh" ? "启用" : "Activate"}</button></div></article>)}</div> : <div className="account-empty"><h2>{locale === "zh" ? "还没有房源" : "No properties yet"}</h2><p>{locale === "zh" ? "完成首个价格检查后，确认的真实房源会加入这里。" : "Complete your first Price Check to add the confirmed physical property."}</p><Link className="button button-primary" href={`/${locale}/address-check`}>{locale === "zh" ? "开始检查" : "Start a check"}</Link></div>}</>}
  </Page>;
}
