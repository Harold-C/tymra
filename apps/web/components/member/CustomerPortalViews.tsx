"use client";

import { AlertTriangle, Building2, CalendarDays, CheckCircle2, Download, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MembershipPanel, type CheckListItem, type MembershipPlan, type MembershipSummary } from "./CustomerAccountViews";

type Locale = "en" | "zh";
type ApiPayload<T> = { data?: T; error?: { message?: string } };

function Page({ locale, eyebrow, title, body, children }: { locale: Locale; eyebrow: string; title: string; body: string; children: React.ReactNode }) {
  return <section className="member-page"><div className="rough-shell"><span className="rough-eyebrow">{eyebrow}</span><h1>{title}</h1><p className="member-page-intro">{body}</p>{children}</div></section>;
}

function Loading({ locale }: { locale: Locale }) {
  return <div className="loading-state"><LoaderCircle className="spin" aria-hidden="true" /><span>{locale === "zh" ? "正在加载会员数据" : "Loading member data"}</span></div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="flow-notice notice-danger"><AlertTriangle aria-hidden="true" /><div><strong>Unable to load</strong><p>{message}</p></div></div>;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  const payload = await response.json() as ApiPayload<T>;
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The request could not be completed.");
  return payload.data;
}

export function ChecksHistory({ locale }: { locale: Locale }) {
  const [checks, setChecks] = useState<CheckListItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void api<CheckListItem[]>("/api/v1/customer/checks").then(setChecks).catch((caught) => setError(String(caught.message ?? caught))); }, []);
  const filtered = useMemo(() => (checks ?? []).filter((check) => (status === "ALL" || check.status === status) && `${check.property?.canonicalName ?? ""} ${check.unit?.officialName ?? ""}`.toLowerCase().includes(query.toLowerCase())), [checks, query, status]);
  const pageSize = 10;
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize);
  const title = locale === "zh" ? "价格检查历史" : "Price Check history";
  return <Page locale={locale} eyebrow={locale === "zh" ? "报告" : "REPORTS"} title={title} body={locale === "zh" ? "查找、筛选并重新打开属于你的历史报告。" : "Find, filter and reopen reports that belong to your account."}>
    <div className="member-toolbar"><label><span>{locale === "zh" ? "搜索" : "Search"}</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label><label><span>{locale === "zh" ? "状态" : "Status"}</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">{locale === "zh" ? "全部" : "All"}</option>{[...new Set((checks ?? []).map((item) => item.status))].map((value) => <option key={value}>{value}</option>)}</select></label><Link className="button button-primary" href={`/${locale}/address-check`}>{locale === "zh" ? "新建检查" : "New Price Check"}</Link></div>
    {error ? <ErrorState message={error} /> : !checks ? <Loading locale={locale} /> : shown.length ? <><div className="account-check-list">{shown.map((check) => <Link href={`/${locale}/account/checks/${check.id}`} key={check.id}><span>{check.property?.canonicalName ?? title}</span><strong>{check.status}</strong><small>{check.unit?.officialName} · {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeZone: "Pacific/Auckland" }).format(new Date(check.createdAt))}</small></Link>)}</div><div className="member-pagination"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>{locale === "zh" ? "上一页" : "Previous"}</button><span>{page} / {Math.max(1, Math.ceil(filtered.length / pageSize))}</span><button disabled={page * pageSize >= filtered.length} onClick={() => setPage((value) => value + 1)}>{locale === "zh" ? "下一页" : "Next"}</button></div></> : <div className="account-empty"><h2>{locale === "zh" ? "没有匹配的检查" : "No matching checks"}</h2></div>}
  </Page>;
}

