"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type MembershipSummary } from "../contracts";
import { Page, Loading, ErrorState } from "./shared";
import type { Locale } from "../contracts";
import { api } from "./api";

export type CalendarData = { pricingUnit: MembershipSummary["pricingUnits"][number] | null; pricingUnits: MembershipSummary["pricingUnits"]; exactHorizonDays: number; monitoringHorizonDays: number; dates: Array<{ date: string; coverage: "EXACT_DAILY" | "MONITORING_ONLY"; observations: Array<{ source: string; amountMinor: number; nightlyAmountMinor: number; availabilityStatus: string; feeCompleteness: string; collectedAt: string }> }> };

export function PriceCalendar({ locale, initialPricingUnitId }: { locale: Locale; initialPricingUnitId?: string }) {
  const [data, setData] = useState<CalendarData | null>(null);
  const [unitId, setUnitId] = useState(initialPricingUnitId ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void api<CalendarData>(`/api/v1/customer/calendar${unitId ? `?pricingUnitId=${encodeURIComponent(unitId)}` : ""}`).then((value) => { setData(value); if (!unitId && value.pricingUnit) setUnitId(value.pricingUnit.id); }).catch((caught) => setError(String(caught.message ?? caught))); }, [unitId]);
  return <Page locale={locale} eyebrow={locale === "zh" ? "新西兰日期" : "NEW ZEALAND DATES"} title={locale === "zh" ? "未来价格日历" : "Future price calendar"} body={locale === "zh" ? "全部日期按 Pacific/Auckland 计算。精确逐日价格检查范围与长期市场监测范围明确区分。" : "All dates use Pacific/Auckland. The exact daily price-check window and longer market monitoring are labelled separately."}>
    {error ? <ErrorState message={error} /> : !data ? <Loading locale={locale} /> : !data.pricingUnit ? <div className="account-empty"><h2>{locale === "zh" ? "请先添加定价单位" : "Add a pricing unit first"}</h2><p>{locale === "zh" ? "完成首次价格检查后，确认的房源会自动加入价格日历。" : "Complete your first Price Check to add the confirmed property to this calendar."}</p><Link className="button button-primary" href={`/${locale}/address-check`}>{locale === "zh" ? "开始价格检查" : "Start a Price Check"}</Link></div> : <><div className="member-toolbar"><label><span>{locale === "zh" ? "定价单位" : "Pricing unit"}</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{data.pricingUnits.map((unit) => <option value={unit.id} key={unit.id}>{unit.propertyName} — {unit.unitName}</option>)}</select></label><div className="calendar-legend"><span><i className="exact" />{locale === "zh" ? `逐日价格检查 ${data.exactHorizonDays} 天` : `${data.exactHorizonDays}-day price-check window`}</span><span><i />{locale === "zh" ? `市场监测 ${data.monitoringHorizonDays} 天` : `${data.monitoringHorizonDays}-day monitoring`}</span></div></div><div className="price-calendar-grid">{data.dates.map((day) => <article key={day.date} className={day.coverage === "EXACT_DAILY" ? "is-exact" : ""}><div><time>{new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { month: "short", day: "numeric", weekday: "short", timeZone: "Pacific/Auckland" }).format(new Date(`${day.date}T12:00:00+12:00`))}</time><span>{day.coverage === "EXACT_DAILY" ? locale === "zh" ? "逐日检查" : "Daily check" : locale === "zh" ? "仅监测" : "Monitoring"}</span></div>{day.observations.length ? <ul>{day.observations.map((item) => <li key={item.source}><strong>{new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(item.amountMinor / 100)}</strong><small>{item.source} · {item.feeCompleteness}</small></li>)}</ul> : <p>{locale === "zh" ? "尚无公开 OTA 观测" : "No public OTA observation yet"}</p>}</article>)}</div></>}
  </Page>;
}
