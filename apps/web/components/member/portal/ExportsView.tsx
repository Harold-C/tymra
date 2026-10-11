"use client";

import { Download, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type MembershipSummary, type Locale } from "../contracts";
import { Page, Loading, ErrorState } from "./shared";
import { api } from "./api";

type ExportItem = { id: string; createdAt: string; expiresAt: string; rowCount: number };
export function ExportsView({ locale }: { locale: Locale }) {
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);
  const zh = locale === "zh";
  useEffect(() => {
    void Promise.all([api<MembershipSummary>("/api/v1/customer/membership"), api<ExportItem[]>("/api/v1/customer/exports")])
      .then(([membership, reports]) => { setSummary(membership); setExports(reports); }).catch(caught => setError(String(caught.message ?? caught)));
  }, []);
  const create = async (exitExport = false) => {
    setBusy(true); setError(null);
    requestKey.current ??= crypto.randomUUID();
    try {
      await api("/api/v1/customer/exports", { method: "POST", headers: { "idempotency-key": requestKey.current }, body: JSON.stringify({ exitExport }) });
      setExports(await api<ExportItem[]>("/api/v1/customer/exports"));
      requestKey.current = null;
    } catch (caught) { setError(String((caught as Error).message)); } finally { setBusy(false); }
  };
  const exitAvailable = Boolean(summary?.historyGraceUntil && new Date(summary.historyGraceUntil) > new Date());
  return <Page locale={locale} eyebrow={zh ? "独立额度" : "INDEPENDENT ALLOWANCE"} title={zh ? "数据导出" : "Data exports"} body={zh ? "每个账期按生成的报告计数；同一报告重复下载CSV或Excel不再扣额。下载保留30天，离开旧方案时以历史宽限截止日为准。" : "Report generation is counted per billing period. Downloading the same report again as CSV or Excel uses no extra quota. Downloads remain available for 30 days, or until the exit grace deadline."}>
    {error ? <ErrorState message={error} /> : null}
    {!summary ? <Loading locale={locale} /> : <>
      {summary.entitlements.monthlyExportLimit > 0 && summary.featureAvailability.exports ? <div className="feature-gate"><Download aria-hidden="true" /><h2>{zh ? `每账期 ${summary.entitlements.monthlyExportLimit} 次` : `${summary.entitlements.monthlyExportLimit} reports per billing period`}</h2><button className="button button-primary" disabled={busy} onClick={() => void create()}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : null}{zh ? "生成新报告" : "Generate report"}</button></div> : <div className="feature-gate"><ShieldCheck aria-hidden="true" /><h2>{zh ? "导出需要已开放的Pro或Portfolio方案" : "Exports require an available Pro or Portfolio plan"}</h2><Link href={`/${locale}/account/billing`}>{zh ? "查看方案" : "Compare plans"}</Link></div>}
      {exitAvailable ? <div className="membership-notice"><p>{zh ? "旧历史宽限期内可免费生成离开方案的数据导出，不占商业额度。" : "During the history grace period, exit exports use no commercial allowance."}</p><button className="button button-secondary" disabled={busy} onClick={() => void create(true)}>{zh ? "导出保留的历史" : "Export retained history"}</button></div> : null}
      {exports.length ? <ul className="member-export-list">{exports.map(item => <li key={item.id}><span>{new Intl.DateTimeFormat(zh ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }).format(new Date(item.createdAt))} · {item.rowCount} {zh ? "行" : "rows"}</span><a className="button button-secondary" href={`/api/v1/customer/exports?id=${encodeURIComponent(item.id)}&format=csv`}>CSV</a><a className="button button-secondary" href={`/api/v1/customer/exports?id=${encodeURIComponent(item.id)}&format=xlsx`}>Excel</a></li>)}</ul> : null}
    </>}
  </Page>;
}