export function PricingUnitsView({ locale }: { locale: Locale }) {
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<MembershipSummary>("/api/v1/customer/membership").then(setSummary).catch((caught) => setError(String(caught.message ?? caught)));
  useEffect(() => { void load(); }, []);
  const toggle = async (id: string, active: boolean) => { try { await api(`/api/v1/customer/membership/pricing-units/${id}`, { method: "PATCH", body: JSON.stringify({ active: !active }) }); await load(); } catch (caught) { setError(String((caught as Error).message)); } };
  return <Page locale={locale} eyebrow={locale === "zh" ? "房源" : "PROPERTIES"} title={locale === "zh" ? "房源额度" : "Property slots"} body={locale === "zh" ? "同一真实房源无论通过地址还是 OTA 链接分析，都只占一个房源额度。停用后额度保留 30 天，防止通过频繁更换地址规避计费。" : "The same physical property uses one slot whether analysed by address or OTA URL. A deactivated slot remains reserved for 30 days to prevent repeated address swapping."}>
    {error ? <ErrorState message={error} /> : !summary ? <Loading locale={locale} /> : <><div className="member-metric-grid"><article><span>{locale === "zh" ? "已占房源额度" : "Occupied property slots"}</span><strong>{summary.pricingUnits.filter((unit) => unit.occupiesSlot).length}/{summary.entitlements.activePricingUnitLimit}</strong></article><article><span>{locale === "zh" ? "监测范围" : "Monitoring horizon"}</span><strong>{summary.entitlements.monitoringHorizonDays} {locale === "zh" ? "天" : "days"}</strong></article></div>{summary.pricingUnits.length ? <div className="pricing-unit-grid">{summary.pricingUnits.map((unit) => <article key={unit.id}><Building2 aria-hidden="true" /><div><h2>{unit.propertyName}</h2><p>{unit.unitName}{unit.city ? ` · ${unit.city}` : ""}</p><small>{unit.active ? locale === "zh" ? "正在监测" : "Monitoring active" : unit.occupiesSlot && unit.slotRetainedUntil ? (locale === "zh" ? `已停用，额度保留至 ${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "Pacific/Auckland" }).format(new Date(unit.slotRetainedUntil))}` : `Inactive · slot retained until ${new Intl.DateTimeFormat("en-NZ", { dateStyle: "medium", timeZone: "Pacific/Auckland" }).format(new Date(unit.slotRetainedUntil))}`) : locale === "zh" ? "已停用，可替换" : "Inactive · replacement available"}</small></div><div><Link href={`/${locale}/account/calendar?pricingUnitId=${unit.id}`}>{locale === "zh" ? "查看日历" : "View calendar"}</Link><button onClick={() => void toggle(unit.id, unit.active)}>{unit.active ? locale === "zh" ? "停用" : "Deactivate" : locale === "zh" ? "启用" : "Activate"}</button></div></article>)}</div> : <div className="account-empty"><h2>{locale === "zh" ? "还没有房源" : "No properties yet"}</h2><p>{locale === "zh" ? "完成首个价格检查后，确认的真实房源会加入这里。" : "Complete your first Price Check to add the confirmed physical property."}</p><Link className="button button-primary" href={`/${locale}/address-check`}>{locale === "zh" ? "开始检查" : "Start a check"}</Link></div>}</>}
  </Page>;
}

type CalendarData = { pricingUnit: MembershipSummary["pricingUnits"][number] | null; pricingUnits: MembershipSummary["pricingUnits"]; exactHorizonDays: number; monitoringHorizonDays: number; dates: Array<{ date: string; coverage: "EXACT_DAILY" | "MONITORING_ONLY"; observations: Array<{ source: string; amountMinor: number; nightlyAmountMinor: number; availabilityStatus: string; feeCompleteness: string; collectedAt: string }> }> };

export function PriceCalendar({ locale, initialPricingUnitId }: { locale: Locale; initialPricingUnitId?: string }) {
  const [data, setData] = useState<CalendarData | null>(null);
  const [unitId, setUnitId] = useState(initialPricingUnitId ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void api<CalendarData>(`/api/v1/customer/calendar${unitId ? `?pricingUnitId=${encodeURIComponent(unitId)}` : ""}`).then((value) => { setData(value); if (!unitId && value.pricingUnit) setUnitId(value.pricingUnit.id); }).catch((caught) => setError(String(caught.message ?? caught))); }, [unitId]);
  return <Page locale={locale} eyebrow={locale === "zh" ? "新西兰日期" : "NEW ZEALAND DATES"} title={locale === "zh" ? "未来价格日历" : "Future price calendar"} body={locale === "zh" ? "全部日期按 Pacific/Auckland 计算。精确逐日价格检查范围与长期市场监测范围明确区分。" : "All dates use Pacific/Auckland. The exact daily price-check window and longer market monitoring are labelled separately."}>
    {error ? <ErrorState message={error} /> : !data ? <Loading locale={locale} /> : !data.pricingUnit ? <div className="account-empty"><h2>{locale === "zh" ? "请先添加定价单位" : "Add a pricing unit first"}</h2></div> : <><div className="member-toolbar"><label><span>{locale === "zh" ? "定价单位" : "Pricing unit"}</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{data.pricingUnits.map((unit) => <option value={unit.id} key={unit.id}>{unit.propertyName} — {unit.unitName}</option>)}</select></label><div className="calendar-legend"><span><i className="exact" />{locale === "zh" ? `逐日价格检查 ${data.exactHorizonDays} 天` : `${data.exactHorizonDays}-day price-check window`}</span><span><i />{locale === "zh" ? `市场监测 ${data.monitoringHorizonDays} 天` : `${data.monitoringHorizonDays}-day monitoring`}</span></div></div><div className="price-calendar-grid">{data.dates.map((day) => <article key={day.date} className={day.coverage === "EXACT_DAILY" ? "is-exact" : ""}><div><time>{new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { month: "short", day: "numeric", weekday: "short", timeZone: "Pacific/Auckland" }).format(new Date(`${day.date}T12:00:00+12:00`))}</time><span>{day.coverage === "EXACT_DAILY" ? locale === "zh" ? "逐日检查" : "Daily check" : locale === "zh" ? "仅监测" : "Monitoring"}</span></div>{day.observations.length ? <ul>{day.observations.map((item) => <li key={item.source}><strong>{new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(item.amountMinor / 100)}</strong><small>{item.source} · {item.feeCompleteness}</small></li>)}</ul> : <p>{locale === "zh" ? "尚无公开 OTA 观测" : "No public OTA observation yet"}</p>}</article>)}</div></>}
  </Page>;
}

