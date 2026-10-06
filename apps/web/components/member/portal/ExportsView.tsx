"use client";

import { Download, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type MembershipSummary } from "../contracts";
import { Page, Loading, ErrorState } from "./shared";
import type { Locale, ApiPayload } from "../contracts";
import { api } from "./api";

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
  return <Page locale={locale} eyebrow={locale === "zh" ? "独立额度" : "INDEPENDENT ALLOWANCE"} title={locale === "zh" ? "数据导出" : "Data exports"} body={locale === "zh" ? "每月数据导出额度与价格检查额度分开计算。" : "Your monthly data-export allowance is separate from your Price Check allowance."}>
    {error ? <ErrorState message={error} /> : !summary ? <Loading locale={locale} /> : summary.entitlements.monthlyExportLimit === 0 ? <div className="feature-gate"><ShieldCheck aria-hidden="true" /><h2>{locale === "zh" ? "需要 Pro 或 Portfolio" : "Pro or Portfolio required"}</h2><Link className="button button-primary" href={`/${locale}/account/billing`}>{locale === "zh" ? "查看方案" : "Compare plans"}</Link></div> : !summary.featureAvailability.exports ? <div className="feature-gate"><ShieldCheck aria-hidden="true" /><h2>{locale === "zh" ? "即将开放" : "Coming soon"}</h2><p>{locale === "zh" ? "数据导出尚未通过当前环境的开放门槛。" : "Data exports have not passed the launch gate in this environment."}</p></div> : <div className="feature-gate"><Download aria-hidden="true" /><h2>{locale === "zh" ? `每个新西兰自然月 ${summary.entitlements.monthlyExportLimit} 次` : `${summary.entitlements.monthlyExportLimit} exports per New Zealand calendar month`}</h2><button className="button button-primary" disabled={busy} onClick={() => void download()}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Download aria-hidden="true" />}{locale === "zh" ? "下载 CSV" : "Download CSV"}</button></div>}
  </Page>;
}