export function BillingView({ locale }: { locale: Locale }) {
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void api<MembershipSummary>("/api/v1/customer/membership").then(setSummary).catch((caught) => setError(String(caught.message ?? caught))); }, []);
  return <Page locale={locale} eyebrow={locale === "zh" ? "会员" : "MEMBERSHIP"} title={locale === "zh" ? "方案与账单" : "Plan and billing"} body={locale === "zh" ? "查看权益、周期、续费状态并通过 Stripe 安全管理付款方式。" : "Review entitlements, renewal state and manage payment details securely through Stripe."}>{error ? <ErrorState message={error} /> : summary ? <MembershipPanel locale={locale} membership={summary} /> : <Loading locale={locale} />}</Page>;
}

type SettingsData = { email: string; locale: Locale; marketingConsent: boolean; hasPassword: boolean; emailVerified: boolean; benefitGroupId: string | null; dataRequests: Array<{ id: string; type: string; status: string; requestedAt: string }> };

export function SettingsView({ locale }: { locale: Locale }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const load = () => api<SettingsData>("/api/v1/customer/settings").then(setData).catch((caught) => setError(String(caught.message ?? caught)));
  useEffect(() => { void load(); }, []);
  const save = async () => { if (!data) return; try { await api("/api/v1/customer/settings", { method: "PATCH", body: JSON.stringify({ locale: data.locale, marketingConsent: data.marketingConsent }) }); setMessage(locale === "zh" ? "设置已保存。" : "Settings saved."); } catch (caught) { setError(String((caught as Error).message)); } };
  const requestData = async (type: "EXPORT" | "DELETE") => { try { await api("/api/v1/customer/settings", { method: "POST", body: JSON.stringify({ type }) }); setMessage(locale === "zh" ? "请求已提交。" : "Request submitted."); await load(); } catch (caught) { setError(String((caught as Error).message)); } };
  const resendVerification = async () => { try { await api("/api/v1/customer/auth/verify-email", { method: "POST", body: "{}" }); setMessage(locale === "zh" ? "验证邮件已发送。" : "Verification email sent."); } catch (caught) { setError(String((caught as Error).message)); } };
  const changePassword = async () => {
    if (newPassword !== confirmPassword) return setError(locale === "zh" ? "两次输入的新密码不一致。" : "The new passwords do not match.");
    try {
      await api("/api/v1/customer/auth/password", { method: "PUT", body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }) });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setMessage(locale === "zh" ? "密码已更新，其他设备已退出。" : "Password updated. Other devices have been signed out."); await load();
    } catch (caught) { setError(String((caught as Error).message)); }
  };
  const signOutAll = async () => { await api("/api/v1/customer/session", { method: "DELETE", body: JSON.stringify({ allSessions: true }) }); window.location.assign(`/${locale}`); };
  return <Page locale={locale} eyebrow={locale === "zh" ? "账户" : "ACCOUNT"} title={locale === "zh" ? "账户设置" : "Account settings"} body={locale === "zh" ? "管理语言、独立营销同意、会话及个人数据请求。" : "Manage language, separate marketing consent, sessions and personal-data requests."}>
    {error ? <ErrorState message={error} /> : !data ? <Loading locale={locale} /> : <div className="settings-grid"><section><h2>{locale === "zh" ? "资料与偏好" : "Profile and preferences"}</h2><label><span>Email · {data.emailVerified ? "VERIFIED" : "UNVERIFIED"}</span><input value={data.email} disabled /></label>{!data.emailVerified ? <button className="button button-secondary" onClick={() => void resendVerification()}>{locale === "zh" ? "重新发送验证邮件" : "Resend verification email"}</button> : null}<label><span>{locale === "zh" ? "语言" : "Language"}</span><select value={data.locale} onChange={(event) => setData({ ...data, locale: event.target.value as Locale })}><option value="en">English</option><option value="zh">中文</option></select></label><label className="checkbox-row"><input type="checkbox" checked={data.marketingConsent} onChange={(event) => setData({ ...data, marketingConsent: event.target.checked })} /><span>{locale === "zh" ? "接收营销信息（不影响服务邮件）" : "Receive marketing messages (service emails remain separate)"}</span></label><button className="button button-primary" onClick={() => void save()}>{locale === "zh" ? "保存" : "Save"}</button></section><section><h2>{locale === "zh" ? "密码与安全" : "Password and security"}</h2>{data.hasPassword ? <label><span>{locale === "zh" ? "当前密码" : "Current password"}</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label> : null}<label><span>{locale === "zh" ? "新密码（至少 12 个字符）" : "New password (12+ characters)"}</span><input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label><span>{locale === "zh" ? "确认新密码" : "Confirm new password"}</span><input type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label><button className="button button-primary" disabled={newPassword.length < 12 || (data.hasPassword && !currentPassword)} onClick={() => void changePassword()}>{data.hasPassword ? locale === "zh" ? "修改密码" : "Change password" : locale === "zh" ? "创建密码" : "Create password"}</button><button className="button button-secondary" onClick={() => void signOutAll()}>{locale === "zh" ? "退出所有设备" : "Sign out all devices"}</button></section><section><h2>{locale === "zh" ? "个人数据" : "Personal data"}</h2><button className="button button-secondary" onClick={() => void requestData("EXPORT")}><Download aria-hidden="true" />{locale === "zh" ? "申请数据导出" : "Request data export"}</button><button className="button button-secondary danger" onClick={() => void requestData("DELETE")}>{locale === "zh" ? "申请删除账户" : "Request account deletion"}</button>{data.dataRequests.length ? <ul className="data-request-list">{data.dataRequests.map((item) => <li key={item.id}><span>{item.type}</span><strong>{item.status}</strong></li>)}</ul> : null}</section></div>}
    {message ? <div className="flow-notice notice-success"><CheckCircle2 aria-hidden="true" /><div><p>{message}</p></div></div> : null}
    <RiskAppeals locale={locale} />
  </Page>;
}

function RiskAppeals({ locale }: { locale: Locale }) {
  type RiskCase = { id: string; status: string; outcome: string; action: string; reasonCodes: string[]; cooldownUntil: string | null; appealReason: string | null };
  const [cases, setCases] = useState<RiskCase[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(() => api<{ cases: RiskCase[] }>("/api/v1/customer/risk").then((value) => setCases(value.cases)), []);
  useEffect(() => { void load(); }, [load]);
  const appeal = async (caseId: string) => {
    try {
      await api("/api/v1/customer/risk", { method: "POST", body: JSON.stringify({ caseId, reason: reasons[caseId] ?? "" }) });
      setMessage(locale === "zh" ? "申诉已提交，采集限制将在复核后更新。" : "Appeal submitted. Collection restrictions update after review.");
      await load();
    } catch (caught) { setMessage(String((caught as Error).message)); }
  };
  const openCases = cases?.filter((item) => item.status === "OPEN") ?? [];
  if (!cases || openCases.length === 0) return null;
  return <section className="settings-grid"><section><h2>{locale === "zh" ? "采集限制与申诉" : "Collection restrictions and appeals"}</h2>{openCases.map((item) => <div key={item.id}><p><strong>{item.action} · {item.outcome}</strong><br />{item.reasonCodes.join(", ")}</p>{item.appealReason ? <p>{locale === "zh" ? "申诉已提交" : "Appeal submitted"}: {item.appealReason}</p> : <><label><span>{locale === "zh" ? "说明合法使用场景（至少 20 字）" : "Explain the legitimate use case (20+ characters)"}</span><textarea value={reasons[item.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [item.id]: event.target.value })} minLength={20} maxLength={2_000} /></label><button className="button button-secondary" disabled={(reasons[item.id]?.trim().length ?? 0) < 20} onClick={() => void appeal(item.id)}>{locale === "zh" ? "提交申诉" : "Submit appeal"}</button></>}</div>)}</section>{message ? <p>{message}</p> : null}</section>;
}

export function ExportsView({ locale }: { locale: Locale }) {
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void api<MembershipSummary>("/api/v1/customer/membership").then(setSummary).catch((caught) => setError(String(caught.message ?? caught))); }, []);
  const download = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/v1/customer/exports", { headers: { "idempotency-key": crypto.randomUUID() } });
      if (!response.ok) {
        const payload = await response.json() as ApiPayload<never>;
        throw new Error(payload.error?.message ?? "Export failed");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `tymra-price-checks-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (caught) { setError(String((caught as Error).message)); } finally { setBusy(false); }
  };
  return <Page locale={locale} eyebrow={locale === "zh" ? "独立额度" : "INDEPENDENT QUOTA"} title={locale === "zh" ? "数据导出" : "Data exports"} body={locale === "zh" ? "导出额度与价格检查额度分开计算；重复提交同一幂等键不会重复扣减。" : "Export allowance is independent from Price Checks; replaying the same idempotency key does not count twice."}>
    {error ? <ErrorState message={error} /> : !summary ? <Loading locale={locale} /> : summary.entitlements.monthlyExportLimit === 0 ? <div className="feature-gate"><ShieldCheck aria-hidden="true" /><h2>{locale === "zh" ? "需要 Pro 或 Portfolio" : "Pro or Portfolio required"}</h2><Link className="button button-primary" href={`/${locale}/account/billing`}>{locale === "zh" ? "查看方案" : "Compare plans"}</Link></div> : <div className="feature-gate"><Download aria-hidden="true" /><h2>{locale === "zh" ? `每个新西兰自然月 ${summary.entitlements.monthlyExportLimit} 次` : `${summary.entitlements.monthlyExportLimit} exports per New Zealand calendar month`}</h2><button className="button button-primary" disabled={busy} onClick={() => void download()}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Download aria-hidden="true" />}{locale === "zh" ? "下载 CSV" : "Download CSV"}</button></div>}
  </Page>;
}

const planOrder: Record<MembershipPlan, number> = { FREE: 0, HOST: 1, PRO: 2, PORTFOLIO: 3 };
export function GatedFeatureView({ locale, feature, minimumPlan, launched = false }: { locale: Locale; feature: "alerts" | "portfolio" | "exports" | "integrations"; minimumPlan: MembershipPlan; launched?: boolean }) {
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  useEffect(() => { void api<MembershipSummary>("/api/v1/customer/membership").then(setSummary); }, []);
  const names = { alerts: locale === "zh" ? "价格提醒" : "Price alerts", portfolio: locale === "zh" ? "组合管理" : "Portfolio", exports: locale === "zh" ? "数据导出" : "Data exports", integrations: locale === "zh" ? "系统集成" : "Integrations" };
  const entitled = summary ? planOrder[summary.plan] >= planOrder[minimumPlan] : false;
  return <Page locale={locale} eyebrow="MEMBERSHIP FEATURE" title={names[feature]} body={locale === "zh" ? "此功能同时受会员权益和独立上线开关控制。" : "This feature is controlled by both plan entitlement and an independent launch gate."}>{!summary ? <Loading locale={locale} /> : <div className="feature-gate"><ShieldCheck aria-hidden="true" /><h2>{!entitled ? locale === "zh" ? `需要 ${minimumPlan} 或更高方案` : `${minimumPlan} or higher required` : !launched ? locale === "zh" ? "功能尚未完成生产验收" : "Feature has not passed production launch acceptance" : locale === "zh" ? "功能可用" : "Feature available"}</h2><p>{locale === "zh" ? "系统不会把未开放能力伪装为可用。已有价格检查和报告不受影响。" : "Tymra does not present unavailable capabilities as active. Existing Price Checks and reports are unaffected."}</p>{!entitled ? <Link className="button button-primary" href={`/${locale}/account/billing`}>{locale === "zh" ? "查看方案" : "Compare plans"}</Link> : null}</div>}</Page>;
}
